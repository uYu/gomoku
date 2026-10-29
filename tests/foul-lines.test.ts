import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeRules } from '../scripts/rules-client.ts';
import { initial, play } from '../src/game/engine.ts';
import { foulLines } from '../src/game/foul-lines.ts';

before(loadNodeRules);
const transform = (point: number, symmetry: number) => {
  let r = Math.floor(point / 15), c = point % 15;
  if (symmetry >= 4) c = 14 - c;
  for (let n = 0; n < symmetry % 4; n++) [r, c] = [c, 14 - r];
  return r * 15 + c;
};
const normalized = (lines: number[][]) => lines.map(line => [...line].sort((a,b) => a-b).join(',')).sort();

for (const [label, black, white, move, expected] of [
  ['double three', [111,113,97,127], [], 112, [[111,112,113],[97,112,127]]],
  ['broken double three', [110,113,82,127], [], 112, [[110,112,113],[82,112,127]]],
  ['cross double four', [109,110,111,67,82,97], [], 112, [[109,110,111,112],[67,82,97,112]]],
  ['open-four endpoints are deduplicated', [110,111,113,82,97,127], [], 112, [[110,111,112,113],[82,97,112,127]]],
  ['in-line double four', [106,107,108,112,113,114], [105,115], 110, [[106,107,108,110],[110,112,113,114]]],
  ['overline', [105,106,107,109,110], [], 108, [[105,106,107,108,109,110]]],
  // Two genuine threes plus a blocked false three: never highlight the latter.
  ['false three excluded', [111,113,97,127,96,128], [64,160], 112, [[111,112,113],[97,112,127]]],
] as [string, number[], number[], number, number[][]][]) {
  test(`foul illustration: ${label}, including all eight symmetries`, () => {
    for (let symmetry = 0; symmetry < 8; symmetry++) {
      const map = (i: number) => transform(i, symmetry);
      const p = initial(); black.forEach(i => p.board[map(i)] = 1); white.forEach(i => p.board[map(i)] = 2);
      const original = [...p.board];
      const ended = play(p, map(move), 'renju');
      assert.equal(ended.ending, 'forbidden');
      const finalBoard = [...ended.board];
      assert.deepEqual(normalized(foulLines(ended)), normalized(expected.map(line => line.map(map))));
      assert.deepEqual(ended.board, finalBoard);
      assert.deepEqual(p.board, original);
      assert.deepEqual(foulLines(p), []);
    }
  });
}

test('a winning exact five takes priority and has no foul illustration', () => {
  const p = initial();
  [108,109,110,111,67,82,97,127,142].forEach(i => p.board[i] = 1);
  const ended = play(p,112,'renju');
  assert.equal(ended.winner, 1);
  assert.deepEqual(foulLines(ended), []);
});
