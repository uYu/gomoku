import { initial, play, winningLine } from './engine.ts';
import type { Analysis, Difficulty, Engine, Position, Rule } from './types.ts';

export interface RapfiModule { sendCommand: (command: string) => void }
export interface SearchRequest { position: Position; moves?: number[]; rule: Rule; difficulty: Difficulty; engine?: Engine; timeMs?: number; maxNodes?: number; assetBase?: string; balance?: boolean; beginnerTrial?: boolean; fullStrength?: boolean }
export const LIMITS = {
  easy: { time: 40, depth: 1, strength: 0, nodes: 256 },
  normal: { time: 600, depth: 40, strength: 20, nodes: 0 },
  hard: { time: 2200, depth: 99, strength: 95, nodes: 0 },
} as const;

export function analysisFromLines(lines: string[], position: Position, elapsed: number, engine: Engine): Analysis {
  const error = lines.find(line => /^(ERROR|FATAL)/.test(line));
  if (error) throw new Error(error);
  const answer = lines.map(line => /^(\d+),(\d+)$/.exec(line.trim())).filter(Boolean).at(-1);
  if (!answer) throw new Error('C++ 引擎没有返回落点');
  const x = Number(answer[1]), y = Number(answer[2]), move = y * 15 + x;
  if (x < 0 || x > 14 || y < 0 || y > 14 || position.board[move]) throw new Error('C++ 引擎返回了非法落点');
  const info = (name: string) => {
    const prefix = `INFO ${name} `;
    return lines.map(line => line.replace(/^MESSAGE /, '')).filter(line => line.startsWith(prefix)).at(-1)?.slice(prefix.length) ?? '';
  };
  return { move, elapsed, engine, depth: Number(info('DEPTH')) || 0, score: Number(info('EVAL')) || 0, nodes: Number(info('TOTALNODES')) || 0, nps: Number(info('SPEED')) || 0, pv: info('BESTLINE') };
}

// BOARD uses relative sides (1 = engine, 2 = opponent). The first listed stone
// must be black; sorting a raw board by square would silently swap some colors.
export function boardCommand(position: Position, rule: Rule, moves?: number[]): string {
  if (position.over || position.board.length !== 225 || ![1, 2].includes(position.turn) || position.board.some(value => ![0, 1, 2].includes(value))) throw new Error('无效或已结束的局面');
  const black = position.board.flatMap((color, move) => color === 1 ? [move] : []);
  const white = position.board.flatMap((color, move) => color === 2 ? [move] : []);
  if (black.length !== white.length + (position.turn === 2 ? 1 : 0) || position.ply !== black.length + white.length) throw new Error('局面行棋方与棋子数量不一致');
  let order: number[];
  if (moves) {
    let replayed = initial();
    for (const move of moves) replayed = play(replayed, move, rule);
    if (replayed.over || replayed.turn !== position.turn || replayed.board.some((value, i) => value !== position.board[i])) throw new Error('棋谱与当前局面不一致');
    order = moves;
  } else {
    for (let move = 0; move < 225; move++) if (position.board[move] && winningLine(position.board, move, rule).length) throw new Error('局面已经出现胜负');
    order = black.flatMap((move, index) => index < white.length ? [move, white[index]] : [move]);
  }
  return ['BOARD', ...order.map(move => `${move % 15},${Math.floor(move / 15)},${position.board[move] === position.turn ? 1 : 2}`), 'DONE'].join('\n');
}

export class RapfiSession {
  module?: RapfiModule;
  started = false;
  selected: Engine = 'rapfi';
  lastStrength?: number;
  lines: string[] = [];
  attach(module: RapfiModule) { this.module = module; }
  receive(line: string) { this.lines.push(line); }
  analyze(request: SearchRequest): Analysis {
    const { position, rule, moves, difficulty, engine = 'rapfi' } = request;
    const command = boardCommand(position, rule, moves);
    const limits = LIMITS[difficulty];
    if (!limits || !['rapfi', 'trained'].includes(engine)) throw new Error('无效的引擎或难度');
    const strength = request.fullStrength ? 100 : limits.strength;
    this.lines = [];
    const send = (text: string) => {
      if (!this.module) throw new Error('C++ 引擎尚未初始化');
      this.module.sendCommand(text);
      const error = this.lines.find(line => /^(ERROR|FATAL)/.test(line));
      if (error) throw new Error(`C++ 引擎错误：${error.slice(0, 200)}`);
    };
    if (engine !== this.selected) {
      send(`RELOADCONFIG /${engine === 'trained' ? 'trained' : 'config'}.toml`);
      send('YXHASHCLEAR'); this.selected = engine;
    }
    if (!this.started) { send('START 15'); this.started = true; }
    send(`INFO RULE ${rule === 'renju' ? 4 : rule === 'exact' ? 1 : 0}`);
    send('INFO PONDERING 0'); send('INFO USEDATABASE 0'); send('INFO SWAPABLE 0');
    send('INFO TIMEOUT_MATCH 0');
    // Full-strength hints must not lend their deep TT entries to a weaker turn.
    if (difficulty === 'easy' || this.lastStrength !== undefined && this.lastStrength > strength) send('YXHASHCLEAR');
    send(`INFO TIMEOUT_TURN ${Math.max(1, Math.min(5000, Math.round(request.timeMs ?? limits.time)))}`);
    send(`INFO MAX_DEPTH ${limits.depth}`);
    send(`INFO MAX_NODE ${request.maxNodes ?? limits.nodes}`);
    send(`INFO STRENGTH ${strength}`); this.lastStrength = strength;
    send('INFO SHOW_DETAIL 2');
    // Single-thread Wasm runs the bounded C++ search synchronously in a worker.
    const began = performance.now(); send(command);
    const elapsed = performance.now() - began;
    const result = analysisFromLines(this.lines, position, elapsed, engine);
    // Every returned move, including experimental models, obeys the same rules as the UI.
    if (play(position, result.move, rule).ending === 'forbidden') throw new Error('C++ 引擎返回了禁手落点');
    return result;
  }
}
