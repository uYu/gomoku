import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNodeRules } from '../scripts/rules-client.ts';
import { forbiddenAt, forbiddenMap } from '../src/game/renju.ts';
import { initial, play, replay, undoCount } from '../src/game/engine.ts';
import { newSave, parseSave } from '../src/game/storage.ts';

before(loadNodeRules);
const boardOf = (black: number[], white: number[] = []) => {
  const p = initial(); black.forEach(i => p.board[i] = 1); white.forEach(i => p.board[i] = 2);
  p.ply = black.length + white.length; return p;
};
const transform = (point: number, symmetry: number) => {
  let r = Math.floor(point / 15), c = point % 15;
  if (symmetry >= 4) c = 14 - c;
  for (let n = 0; n < symmetry % 4; n++) [r,c] = [c,14-r];
  return r * 15 + c;
};
for (const [label, black, white, move, kind] of [
  ['double three', [111,113,97,127], [], 112, 1],
  ['cross double four', [109,110,111,67,82,97], [], 112, 2],
  ['in-line double four', [106,107,108,112,113,114], [105,115], 110, 2],
  ['overline', [105,106,107,109,110], [], 108, 3],
  ['blocked false three', [111,113,97,127], [67,157], 112, 0],
  ['recursive false three', [111,113,97,127,79,80,81,83,84,139,140,141,143,144], [], 112, 0],
  ['exact five priority', [108,109,110,111,67,82,97,127,142], [], 112, 0],
] as [string, number[], number[], number, number][]) {
  test(`Renju ${label} is invariant under all eight board symmetries`, () => {
    for (let s = 0; s < 8; s++) {
      const p = boardOf(black.map(i => transform(i,s)), white.map(i => transform(i,s)));
      const point = transform(move,s), original = [...p.board];
      assert.equal(forbiddenAt(p.board, point), kind, `symmetry ${s}`);
      assert.equal(forbiddenMap(p.board)[point], kind); assert.deepEqual(p.board, original);
      if (kind) {
        const lost=play(p,point,'renju');
        assert.equal(lost.board[point],1);assert.equal(lost.last,point);assert.equal(lost.ply,p.ply+1);
        assert.equal(lost.over,true);assert.equal(lost.winner,2);assert.equal(lost.ending,'forbidden');
        assert.equal(lost.foul,kind);assert.deepEqual(lost.line,[]);assert.deepEqual(p.board,original);
        assert.throws(()=>play(lost,224,'renju'),/结束/);
      }
      else assert.equal(play(p, point, 'renju').board[point], 1);
    }
  });
}
test('only black has forbidden moves; white six is a win', () => {
  const p = boardOf([], [105,106,107,109,110]); p.turn = 2;
  assert.equal(play(p,108,'renju').winner, 2);
  const black = boardOf([108,109,110,111,67,82,97,127,142]);
  assert.equal(play(black,112,'renju').winner, 1);
});
test('a terminal forbidden move roundtrips in saves, while continuation after it is rejected', () => {
  const moves = [111,0,113,2,97,4,127,6];
  const p = replay(moves,'renju').at(-1)!; assert.equal(forbiddenAt(p.board,112),1);
  const save = {...newSave({mode:'local',difficulty:'normal',human:1,rule:'renju'}), moves};
  assert.deepEqual(parseSave(JSON.stringify(save)).moves,moves);
  const ended={...save,moves:[...moves,112]};
  assert.deepEqual(parseSave(JSON.stringify(ended)),ended);
  const states=replay(ended.moves,'renju');
  assert.equal(states.at(-1)!.winner,2);assert.equal(states.at(-1)!.foul,1);
  assert.equal(states.at(-1)!.board[112],1);assert.equal(states.at(-2)!.board[112],0);
  assert.throws(() => parseSave(JSON.stringify({...ended,moves:[...ended.moves,224]})), /结束/);
  const undone=replay(ended.moves.slice(0,undoCount(ended.moves,'ai',1)),'renju').at(-1)!;
  assert.equal(undone.over,false);assert.equal(undone.board[112],0);assert.equal(undone.turn,1);
  assert.equal(p.board[112],0);
});
test('forbidden cache follows board changes and cannot contaminate freestyle', () => {
  const p = boardOf([111,113,97,127]); assert.equal(forbiddenAt(p.board,112),1);
  p.board[67] = 2; p.board[157] = 2; assert.equal(forbiddenAt(p.board,112),0);
  p.board[67] = 0; p.board[157] = 0; assert.equal(forbiddenAt(p.board,112),1);
  assert.equal(play(p,112,'freestyle').board[112],1);
});
