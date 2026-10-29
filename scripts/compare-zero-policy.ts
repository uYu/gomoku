// Paired private model trials: direct NNUE policy top-1, no AB/MCTS/VCF.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NativeRapfi } from './native-client.ts';
import { immediateWins } from './zero-policy.ts';
import { initial, play, replay } from '../src/game/engine.ts';
import { other } from '../src/game/types.ts';
import type { Position } from '../src/game/types.ts';

const run=resolve(process.argv[2]??'.build/experiments/mix9svq-freestyle-trial-v1');
const sha=(text:string|Uint8Array)=>createHash('sha256').update(text).digest('hex');
const status=(phase:string,extra:Record<string,unknown>={})=>writeFileSync(resolve(run,'status.json'),JSON.stringify({phase,...extra},null,2)+'\n');
function transform(point:number,symmetry:number){let r=Math.floor(point/15),c=point%15;if(symmetry>=4)c=14-c;for(let i=0;i<symmetry%4;i++)[r,c]=[c,14-r];return r*15+c;}
function positionKey(position:Position){return Array.from({length:8},(_,s)=>{const b=Array(225).fill(0);position.board.forEach((color,p)=>{b[transform(p,s)]=color;});return b.join('');}).sort()[0];}

async function main(){
 const clients=[new NativeRapfi(resolve(run,'scratch-policy.toml')),new NativeRapfi(resolve(run,'official-policy.toml'))];
 const labels=['scratch','official'];
 try{
  for(const client of clients)await client.policy({position:initial(),moves:[],rule:'freestyle'});
  status('testing_direct_four_threats');
  const bases=[[[0,1,2,3],[224,222,220,218]],[[0,15,30,45],[224,222,220,218]],[[0,16,32,48],[224,222,220,218]],[[108,109,111,112],[0,2,4,6]],[[108,109,110,111],[107,0,2,4]]];
  const probes=[];
  for(let type=0;type<bases.length;type++)for(const turn of [1,2])for(let s=0;s<8;s++){
   const [threat,distractors]=bases[type];
   const sequence=turn===1?distractors.flatMap((p,i)=>[p,threat[i]]):threat.flatMap((p,i)=>i<3?[p,distractors[i]]:[p]);
   const moves=sequence.map(p=>transform(p,s)),position=replay(moves,'freestyle').at(-1)!;
   const forced=immediateWins(position,other(position.turn),'freestyle');
   if(forced.length!==1||immediateWins(position,position.turn,'freestyle').length)throw new Error('Threat probe must have exactly one forced defense');
   const row:{type:number;turn:number;symmetry:number;moves:number[];forced:number;models:Record<string,unknown>}={type,turn,symmetry:s,moves,forced:forced[0],models:{}};
   for(let model=0;model<2;model++){
    const raw=await clients[model].policy({position,moves,rule:'freestyle'});
    const guarded=await clients[model].policy({position,moves,rule:'freestyle'},true);
    if(guarded.move!==forced[0])throw new Error('Guard missed a forced defense');
    row.models[labels[model]]={rawMove:raw.move,missed:raw.move!==forced[0],guardedMove:guarded.move};
   }
   probes.push(row);
  }
  const misses=Object.fromEntries(labels.map(label=>[label,probes.filter(p=>(p.models[label] as {missed:boolean}).missed).length]));
  let guardNeeded=misses.scratch>0;
  const counterexample=probes.find(p=>(p.models.scratch as {missed:boolean}).missed);
  if(counterexample){
   const rawMove=(counterexample.models.scratch as {rawMove:number}).rawMove;
   for(const [name,move] of [['missed-four',rawMove],['blocked-four',counterexample.forced]] as const){
    const save={version:1,createdAt:new Date().toISOString(),mode:'local',human:1,rule:'freestyle',difficulty:'easy',engine:'rapfi',moves:[...counterexample.moves,move]};
    writeFileSync(resolve(run,name+'.json'),JSON.stringify(save,null,2)+'\n');
   }
  }
  writeFileSync(resolve(run,'four-threat-probes.json'),JSON.stringify({probeCount:probes.length,misses,guardNeeded,probes},null,2)+'\n');
  type RecordGame={id:string;family:string;moves:number[]};
  const records=JSON.parse(readFileSync('.build/training/freestyle-trial-v1/test-games.json','utf8')) as RecordGame[];
  records.sort((a,b)=>sha(a.id).localeCompare(sha(b.id)));
  const groups=new Map<string,RecordGame[]>();for(const record of records)groups.set(record.family,[...(groups.get(record.family)??[]),record]);
  const openings:{moves:number[];source:string;family:string}[]=[],keys=new Set<string>();
  for(let round=0;openings.length<8;round++){
   let found=false;
   for(const group of groups.values()){
    const record=group[round];if(!record)continue;found=true;
    const moves=record.moves.slice(0,8),position=replay(moves,'freestyle').at(-1)!;
    if(position.over||immediateWins(position,1,'freestyle').length||immediateWins(position,2,'freestyle').length)continue;
    const key=positionKey(position);if(keys.has(key))continue;
    keys.add(key);openings.push({moves,source:record.id,family:record.family});if(openings.length===8)break;
   }
   if(!found)throw new Error('Insufficient held-out openings');
  }
  writeFileSync(resolve(run,'openings.json'),JSON.stringify({selection:'Seeded source-id hash order, round-robin over test-only first-three-ply D4 families; first 8 real plies, geometric terminal/immediate-win positions excluded. No neural scores or match outcomes used.',openings},null,2)+'\n');
  const reports=[];
  mkdirSync(resolve(run,'replays'),{recursive:true});
  for(const guarded of [false,true]){
   if(guarded&&!guardNeeded)continue;
   const games=[];let wins=0,draws=0,losses=0;
   const opportunities=[0,0],avoidableMisses=[0,0],rawMisses=[0,0],guardOverrides=[0,0],times=[0,0];
   for(let pair=0;pair<openings.length;pair++)for(const scratchColor of [1,2]){
    for(const client of clients)await client.reset();
    const moves=[...openings[pair].moves];let position=replay(moves,'freestyle').at(-1)!;
    const analyses=[];
    while(!position.over){
     const index=position.turn===scratchColor?0:1;
     const selfWins=immediateWins(position,position.turn,'freestyle'),threats=immediateWins(position,other(position.turn),'freestyle');
     const result=await clients[index].policy({position,moves,rule:'freestyle'},guarded);
     if(result.nodes!==0||result.depth!==0)throw new Error('Search used during a zero-search match');
     if(!selfWins.length&&threats.length===1){
      opportunities[index]++;rawMisses[index]+=Number(result.rawMove!==threats[0]);avoidableMisses[index]+=Number(result.move!==threats[0]);
     }
     guardOverrides[index]+=Number(result.move!==result.rawMove);times[index]+=result.elapsed;
     analyses.push({model:labels[index],...result});
     position=play(position,result.move,'freestyle');moves.push(result.move);
    }
    if(!position.winner)draws++;else if(position.winner===scratchColor)wins++;else losses++;
    const number=games.length+1,name=`${guarded?'guarded':'raw'}-game-${String(number).padStart(2,'0')}.json`;
    const save={version:1,createdAt:new Date().toISOString(),mode:'local',human:1,rule:'freestyle',difficulty:'easy',engine:'rapfi',moves};
    const checked=replay(moves,'freestyle').at(-1)!;if(!checked.over||checked.winner!==position.winner)throw new Error('Replay validation failed');
    writeFileSync(resolve(run,'replays',name),JSON.stringify(save,null,2)+'\n');
    games.push({pair,scratchColor,winner:position.winner,ply:position.ply,replay:name,moves,analyses});
    status('paired_zero_search_matches',{guarded,completed:games.length,total:16,wins,draws,losses});
    console.log(JSON.stringify({guarded,game:games.length,wins,draws,losses,ply:position.ply}));
   }
   const report={guarded,games,wins,draws,losses,score:(wins+.5*draws)/games.length,forcedDefenseOpportunities:opportunities,rawPolicyMisses:rawMisses,avoidableMisses,guardOverrides,totalInferenceMs:times};
   if(!guarded&&avoidableMisses[0]>0)guardNeeded=true;
   reports.push(report);writeFileSync(resolve(run,guarded?'guarded-matches.json':'raw-matches.json'),JSON.stringify(report,null,2)+'\n');
  }
  writeFileSync(resolve(run,'four-threat-probes.json'),JSON.stringify({probeCount:probes.length,misses,guardNeeded,rawMatchMisses:reports[0].avoidableMisses,probes},null,2)+'\n');
  const summary={rule:'freestyle',policy:'Same native C++ NNUE evaluator; top-1 raw float logits over all legal empty points; depth=0,nodes=0; no AB/MCTS/VCF, opening book, tactical move picker or TT result. Guarded comparison adds only own immediate-five priority / opponent immediate-five block to both models.',probeCount:probes.length,probeMisses:misses,guardNeeded,comparison:reports.map(({games,...report})=>({...report,gameCount:games.length})),modelOnlyProof:JSON.parse(readFileSync(resolve(run,'model-only-proof.json'),'utf8')),training:JSON.parse(readFileSync(resolve(run,'mixed/report.json'),'utf8')),openingSha256:sha(readFileSync(resolve(run,'openings.json'))),claim:'Small exploratory paired trial, not an Elo measurement or proof of suitability for every novice. All derived models/games remain local.'};
  writeFileSync(resolve(run,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  const scoreRows=summary.comparison.map(row=>`| ${row.guarded?'零搜索 + 直接威胁规则':'纯策略零搜索'} | ${row.gameCount} | ${row.wins} | ${row.draws} | ${row.losses} | ${(100*row.score).toFixed(1)}% |`).join('\n');
  const report=`# 无禁手 Mix9svq 短训与零搜索对比\n\nGomocup 2025/2026 Freestyle15 原始 20,736 局，经合法性、终局与 D4 跨年去重保留 19,171 局。按前三手 D4 开局家族隔离训练/验证/测试；从训练局抽 30,000 个独立局面，验证 1,024、测试 2,048。完整网络随机初始化，黑白共用，500 步 × 16 样本，不载入官方神经权重。\n\n双方使用同一个 C++ 推理接口，唯一配置差异为 Freestyle 权重文件。直接取合法空点中的最大策略 logit；搜索深度与节点均为 0，无 α–β、MCTS、VCF 或强制战术兜底。每组从测试家族中取 8 个实际开局交换黑白，共 16 局。\n\n| 模式 | 局数 | 自训胜 | 和 | 官方胜 | 自训得分率 |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${scoreRows}\n\n## 冲四检查\n\n80 个明确只有一个防守点的局面覆盖黑白、横竖斜、跳四和 D4 对称。自训纯策略漏堵 ${misses.scratch} 次，官方纯策略漏堵 ${misses.official} 次。纯策略对局中，自训/官方另分别有 ${reports[0].avoidableMisses[0]}/${reports[0].avoidableMisses[1]} 次漏堵唯一防守点。${guardNeeded?'因此加入用户要求的直接威胁规则：己方可一步成五则先赢；否则优先落在对方一步成五的点，多个点按原模型策略排序。双方均使用相同规则重新比较。规则不增加搜索树，也不保证能挽救对手活四两端等本已无法防住的局面。':'本轮未发现自训模型漏堵，未启用额外规则。'}\n\n原始与加规则结果分开保留；棋谱可从 replays/ 导入游戏。模型从验证集选取，不使用测试/对战结果挑 checkpoint。这是短训与小样本对比，不推算 Elo，不据此认定达到人类入门等级。网页模型未替换。\n`;
  writeFileSync(resolve(run,'MATCH_REPORT.md'),report);status('complete',{comparisons:reports.length});
 }finally{for(const client of clients)await client.close();}
}
await main();
