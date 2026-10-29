import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initial, play, replay, undoCount, winningLine } from '../src/game/engine.ts';
import { analyze } from '../src/game/ai.ts';
import { newSave, parseSave } from '../src/game/storage.ts';
import { coordinate } from '../src/game/types.ts';
import type { Color, Rule } from '../src/game/types.ts';

const settings = { mode: 'ai', difficulty: 'normal', human: 1, rule: 'freestyle' } as const;
const winningMoves = [108, 0, 109, 2, 110, 4, 111, 6, 112];

test('empty board, black first, and immutable alternating moves', () => {
  const empty = initial(); const after = play(empty, 112, 'freestyle');
  assert.equal(empty.board[112], 0); assert.equal(after.board[112], 1);
  assert.equal(after.turn, 2); assert.equal(after.last, 112); assert.equal(after.ply, 1);
  assert.equal(play(after, 113, 'freestyle').board[113], 2);
});
test('reject occupied, fractional, NaN and out-of-range moves', () => {
  const p = play(initial(), 112, 'freestyle');
  for (const move of [112, -1, 225, 1.5, NaN, '12', null]) assert.throws(() => play(p, move as number, 'freestyle'));
});
for (const [name, moves] of Object.entries({ horizontal: [105, 106, 107, 108, 109], vertical: [7, 22, 37, 52, 67], descending: [0, 16, 32, 48, 64], ascending: [14, 28, 42, 56, 70] })) {
  for (const color of [1, 2] as Color[]) for (const rule of ['freestyle', 'exact'] as Rule[]) test(`${name} five at edge: color ${color}, ${rule}`, () => {
    const p = initial(); for (const i of moves.slice(0, 4)) p.board[i] = color; p.turn = color; p.ply = 4;
    const result = play(p, moves[4], rule); assert.equal(result.winner, color); assert.equal(result.over, true); assert.deepEqual(result.line, moves);
    assert.throws(() => play(result, 224, rule), /结束/);
  });
}
test('row endings cannot wrap into the next row', () => {
  const p = initial(); for (const i of [12, 13, 14, 15, 16]) p.board[i] = 1;
  assert.deepEqual(winningLine(p.board, 14, 'freestyle'), []);
});
test('filling a gap creates an overline only under freestyle rules', () => {
  const p = initial(); for (const i of [105, 106, 107, 109, 110]) p.board[i] = 1;
  assert.equal(play(p, 108, 'freestyle').winner, 1);
  assert.equal(play(p, 108, 'exact').winner, 0);
});
test('an overline in one direction does not hide an exact five in another', () => {
  const p = initial(); for (const i of [109, 110, 111, 113, 114, 82, 97, 127, 142]) p.board[i] = 1;
  assert.equal(play(p, 112, 'exact').winner, 1);
});
test('a complete draw is replayed through all 225 legal moves', () => {
  const black: number[] = [], white: number[] = [];
  for (let i = 0; i < 225; i++) (((Math.floor(i / 15) + 2 * (i % 15)) % 4) < 2 ? black : white).push(i);
  assert.equal(black.length, 113);
  const moves = black.flatMap((move, i) => i < white.length ? [move, white[i]] : [move]);
  const states = replay(moves, 'freestyle'); const p = states.at(-1)!;
  assert.equal(p.ply, 225); assert.equal(p.winner, 0); assert.equal(p.over, true);
  assert.equal(states.slice(0, -1).some(s => s.over), false);
});
test('replay preserves every position and stops at terminal moves', () => {
  const states = replay(winningMoves, 'freestyle');
  assert.equal(states.length, 10); assert.equal(states.at(-1)!.winner, 1);
  assert.throws(() => replay([...winningMoves, 224], 'freestyle'), /结束/);
});
test('human undo returns to the preceding human decision for either color', () => {
  assert.equal(undoCount([112], 'ai', 1), 0);
  assert.equal(undoCount([112, 113], 'ai', 1), 0);
  assert.equal(undoCount([112, 113, 114], 'ai', 2), 1);
  assert.equal(undoCount([112], 'ai', 2), 1);
  assert.equal(undoCount([112, 113], 'local', 1), 1);
  assert.equal(undoCount([112, 113], 'watch', 1), 1);
});
test('save roundtrip and rejection of malformed or illegal records', () => {
  const save = { ...newSave(settings), moves: winningMoves };
  assert.deepEqual(parseSave(JSON.stringify(save)), save);
  for (const patch of [{ version: 2 }, { mode: 'online' }, { rule: 'unknown' }, { difficulty: 'expert' }, { human: 3 }, { createdAt: 'never' }, { moves: [112, 112] }, { moves: [225] }, { moves: [1.2] }, { moves: [...winningMoves, 224] }]) {
    assert.throws(() => parseSave(JSON.stringify({ ...save, ...patch })));
  }
  for (const text of ['null', '{}', '[]', '{', 'x'.repeat(32769)]) assert.throws(() => parseSave(text));
});
test('coordinates follow A–O and bottom-to-top 1–15', () => {
  assert.equal(coordinate(0), 'A15'); assert.equal(coordinate(112), 'H8'); assert.equal(coordinate(224), 'O1');
});
for (const level of ['easy', 'normal', 'hard'] as const) {
  test(`${level} AI takes a winning gap before defending`, () => {
    const p = initial(); [108, 109, 111, 112].forEach(i => p.board[i] = 1); [0, 1, 2, 3].forEach(i => p.board[i] = 2); p.ply = 8;
    assert.equal(analyze(p, 'freestyle', level).move, 110);
  });
  test(`${level} AI blocks an immediate loss`, () => {
    const p = initial(); [0, 1, 2, 3].forEach(i => p.board[i] = 2); p.ply = 4;
    assert.equal(analyze(p, 'freestyle', level).move, 4);
  });
  test(`${level} AI starts at the center`, () => { assert.equal(analyze(initial(), 'freestyle', level).move, 112); });
}
test('AI respects exact-five overlines and does not mutate positions', () => {
  const p = initial(); [105, 106, 107, 109, 110].forEach(i => p.board[i] = 1); [0, 1, 2, 3].forEach(i => p.board[i] = 2); p.ply = 9;
  const before = structuredClone(p); const result = analyze(p, 'exact', 'hard');
  assert.equal(result.move, 4); assert.deepEqual(p, before);
});
test('search cancellation leaves board unchanged and returns a legal fallback', () => {
  const p = replay([112, 113, 98, 126, 96, 128, 82, 114], 'freestyle').at(-1)!;
  const before = structuredClone(p); const result = analyze(p, 'freestyle', 'hard', 10);
  assert.equal(p.board[result.move], 0); assert.deepEqual(p, before); assert.ok(Number.isFinite(result.score));
});
test('AI cannot analyze terminal positions', () => { assert.throws(() => analyze(replay(winningMoves, 'freestyle').at(-1)!, 'freestyle', 'easy')); });
test('the included demonstration record is a valid unfinished position', () => {
  const save = parseSave(readFileSync(new URL('../examples/opening.json', import.meta.url), 'utf8'));
  assert.equal(save.moves.length, 18); assert.equal(replay(save.moves, save.rule).at(-1)!.over, false);
});
for (const rule of ['freestyle', 'exact'] as Rule[]) test(`AI self-play completes a legal ${rule} game`, () => {
  let p = initial();
  while (!p.over) {
    const result = analyze(p, rule, 'normal', 10);
    assert.equal(p.board[result.move], 0);
    p = play(p, result.move, rule);
  }
  assert.ok(p.ply <= 225);
  if (p.winner) assert.ok(rule === 'exact' ? p.line.length === 5 : p.line.length >= 5);
  else assert.equal(p.ply, 225);
});
