import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NativeRapfi } from '../../scripts/native-client.ts';
import { wasmSession } from '../../scripts/wasm-client.ts';
import { replay } from '../../src/game/engine.ts';
import {play} from '../../src/game/engine.ts';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

test('a native input-pipe failure rejects the request without crashing the server',async()=>{
  const native=new NativeRapfi();
  try{
    await native.ready;
    const waiting=native.waitFor(line=>line==='unreachable pipe-error probe');
    const rejected=assert.rejects(waiting,/input pipe closed/);
    native.child.stdin.destroy(new Error('input pipe closed'));
    await rejected;
  }finally{await native.close();}
});

test('native and Wasm agree at a fixed node budget in all three rules', async () => {
  const native = new NativeRapfi();
  const wasm = await wasmSession();
  try {
    for (const rule of ['freestyle', 'exact', 'renju'] as const) {
      for (const moves of [[112,113,98,126], [112,96,127,97,111,98], [108,0,109,1,111,2,112,3]]) {
        await native.reset(); wasm.module!.sendCommand('YXHASHCLEAR');
        const request = { position: replay(moves, rule).at(-1)!, moves, rule, difficulty: 'hard' as const, fullStrength: true, timeMs: 5000, maxNodes: 5000 };
        const n = await native.analyze(request), w = wasm.analyze(request);
        assert.equal(n.move, w.move, `${rule} ${moves}`); assert.equal(n.score, w.score); assert.equal(n.depth, w.depth);
      }
    }
  } finally { await native.close(); }
});

const scratch=resolve('.build/experiments/mix9svq-freestyle-trial-v1/scratch-policy.toml');
test('policy interface can reuse freestyle logits with a separate Renju legality mask', {skip:!existsSync(scratch)}, async()=>{
  const native=new NativeRapfi(scratch);
  try{
    for(const black of [[111,113,97,127],[109,110,111,67,82,97],[105,106,107,109,110]]){
      const moves=black.flatMap((move,i)=>[move,i*2]);
      const position=replay(moves,'renju').at(-1)!;
      await native.policy({position,moves,rule:'freestyle'},false,'freestyle');
      const logits=native.lines.filter(line=>/^MESSAGE NNPOLICY \d+ /.test(line));
      const renju=await native.policy({position,moves,rule:'renju'},true,'freestyle');
      assert.deepEqual(native.lines.filter(line=>/^MESSAGE NNPOLICY \d+ /.test(line)),logits);
      assert.equal(renju.modelRule,'freestyle');assert.equal(renju.depth,0);assert.equal(renju.nodes,0);
      assert.notEqual(play(position,renju.move,'renju').ending,'forbidden');
    }
  }finally{await native.close();}
});

const renjuScratch=resolve('.build/experiments/mix9svq-scratch-r15-v2/scratch-ab.toml');
test('dedicated scratch Renju beginner uses its black and white models at zero search', {skip:!existsSync(renjuScratch)}, async()=>{
  const native=new NativeRapfi(renjuScratch);
  try{
    for(const moves of [[112,113,98,126],[112,113,98,126,96]]){
      const position=replay(moves,'renju').at(-1)!;
      const result=await native.policy({position,moves,rule:'renju'},true);
      assert.equal(result.modelRule,'renju');assert.equal(result.move,97);
      assert.equal(result.nodes,0);assert.equal(result.depth,0);
      assert.notEqual(play(position,result.move,'renju').ending,'forbidden');
    }
  }finally{await native.close();}
});
