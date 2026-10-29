import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { initial, play, replay } from '../src/game/engine.ts';
import { parseSave, newSave } from '../src/game/storage.ts';
import { analysisFromLines, boardCommand, RapfiSession } from '../src/game/rapfi-protocol.ts';
import { wasmSession } from '../scripts/wasm-client.ts';
import type { Rule } from '../src/game/types.ts';

let engine: RapfiSession;
before(async () => { engine = await wasmSession(); });
test('AI output validation rejects a forbidden move even though a human can play it and lose',()=>{
  const moves=[111,0,113,2,97,4,127,6],position=replay(moves,'renju').at(-1)!;
  assert.equal(play(position,112,'renju').winner,2);
  const bad=new RapfiSession();
  bad.attach({sendCommand(command){if(command.startsWith('BOARD\n'))bad.receive('7,7');}});
  assert.throws(()=>bad.analyze({position,moves,rule:'renju',difficulty:'easy'}),/禁手落点/);
});
test('old saves migrate to Rapfi; invalid models are rejected and trained models support every rule', () => {
  const old = { version: 1, createdAt: new Date().toISOString(), mode: 'ai', difficulty: 'normal', human: 1, rule: 'freestyle', moves: [] };
  assert.equal(parseSave(JSON.stringify(old)).engine, 'rapfi');
  assert.throws(() => parseSave(JSON.stringify({ ...old, engine: 'external' })));
  assert.equal(parseSave(JSON.stringify({ ...old, rule: 'renju', engine: 'trained' })).rule, 'renju');
  assert.equal(newSave({ mode: 'ai', difficulty: 'hard', human: 2, rule: 'exact' }).engine, 'rapfi');
});
test('relative colors and chronological ordering preserve the black first stone', () => {
  const moves = [224, 0, 112]; const p = replay(moves, 'freestyle').at(-1)!;
  assert.equal(boardCommand(p, 'freestyle', moves), 'BOARD\n14,14,2\n0,0,1\n7,7,2\nDONE');
  assert.equal(boardCommand(p, 'freestyle').split('\n')[1], '7,7,2');
  assert.throws(() => boardCommand(p, 'freestyle', [0, 224, 112]));
  assert.throws(() => boardCommand({ ...p, turn: 1 }, 'freestyle'));
});
test('protocol parsing includes real depth, nodes, value and principal variation', () => {
  const p = initial();
  const a = analysisFromLines(['INFO DEPTH 12', 'INFO TOTALNODES 12345', 'INFO EVAL 42', 'INFO SPEED 999', 'INFO BESTLINE 7,7 7,8', '7,7'], p, 12, 'rapfi');
  assert.equal(a.depth, 12); assert.equal(a.nodes, 12345); assert.equal(a.score, 42); assert.equal(a.pv, '7,7 7,8'); assert.equal(a.move, 112);
  assert.throws(() => analysisFromLines(['15,7'], p, 0, 'rapfi'));
  assert.throws(() => analysisFromLines(['ERROR invalid input', '7,7'], p, 0, 'rapfi'));
});
for (const rule of ['freestyle', 'exact', 'renju'] as Rule[]) for (const difficulty of ['easy', 'normal', 'hard'] as const) {
  test(`C++/Wasm ${rule} ${difficulty}: finds a winning gap before defending`, () => {
    const moves = [108, 0, 109, 1, 111, 2, 112, 3]; const p = replay(moves, rule).at(-1)!;
    const a = engine.analyze({ position: p, moves, rule, difficulty, timeMs: 100 });
    assert.equal(a.move, 110); assert.equal(play(p, a.move, rule).winner, 1);
  });
  test(`C++/Wasm ${rule} ${difficulty}: defends an immediate four`, () => {
    const moves = [224, 0, 222, 1, 220, 2, 218, 3]; const p = replay(moves, rule).at(-1)!;
    assert.equal(engine.analyze({ position: p, moves, rule, difficulty, timeMs: 100 }).move, 4);
  });
  test(`C++/Wasm ${rule} ${difficulty}: white also finds its winning move`, () => {
    const moves = [0, 108, 2, 109, 4, 111, 6, 112, 224]; const p = replay(moves, rule).at(-1)!;
    const a = engine.analyze({ position: p, moves, rule, difficulty, timeMs: 100 });
    assert.equal(a.move, 110); assert.equal(play(p, a.move, rule).winner, 2);
  });
}
test('beginner stays at one root ply after a hard hint in the reused Wasm session', () => {
  const moves = [112, 113, 98, 126, 96, 128, 82, 114];
  for (const rule of ['freestyle', 'exact', 'renju'] as const) {
    const position = replay(moves, rule).at(-1)!;
    const before = structuredClone(position);
    const request = {position, moves, rule};
    const hint = engine.analyze({...request, difficulty:'hard', fullStrength:true, timeMs:100});
    assert.ok(hint.depth > 1);
    const result = engine.analyze({...request, difficulty:'easy'});
    assert.equal(result.depth, 1);
    assert.equal(result.engine, 'rapfi');
    assert.ok(result.nodes > 0);
    assert.doesNotThrow(() => play(position, result.move, rule));
    assert.deepEqual(position, before);
  }
});
test('strength handicap returns after full-strength hints and respects its root-depth cap', () => {
  const moves = [112,113,98,126,96,128,82,114];
  for (const rule of ['freestyle','renju'] as const) {
    const position = replay(moves,rule).at(-1)!;
    for (const [difficulty, cap] of [['normal',7],['hard',15]] as const) {
      const request = {position,moves,rule,timeMs:100};
      engine.analyze({...request,difficulty:'hard',fullStrength:true});
      const sent: string[] = [], module = engine.module!;
      engine.attach({sendCommand(command){sent.push(command);module.sendCommand(command);}});
      let result;
      try { result = engine.analyze({...request,difficulty}); }
      finally { engine.attach(module); }
      assert.ok(sent.includes('YXHASHCLEAR'));
      assert.ok(sent.includes(`INFO STRENGTH ${difficulty === 'normal' ? 20 : 95}`));
      assert.ok(result.depth > 0 && result.depth <= cap);
      assert.notEqual(play(position,result.move,rule).ending,'forbidden');
    }
  }
});
test('C++ exact-five does not mistake a six-stone overline for a winning move', () => {
  const moves = [105, 0, 106, 1, 107, 2, 109, 3, 110, 8]; const p = replay(moves, 'exact').at(-1)!;
  assert.equal(engine.analyze({ position: p, moves, rule: 'exact', difficulty: 'hard', timeMs: 100 }).move, 4);
});
test('C++ loads the trained model and switches back to NNUE without a stale result', () => {
  const moves = [112, 113, 98, 126]; const p = replay(moves, 'freestyle').at(-1)!;
  const request = { position: p, moves, rule: 'freestyle' as const, difficulty: 'hard' as const, timeMs: 250, maxNodes: 2000 };
  const trained = engine.analyze({ ...request, engine: 'trained' });
  assert.equal(trained.engine, 'trained'); assert.equal(p.board[trained.move], 0); assert.ok(trained.depth > 0);
  const before = structuredClone(p);
  const nnue = engine.analyze({ ...request, engine: 'rapfi' });
  assert.equal(nnue.engine, 'rapfi'); assert.equal(p.board[nnue.move], 0); assert.ok(nnue.depth >= 2); assert.ok(nnue.nodes > 0);
  assert.ok(engine.lines.some(line => line.includes('mix9svq nnue'))); assert.deepEqual(p, before);
});
test('C++ rejects terminal positions and trained model supports Renju', () => {
  const moves = [108, 0, 109, 2, 110, 4, 111, 6, 112];
  assert.throws(() => engine.analyze({ position: replay(moves, 'freestyle').at(-1)!, moves, rule: 'freestyle', difficulty: 'hard' }));
  assert.equal(engine.analyze({ position: initial(), moves: [], rule: 'renju', difficulty: 'hard', engine: 'trained', timeMs: 30 }).move, 112);
});
for (const [label, black] of [
  ['double three', [111,113,97,127]],
  ['double four', [109,110,111,67,82,97]],
  ['overline', [105,106,107,109,110]],
] as [string, number[]][]) {
  test(`beginner Renju still avoids a ${label} forbidden point`, () => {
    const moves = black.flatMap((point,i) => [point,i*2]);
    const position = replay(moves,'renju').at(-1)!;
    const result = engine.analyze({position,moves,rule:'renju',difficulty:'easy'});
    assert.notEqual(play(position,result.move,'renju').ending,'forbidden');
    assert.notEqual(result.move,label === 'overline' ? 108 : 112);
  });
  for (const model of ['rapfi','trained'] as const) for (const difficulty of ['normal','hard'] as const) test(`${model} ${difficulty} Renju avoids a ${label} forbidden point`, () => {
    const moves = black.flatMap((point,i) => [point,i*2]);
    const p = replay(moves,'renju').at(-1)!;
    const result = engine.analyze({position:p,moves,rule:'renju',engine:model,difficulty,timeMs:70});
    assert.notEqual(play(p,result.move,'renju').ending,'forbidden');
    assert.notEqual(result.move,label === 'overline' ? 108 : 112);
  });
}
test('official NNUE switches between freestyle and Renju with the correct overline rule', () => {
  const moves = [105,0,106,1,107,2,109,3,110,8];
  for (const rule of ['freestyle','renju','freestyle'] as const) {
    const position = replay(moves,rule).at(-1)!;
    const result = engine.analyze({position,moves,rule,engine:'rapfi',difficulty:'hard',timeMs:100});
    assert.equal(result.move,rule === 'freestyle' ? 108 : 4);
    assert.equal(play(position,result.move,rule).winner,rule === 'freestyle' ? 1 : 0);
  }
});
