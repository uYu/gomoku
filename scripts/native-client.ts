import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { analysisFromLines, boardCommand, LIMITS } from '../src/game/rapfi-protocol.ts';
import type { SearchRequest } from '../src/game/rapfi-protocol.ts';
import { loadNodeRules } from './rules-client.ts';
import { play } from '../src/game/engine.ts';
import { policyFromLines } from './zero-policy.ts';
import type { Rule } from '../src/game/types.ts';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export class NativeRapfi {
  child;
  lines: string[] = [];
  lastStrength?: number;
  pending?: { match: (line: string) => boolean; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  ready: Promise<void>;
  constructor(configuration = 'config.toml', executable = resolve(ROOT, '.build/native/bin/pbrain-rapfi')) {
    this.child = spawn(executable, ['--config', resolve(ROOT, 'models/rapfi', configuration)], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        this.lines.push(line);
        if (/^(ERROR|FATAL)/.test(line)) this.fail(new Error(line));
        else if (this.pending?.match(line)) {
          const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer); pending.resolve();
        }
      }
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', text => this.fail(new Error(text.slice(0, 500))));
    // A stop signal can close the child's pipe before close() sends END.
    // Reject an active request, or ignore the expected shutdown-time error.
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('error', error => this.fail(error));
    this.child.on('exit', code => this.fail(new Error(`Rapfi exited (${code})`)));
    this.ready = this.waitFor(line => line === 'OK'); this.send('START 15');
  }
  private fail(error: Error) { const pending = this.pending; this.pending = undefined; if (pending) { clearTimeout(pending.timer); pending.reject(error); } }
  private waitFor(match: (line: string) => boolean) {
    if (this.pending) throw new Error('Only one search may run at a time');
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending = undefined; this.child.kill(); reject(new Error('Rapfi timed out')); }, 30_000);
      this.pending = { match, resolve, reject, timer };
    });
  }
  private send(command: string) { this.child.stdin.write(command + '\n'); }
  async analyze(request: SearchRequest) {
    await this.ready; await loadNodeRules();
    const command = boardCommand(request.position, request.rule, request.moves);
    const limits = LIMITS[request.difficulty];
    const strength = request.fullStrength ? 100 : limits.strength;
    this.lines = [];
    const finished = this.waitFor(line => /^\d+,\d+$/.test(line));
    this.send(`INFO RULE ${request.rule === 'renju' ? 4 : request.rule === 'exact' ? 1 : 0}`);
    this.send('INFO PONDERING 0'); this.send('INFO USEDATABASE 0'); this.send('INFO SWAPABLE 0'); this.send('INFO THREAD_NUM 1');
    this.send('INFO TIMEOUT_MATCH 0');
    if (request.difficulty === 'easy' || this.lastStrength !== undefined && this.lastStrength > strength) this.send('YXHASHCLEAR');
    this.send(`INFO TIMEOUT_TURN ${request.timeMs ?? limits.time}`);
    this.send(`INFO MAX_DEPTH ${limits.depth}`); this.send(`INFO MAX_NODE ${request.maxNodes ?? limits.nodes}`);
    this.send(`INFO STRENGTH ${strength}`); this.lastStrength = strength; this.send('INFO SHOW_DETAIL 2');
    const began = performance.now();
    if (request.balance) { this.send(command.replace(/^BOARD/, 'YXBOARD')); this.send('YXBALANCEONE 0'); }
    else this.send(command);
    await finished;
    const result = analysisFromLines(this.lines, request.position, performance.now() - began, request.engine ?? 'rapfi');
    if (play(request.position, result.move, request.rule).ending === 'forbidden') throw new Error('C++ 引擎返回了禁手落点');
    return result;
  }
  async policy(request: Pick<SearchRequest, 'position' | 'moves' | 'rule' | 'engine'>, guardFour = false, modelRule: Rule = request.rule) {
    await this.ready; await loadNodeRules();
    const command = boardCommand(request.position, request.rule, request.moves);
    this.lines = [];
    const finished = this.waitFor(line => line === 'MESSAGE NNPOLICY DONE');
    // Select the network independently of the actual game's legality mask.
    this.send(`INFO RULE ${modelRule === 'renju' ? 4 : modelRule === 'exact' ? 1 : 0}`);
    this.send('INFO PONDERING 0'); this.send('INFO USEDATABASE 0');
    const began = performance.now();
    this.send(command.replace(/^BOARD/, 'YXBOARD'));
    this.send('NNPOLICY');
    await finished;
    const result = policyFromLines(this.lines, request.position, request.rule, performance.now() - began, guardFour, request.engine);
    if (play(request.position,result.move,request.rule).ending === 'forbidden') throw new Error('神经策略返回了禁手落点');
    return {...result,modelRule};
  }
  async reset() { await this.ready; const ready = this.waitFor(line => line === 'OK'); this.send('RESTART'); await ready; }
  async close() {
    if (this.child.exitCode !== null || this.child.killed) return;
    const exited = new Promise<void>(resolve => this.child.once('exit', () => resolve()));
    this.child.stdin.end('END\n'); const timer = setTimeout(() => this.child.kill(), 3000);
    await exited; clearTimeout(timer);
  }
}
