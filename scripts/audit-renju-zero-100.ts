// Independently replay and audit the completed 50-pair Renju policy match.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {play,replay} from '../src/game/engine.ts';
import {parseSave} from '../src/game/storage.ts';
import {forbiddenAt} from '../src/game/renju.ts';
import {other} from '../src/game/types.ts';
import {loadNodeRules} from './rules-client.ts';
import {immediateWins} from './zero-policy.ts';
import type {PolicyAnalysis} from './zero-policy.ts';
import type {Color} from '../src/game/types.ts';

const run=resolve(process.argv[2]??'.build/experiments/renju-zero-policy-100-v1');
const read=(name:string)=>JSON.parse(readFileSync(resolve(run,name),'utf8'));
const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const report=read('matches.json'),proof=read('model-only-proof.json'),openingData=read('openings.json');
assert.equal(report.rule,'renju');assert.equal(report.search,'policy');assert.equal(report.directGuard,true);
assert.equal(report.games.length,100);assert.equal(report.pairedOpenings,50);assert.equal(proof.changed_lines.length,2);
assert.equal(digest('.build/native/bin/pbrain-rapfi'),proof.engine_binary_sha256);
assert.equal(report.engineBinarySha256,proof.engine_binary_sha256);
assert.equal(digest(resolve(run,'openings.json')),proof.opening_sha256);
assert.equal(report.openingSha256,proof.opening_sha256);
assert.equal(digest(resolve(run,'scratch-policy.toml')),proof.scratch_config_sha256);
assert.equal(digest(resolve(run,'official-policy.toml')),proof.official_config_sha256);
assert.equal(report.actualConfigurations[0].sha256,proof.scratch_config_sha256);
assert.equal(report.actualConfigurations[1].sha256,proof.official_config_sha256);
for(const model of Object.values(proof.models) as {scratch_path:string;scratch_sha256:string;official_path:string;official_sha256:string}[]){
 assert.equal(digest(model.scratch_path),model.scratch_sha256);assert.equal(digest(model.official_path),model.official_sha256);
}
function family(moves:number[]){
 const choices=Array.from({length:8},(_,symmetry)=>{
  const board=Buffer.alloc(225);
  moves.forEach((point,i)=>{let r=Math.floor(point/15),c=point%15;if(symmetry>=4)c=14-c;for(let j=0;j<symmetry%4;j++)[r,c]=[c,14-r];board[r*15+c]=1+i%2;});
  return board;
 });
 choices.sort(Buffer.compare);return createHash('sha256').update(choices[0]).digest('hex');
}
assert.equal(new Set(openingData.openings.map((o:{family:string})=>o.family)).size,50);
for(const opening of openingData.openings){assert.equal(opening.moves.length,6);assert.equal(family(opening.moves),opening.family);}
await loadNodeRules();
const byColor=[{games:0,wins:0,draws:0,losses:0},{games:0,wins:0,draws:0,losses:0}];
const defenses=[0,0],rawMisses=[0,0],finalMisses=[0,0],overrides=[0,0],winOverrides=[0,0],blockOverrides=[0,0];
const pairScores=new Map<number,{sourceIndex:number;colors:Set<number>;scores:number[];draws:number}>();
let wins=0,draws=0,losses=0,plies=0,playedMoves=0;
const replayIndex=[];
mkdirSync(resolve(run,'replays'),{recursive:true});
for(const [index,game] of report.games.entries()){
 assert.ok(game.firstColor===1||game.firstColor===2);
 const opening=openingData.openings[game.sourceIndex];assert.deepEqual(game.moves.slice(0,6),opening.moves);
 const pair=pairScores.get(game.pair)??{sourceIndex:game.sourceIndex,colors:new Set<number>(),scores:[],draws:0};
 assert.equal(pair.sourceIndex,game.sourceIndex);assert.equal(pair.colors.has(game.firstColor),false);pair.colors.add(game.firstColor);
 assert.equal(game.analyses.length,game.moves.length-6);
 let position=replay(opening.moves,'renju').at(-1)!;
 for(const [i,analysis] of (game.analyses as (PolicyAnalysis&{player:number;modelRule:string})[]).entries()){
  assert.equal(analysis.player,position.turn===game.firstColor?0:1);
  assert.equal(analysis.modelRule,'renju');assert.equal(analysis.nodes,0);assert.equal(analysis.depth,0);
  assert.equal(analysis.move,game.moves[i+6]);assert.equal(position.board[analysis.move],0);
  if(position.turn===1)assert.equal(forbiddenAt(position.board,analysis.move),0);
  const own=immediateWins(position,position.turn,'renju');
  const threats=immediateWins(position,other(position.turn),'renju');
  const available=threats.filter(move=>position.turn!==1||!forbiddenAt(position.board,move));
  if(own.length){assert.ok(own.includes(analysis.move));assert.equal(analysis.guard,'win-now');}
  else if(available.length){assert.ok(available.includes(analysis.move));assert.equal(analysis.guard,'block-four');}
  if(!own.length&&threats.length===1&&available.length===1){
   defenses[analysis.player]++;rawMisses[analysis.player]+=Number(analysis.rawMove!==threats[0]);finalMisses[analysis.player]+=Number(analysis.move!==threats[0]);
  }
  if(analysis.move!==analysis.rawMove){overrides[analysis.player]++;if(analysis.guard==='win-now')winOverrides[analysis.player]++;else if(analysis.guard==='block-four')blockOverrides[analysis.player]++;else assert.fail('Unexpected guard override');}
  position=play(position,analysis.move,'renju');assert.notEqual(position.ending,'forbidden');playedMoves++;
 }
 assert.equal(position.over,true);assert.equal(position.ply,game.ply);assert.equal(position.winner,game.winnerColor);
 assert.deepEqual(game.nodes,[0,0]);
 const winner=!position.winner?'draw':position.winner===game.firstColor?report.first:report.second;assert.equal(winner,game.winner);
 const color=byColor[game.firstColor-1];color.games++;plies+=position.ply;
 if(winner===report.first){wins++;color.wins++;pair.scores.push(1);}else if(winner==='draw'){draws++;color.draws++;pair.scores.push(.5);pair.draws++;}else{losses++;color.losses++;pair.scores.push(0);}
 pairScores.set(game.pair,pair);
 const name=`game-${String(index+1).padStart(3,'0')}.json`;
 const save={version:1,createdAt:report.date,mode:'local',difficulty:'easy',human:1,engine:'rapfi',rule:'renju',moves:game.moves};
 parseSave(JSON.stringify(save));writeFileSync(resolve(run,'replays',name),JSON.stringify(save,null,2)+'\n');
 replayIndex.push({game:index+1,pair:game.pair,sourceIndex:game.sourceIndex,scratchColor:game.firstColor,winner:game.winner,plies:game.ply,file:name});
}
assert.deepEqual([wins,draws,losses],[report.firstWins,report.draws,report.secondWins]);
assert.equal(pairScores.size,50);assert.equal(new Set([...pairScores.values()].map(p=>p.sourceIndex)).size,50);
for(const pair of pairScores.values()){assert.equal(pair.colors.size,2);assert.equal(pair.scores.length,2);}
assert.deepEqual(finalMisses,[0,0]);assert.deepEqual(byColor.map(c=>c.games),[50,50]);
const paired={scratchDoubleWins:0,splitWins:0,scratchDoubleLosses:0,withDraws:0};
for(const pair of pairScores.values())if(pair.draws)paired.withDraws++;else if(pair.scores[0]+pair.scores[1]===2)paired.scratchDoubleWins++;else if(pair.scores[0]+pair.scores[1]===0)paired.scratchDoubleLosses++;else paired.splitWins++;
// Resample complete opening pairs rather than pretend swapped-color games are independent.
let seed=20261029;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const pairMeans=[...pairScores.values()].map(pair=>(pair.scores[0]+pair.scores[1])/2),samples=[];
for(let i=0;i<10000;i++){let score=0;for(let j=0;j<50;j++)score+=pairMeans[Math.floor(random()*50)];samples.push(score/50);}
samples.sort((a,b)=>a-b);
const interval=[samples[249],samples[9749]];
const codecs=['black','white'].flatMap(color=>read(`codec-${color}.json`).tests);
const summary={rule:'renju',games:100,pairedOpenings:50,openingFamilies:50,searchDepth:0,searchNodes:0,directGuard:true,wins,draws,losses,score:(wins+draws*.5)/100,byColor:{black:byColor[0],white:byColor[1]},paired,scoreInterval95:interval,intervalMethod:'10,000 seeded bootstrap resamples of the 50 complete opening pairs, not individual games; describes this selected opening suite only.',playedMoves,meanPlies:plies/100,forcedDefenses:defenses,rawPolicyDefenseMisses:rawMisses,actualDefenseMisses:finalMisses,guardOverrides:overrides,winOverrides,blockOverrides,policyCodecMaxError:Math.max(...codecs.map((c:{policy_max_absolute_difference:number})=>c.policy_max_absolute_difference)),wdlCodecMaxError:Math.max(...codecs.map((c:{max_absolute_difference:number})=>c.max_absolute_difference)),allReplaysValidated:true,allAIForbiddens:0,engineBinarySha256:proof.engine_binary_sha256,openingSha256:proof.opening_sha256,scope:'Same native NNUE policy and immediate-win/block-four guard, trained Renju black/white weights versus official Renju black/white weights. No AB/MCTS/VCF, lookahead model evaluation, or book. This is not full-search Rapfi strength or a human beginner win rate.'};
writeFileSync(resolve(run,'summary.json'),JSON.stringify(summary,null,2)+'\n');
writeFileSync(resolve(run,'replay-index.json'),JSON.stringify(replayIndex,null,2)+'\n');
const row=(name:string,c:{wins:number;draws:number;losses:number})=>`| ${name} | ${c.wins} | ${c.draws} | ${c.losses} |`;
const text=`# 有禁手：自训模型 vs 官方模型，100 局零搜索\n\n## 结果\n\n| 自训模型视角 | 胜 | 和 | 负 |\n| --- | ---: | ---: | ---: |\n${row('合计 100 局',summary)}\n${row('执黑 50 局',byColor[0])}\n${row('执白 50 局',byColor[1])}\n\n自训得分率 **${(summary.score*100).toFixed(1)}%**；按 50 个开局配对重采样的 95% 得分率区间约 **${(interval[0]*100).toFixed(1)}%–${(interval[1]*100).toFixed(1)}%**。50 组中，自训双胜 ${paired.scratchDoubleWins} 组、各赢一局 ${paired.splitWins} 组、自训双负 ${paired.scratchDoubleLosses} 组，含和棋 ${paired.withDraws} 组。\n\n## 条件\n\n自训使用网页“有禁手＋入门”同一套随机初始化训练的 Mix9svq 黑白模型（各 2,000 步），官方使用原版 Renju 黑白权重。C++ 可执行文件、完整配置与规则相同，逐行检查仅两条 NNUE 路径不同，哈希见 model-only-proof.json。模型选定后不训练、不按对战结果换 checkpoint。\n\n双方均以 NNPOLICY 直接读取原始浮点策略，过滤黑棋禁手，取最高策略点。采用与入门档相同的直接规则：自己一步能成五先赢，否则堵对方一步成五；两方完全一致。深度与节点均为 0，初始化预热也没有调用搜索，无 α–β、MCTS、VCF、开局库或多步模型评估。原生进程复用、每局 RESTART，完整棋盘重新同步；策略不查询 TT 结果。\n\n50 个真实六手开局来自 RenjuNet 的 Rated 测试记录，每个 D4 彩色六手家族只取一个，按固定种子/棋谱键哈希排序。排除了黑白训练、验证样本的全部家族；未用任何模型评分或输赢筛选。每个开局交换双方执子，共 100 局。开局并未用强搜索预先证明均势，配对用于控制先手和开局偏差。\n\n黑棋三三、四四、长连禁手，恰好五连优先；白棋五连或长连胜，满盘无胜者和棋。所有对局自然结束，没有按固定步数截断判和。100 份完整棋谱及开局之后 ${playedMoves} 手已逐手校验，AI 犯禁为 0，所有策略调用的深度和节点都为 0。PyTorch/C++ 六个局面的策略概率最大误差 ${summary.policyCodecMaxError.toExponential(3)}。\n\n自训/官方分别有 ${defenses[0]}/${defenses[1]} 次合法的唯一防守机会；原策略漏堵 ${rawMisses[0]}/${rawMisses[1]} 次，执行规则后漏堵 ${finalMisses[0]}/${finalMisses[1]} 次。规则实际改选 ${overrides[0]}/${overrides[1]} 手（直接成五 ${winOverrides[0]}/${winOverrides[1]}，堵四 ${blockOverrides[0]}/${blockOverrides[1]}）。\n\n这是两个模型在同等零搜索条件下的相对表现，不代表完整搜索 Rapfi 的棋力，也不能换算为新手玩家的胜率或可靠 Elo。得分率区间只描述这套开局测试集的配对抽样波动。\n\n## 文件\n\n- matches.json：100 局完整着法、逐手原策略点/实际落点、规则干预、耗时与零搜索记录。\n- replays/、replay-index.json：可导入游戏的 100 盘棋谱与索引。\n- openings.json：50 个开局、家族、来源棋谱 ID 和数据校验。\n- model-only-proof.json、codec-black.json、codec-white.json：模型配置和量化推理证据。\n- summary.json：汇总、按颜色统计、配对结果与审计。\n\n实验和派生数据保留在 .build，未修改网页模型或其训练权重。\n`;
writeFileSync(resolve(run,'MATCH_REPORT.md'),text);
writeFileSync(resolve(run,'status.json'),JSON.stringify({phase:'complete',games:100,wins,draws,losses,audited:true},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
