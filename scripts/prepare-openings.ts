import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NativeRapfi, ROOT } from './native-client.ts';
import { play, replay } from '../src/game/engine.ts';
const games = JSON.parse(readFileSync(resolve(ROOT, '.build/training/test-games.json'), 'utf8')) as number[][];
const stockSwap = [
 [[6,7],[6,4],[4,2]], [[3,3],[5,5],[6,6]], [[3,2],[5,4],[4,5]], [[5,2],[1,5],[1,6]], [[8,5],[5,8],[6,7]], [[5,5],[8,8],[7,7]], [[13,12],[13,9],[10,12]], [[11,7],[10,6],[13,5]], [[3,7],[1,8],[0,4]]
].map(game => game.map(([x,y]) => y*15+x));
const seeds = [...games.map(g => g.slice(0,5)), ...stockSwap];
const engine = new NativeRapfi();
const openings: { moves: number[]; score: number; depth: number; sourceGame: number }[] = [];
const seen = new Set<string>();
try {
  for (let index = 0; index < seeds.length && openings.length < 16; index++) {
    const moves = [...seeds[index]];
    if (seen.has(moves.join(','))) continue;
    seen.add(moves.join(','));
    await engine.reset();
    let position = replay(moves, 'freestyle').at(-1)!;
    while (moves.length < 5) {
      const next = await engine.analyze({ position, moves, rule: 'freestyle', difficulty: 'hard', fullStrength: true, timeMs: 100, balance: moves.length % 2 === 1 });
      position = play(position, next.move, 'freestyle'); moves.push(next.move);
    }
    const balanced = await engine.analyze({ position, moves, rule: 'freestyle', difficulty: 'hard', fullStrength: true, timeMs: 120, balance: true });
    position = play(position, balanced.move, 'freestyle'); moves.push(balanced.move);
    const checked = await engine.analyze({ position, moves, rule: 'freestyle', difficulty: 'hard', fullStrength: true, timeMs: 150 });
    if (Math.abs(checked.score) > 120) continue;
    openings.push({ moves, score: checked.score, depth: checked.depth, sourceGame: index });
    console.log(openings.length, checked.score, checked.depth);
  }
  writeFileSync(resolve(ROOT, 'models/benchmark-openings.json'), JSON.stringify({ provenance: 'Held-out WinePy positions plus nine fixed Rapfi Swap2 seed shapes (played here without swap); sixth move balanced with Rapfi YXBALANCEONE, then checked by 150ms NNUE search; |eval|<=120; fixed before candidate comparison.', reference: 'Rapfi 1387d11312190ec66665d361ff07a7c70221b78a, mix9svq', rule: 'freestyle', openings }, null, 2) + '\n');
} finally { await engine.close(); }
