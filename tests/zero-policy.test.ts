import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import { initial, play, replay } from '../src/game/engine.ts';
import { policyFromLines } from '../scripts/zero-policy.ts';
import {loadNodeRules} from '../scripts/rules-client.ts';
import {forbiddenAt} from '../src/game/renju.ts';

before(loadNodeRules);

function logits(position: ReturnType<typeof initial>, favorite: number) {
  return [...position.board.flatMap((color, move) => color ? [] : [`MESSAGE NNPOLICY ${move} ${move === favorite ? 10 : -move}`]), 'MESSAGE NNPOLICY DONE'];
}
test('zero search uses the actual policy top-1, even if that misses a four', () => {
  const position = replay([224,0,222,1,220,2,218,3],'freestyle').at(-1)!;
  const result = policyFromLines(logits(position,112),position,'freestyle',0);
  assert.equal(result.move,112); assert.equal(result.nodes,0); assert.equal(result.depth,0);
});
test('the optional direct-threat guard blocks a closed four and prefers its own immediate win', () => {
  const defending = replay([224,0,222,1,220,2,218,3],'freestyle').at(-1)!;
  const before = structuredClone(defending);
  const blocked = policyFromLines(logits(defending,112),defending,'freestyle',0,true);
  assert.equal(blocked.move,4); assert.equal(blocked.rawMove,112); assert.equal(blocked.guard,'block-four');
  assert.deepEqual(defending,before);
  const winning = replay([108,0,109,1,111,2,112,3],'freestyle').at(-1)!;
  const won = policyFromLines(logits(winning,4),winning,'freestyle',0,true);
  assert.equal(won.move,110); assert.equal(won.guard,'win-now');
  assert.equal(play(winning,won.move,'freestyle').winner,1);
});
test('an open four with two winning endpoints is not falsely reported as saved', () => {
  const position = replay([0,108,2,109,4,110,6,111],'freestyle').at(-1)!;
  const blocked = policyFromLines(logits(position,112),position,'freestyle',0,true);
  assert.ok([107,112].includes(blocked.move));
  const after = play(position,blocked.move,'freestyle');
  assert.equal(play(after,blocked.move === 107 ? 112 : 107,'freestyle').winner,2);
});
test('truncated, stale and nonfinite policy output is rejected', () => {
  const position=initial(),lines=logits(position,112);
  assert.throws(()=>policyFromLines(lines.slice(0,-1),position,'freestyle',0));
  assert.throws(()=>policyFromLines(lines.filter(line=>!line.startsWith('MESSAGE NNPOLICY 0 ')),position,'freestyle',0));
  assert.throws(()=>policyFromLines(lines.map(line=>line.replace('NNPOLICY 0 0','NNPOLICY 0 NaN')),position,'freestyle',0));
});
for(const [label,black,forbidden] of [
  ['double three',[111,113,97,127],112],
  ['double four',[109,110,111,67,82,97],112],
  ['overline',[105,106,107,109,110],108],
] as [string,number[],number][]){
  test(`Renju policy filters a model-preferred ${label} without searching`,()=>{
    const moves=black.flatMap((move,i)=>[move,i*2]);
    const position=replay(moves,'renju').at(-1)!;
    assert.ok(forbiddenAt(position.board,forbidden)>0);
    const result=policyFromLines(logits(position,forbidden),position,'renju',0,true);
    assert.notEqual(result.move,forbidden);
    assert.notEqual(play(position,result.move,'renju').ending,'forbidden');
    assert.equal(result.depth,0);assert.equal(result.nodes,0);
  });
}
test('Renju direct-win guard allows white overlines and gives black exact five priority',()=>{
  const white=initial();
  [105,106,107,109,110].forEach(move=>white.board[move]=2);white.turn=2;white.ply=5;
  const result=policyFromLines(logits(white,112),white,'renju',0,true);
  assert.equal(result.move,108);assert.equal(play(white,result.move,'renju').winner,2);
  const black=initial();
  [108,109,110,111,67,82,97,127,142].forEach(move=>black.board[move]=1);black.ply=9;
  const five=policyFromLines(logits(black,112),black,'renju',0,true);
  assert.equal(five.move,112);assert.equal(play(black,five.move,'renju').winner,1);
});
test('Renju block-four guard cannot choose a forbidden defense',()=>{
  const position=replay([111,48,113,64,97,80,127,96,32,0],'renju').at(-1)!;
  assert.ok(forbiddenAt(position.board,112)>0);
  const result=policyFromLines(logits(position,112),position,'renju',0,true);
  assert.notEqual(result.move,112);
  assert.notEqual(play(position,result.move,'renju').ending,'forbidden');
});
