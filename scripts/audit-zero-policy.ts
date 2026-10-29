import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {play,replay} from '../src/game/engine.ts';
import {parseSave} from '../src/game/storage.ts';
import {coordinate,other} from '../src/game/types.ts';
import {immediateWins} from './zero-policy.ts';
import type {PolicyAnalysis} from './zero-policy.ts';

const run=resolve(process.argv[2]??'.build/experiments/mix9svq-freestyle-trial-v1');
const read=(name:string)=>JSON.parse(readFileSync(resolve(run,name),'utf8'));
const sha=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const proof=read('model-only-proof.json');
assert.equal(sha('.build/native/bin/pbrain-rapfi'),proof.engine_binary_sha256);
assert.equal(sha(resolve(run,'mixed/network.bin.lz4')),proof.scratch_network_sha256);
assert.equal(proof.changed_lines.length,1);
const counterexamples=[];let games=0,movesChecked=0;
for(const file of ['raw-matches.json','guarded-matches.json']){
 const report=read(file),misses=[0,0],opportunities=[0,0];let wins=0,draws=0,losses=0;
 for(const [index,game] of report.games.entries()){
  const save=parseSave(readFileSync(resolve(run,'replays',game.replay),'utf8'));
  assert.deepEqual(save.moves,game.moves);
  const end=replay(save.moves,'freestyle').at(-1)!;
  assert.equal(end.over,true);assert.equal(end.winner,game.winner);
  if(!end.winner)draws++;else if(end.winner===game.scratchColor)wins++;else losses++;
  let position=replay(save.moves.slice(0,8),'freestyle').at(-1)!;
  assert.equal(game.analyses.length,save.moves.length-8);
  for(let i=0;i<game.analyses.length;i++){
   const analysis=game.analyses[i] as PolicyAnalysis&{model:string};
   const ply=8+i,who=analysis.model==='scratch'?0:1;
   assert.equal(analysis.nodes,0);assert.equal(analysis.depth,0);assert.equal(analysis.move,save.moves[ply]);
   const own=immediateWins(position,position.turn,'freestyle');
   const threats=immediateWins(position,other(position.turn),'freestyle');
   if(!own.length&&threats.length===1){
    opportunities[who]++;
    if(analysis.move!==threats[0]){
     misses[who]++;
     if(!report.guarded&&who===0)counterexamples.push({game:index+1,ply:ply+1,prefix:save.moves.slice(0,ply),rawMove:analysis.move,rawCoordinate:coordinate(analysis.move),forcedMove:threats[0],forcedCoordinate:coordinate(threats[0]),replay:game.replay});
    }
   }
   position=play(position,analysis.move,'freestyle');movesChecked++;
  }
  games++;
 }
 assert.deepEqual([wins,draws,losses],[report.wins,report.draws,report.losses]);
 assert.deepEqual(misses,report.avoidableMisses);assert.deepEqual(opportunities,report.forcedDefenseOpportunities);
 if(report.guarded)assert.deepEqual(misses,[0,0]);
}
writeFileSync(resolve(run,'four-counterexamples.json'),JSON.stringify(counterexamples,null,2)+'\n');
if(counterexamples.length){
 const example=counterexamples[0];
 for(const [name,move] of [['missed-four',example.rawMove],['blocked-four',example.forcedMove]] as const){
  const save={version:1,createdAt:new Date().toISOString(),mode:'local',human:1,rule:'freestyle',difficulty:'easy',engine:'rapfi',moves:[...example.prefix,move]};
  parseSave(JSON.stringify(save));
  writeFileSync(resolve(run,name+'.json'),JSON.stringify(save,null,2)+'\n');
 }
}
const output={games,movesChecked,counterexamples:counterexamples.map(({prefix,...example})=>example),allReplaysLegal:true,allMovesDepthZero:true,guardedAvoidableMisses:0};
writeFileSync(resolve(run,'audit.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
