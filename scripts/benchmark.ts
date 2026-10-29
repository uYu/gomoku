import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { NativeRapfi, ROOT } from './native-client.ts';
import { analyze as legacyAnalyze } from '../src/game/ai.ts';
import { initial, play, replay } from '../src/game/engine.ts';
import type { Color, Rule } from '../src/game/types.ts';
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const first = option('first', 'trained'), second = option('second', 'nnue');
const pairs = Number(option('pairs', '8')), timeMs = Number(option('time', '100'));
const rule = option('rule', 'renju') as Rule;
const search = option('search', 'ab');
if (!['ab','policy'].includes(search)) throw new Error('Unknown search mode');
const directGuard = search === 'policy' && !args.includes('--no-direct-guard');
if (search === 'policy' && [first,second].includes('legacy')) throw new Error('Policy mode requires neural engines');
if (!['renju', 'freestyle', 'exact'].includes(rule)) throw new Error('Unknown rule');
if (rule === 'renju' && [first, second].includes('legacy')) throw new Error('Legacy JS does not support forbidden rules');
const openingOffset = Number(option('opening-offset', '0'));
const output = resolve(ROOT, option('output', `models/benchmark-${first}-${second}.json`));
const configurations: Record<string, string> = { nnue: 'config.toml', trained: 'trained.toml', parent: 'training-parent.toml', mcts: 'mcts.toml' };
const chosenConfigs = [option('first-config', configurations[first] ?? first), option('second-config', configurations[second] ?? second)].map(path => resolve(ROOT, 'models/rapfi', path));
let clients = [first, second].map((name, i) => name === 'legacy' ? null : new NativeRapfi(chosenConfigs[i]));
const freshProcesses = args.includes('--fresh-process-per-game');
const openingFile = option('openings', rule === 'renju' ? '.build/training/renju/test-games.json' : '.build/training/test-games.json');
const openingData = JSON.parse(readFileSync(resolve(ROOT, openingFile), 'utf8'));
const sources: number[][] = Array.isArray(openingData) ? openingData : openingData.openings.map((entry: { moves: number[] }) => entry.moves);
if (pairs > sources.length) throw new Error('Not enough distinct openings');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
const actualConfigurations = chosenConfigs.map((path, i) => [first, second][i] === 'legacy' ? null : { path, sha256: sha256(path), weights: [...readFileSync(path, 'utf8').matchAll(/^(?:weight_file(?:_black|_white)?|binary_file)\s*=\s*"([^"]+)"/gm)].map(match => { const file = resolve(dirname(path), match[1]); return { path: file, sha256: sha256(file) }; }) });
const report = { first, second, rule, timeMs, stateIsolation: freshProcesses ? 'fresh process per game; center warmup excluded from timing' : 'persistent process; RESTART between games', actualConfigurations, openingSha256: sha256(openingFile), threadsPerEngine: 1, pairedOpenings: pairs, openingPly: 6, openingFile, warmup: true, openingOffset, modelHashes: { nnueFreestyle: sha256('models/rapfi/mix9svqfreestyle_bsmix.bin.lz4'), nnueStandard: sha256('models/rapfi/mix9svqstandard_bs15.bin.lz4'), nnueRenjuBlack: sha256('models/rapfi/mix9svqrenju_bs15_black.bin.lz4'), nnueRenjuWhite: sha256('models/rapfi/mix9svqrenju_bs15_white.bin.lz4'), trained: sha256('models/rapfi/trained.bin') }, engineBinarySha256: sha256('.build/native/bin/pbrain-rapfi'), date: new Date().toISOString(), firstWins: 0, draws: 0, secondWins: 0, firstScore: 0, measuredMoves: [0, 0], measuredMs: [0, 0], games: [] as unknown[] };
Object.assign(report,{search,directGuard,...(search==='policy'?{timeMs:null,stateIsolation:freshProcesses?'fresh process per game; pure neural initialization excluded':'persistent process; RESTART each game; stateless neural policy, no TT result',protocol:'YXBOARD + NNPOLICY; no BOARD/BEGIN/TURN search',depth:0}: {})});
async function warmup(){for(const client of clients)if(client){if(search==='policy')await client.policy({position:initial(),moves:[],rule},directGuard);else await client.analyze({position:initial(),moves:[],rule,difficulty:'hard',fullStrength:true,timeMs:10});}}
function save() { report.firstScore = (report.firstWins + report.draws / 2) / Math.max(1, report.games.length); writeFileSync(output, JSON.stringify(report, null, 2) + '\n'); }
try {
  mkdirSync(resolve(ROOT, 'models'), { recursive: true });
  await warmup();
  for (let pair = 0; pair < pairs; pair++) {
    const sourceIndex = (pair * 7 + openingOffset) % sources.length;
    const opening = sources[sourceIndex].slice(0, 6);
    for (const firstColor of [1, 2] as Color[]) {
      if (freshProcesses) {
        for (const client of clients) await client?.close();
        clients = [first, second].map((name, i) => name === 'legacy' ? null : new NativeRapfi(chosenConfigs[i]));
        await warmup();
      }
      for (const client of clients) await client?.reset();
      let position = replay(opening, rule).at(-1)!;
      const moves = [...opening]; const times = [0, 0]; const nodes = [0, 0];
      const analyses:unknown[]=[];
      const began = performance.now();
      while (!position.over) {
        const player = position.turn === firstColor ? 0 : 1;
        const started = performance.now();
        const result = clients[player] ? search==='policy' ? await clients[player]!.policy({position,moves,rule},directGuard) : await clients[player]!.analyze({ position, moves, rule, difficulty: 'hard', fullStrength: true, timeMs, engine: player === 0 ? first === 'trained' ? 'trained' : 'rapfi' : second === 'trained' ? 'trained' : 'rapfi' }) : legacyAnalyze(position, rule, 'hard', timeMs);
        if(search==='policy'){
          if(result.depth!==0||result.nodes!==0)throw new Error('Search used in a zero-search match');
          analyses.push({player,...result});
        }
        const elapsed = performance.now() - started;
        position = play(position, result.move, rule); moves.push(result.move);
        report.measuredMoves[player]++; report.measuredMs[player] += elapsed; times[player] += elapsed; nodes[player] += result.nodes;
      }
      const winner = position.winner === 0 ? 'draw' : position.winner === firstColor ? first : second;
      if (winner === first) report.firstWins++; else if (winner === second) report.secondWins++; else report.draws++;
      report.games.push({ pair, sourceIndex, firstColor, winner, winnerColor: position.winner, ply: position.ply, moves, elapsedMs: Math.round(performance.now() - began), searchMs: search==='policy'?[0,0]:times, ...(search==='policy'?{inferenceMs:times,analyses,ending:position.ending??'line-or-draw'}:{}), nodes });
      save();
      console.log(`${report.games.length}/${pairs * 2}: ${first} ${report.firstWins}–${report.draws}–${report.secondWins} ${second}; game ${moves.length} ply`);
    }
  }
} finally { for (const client of clients) await client?.close(); }
