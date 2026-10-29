import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadNodeRules } from './rules-client.ts';
import { replay } from '../src/game/engine.ts';
import { parseSave } from '../src/game/storage.ts';
const root = resolve(process.argv[2] ?? '.build/experiments/mix9svq-scratch-r15-v2');
await loadNodeRules();
const summary = JSON.parse(readFileSync(resolve(root,'summary.json'),'utf8'));
const replayFolder = resolve(root,'replays'); mkdirSync(replayFolder,{recursive:true});
const rows: string[] = [], gamesIndex: unknown[] = [];
for (const comparison of summary.comparisons) {
  const filename = `scratch-ab-vs-official-ab-${comparison.timeMs}ms.json`;
  const report = JSON.parse(readFileSync(resolve(root,filename),'utf8'));
  if (report.actualConfigurations[0].sha256 !== summary.model_only_proof.scratch_config_sha256 || report.actualConfigurations[1].sha256 !== summary.model_only_proof.official_config_sha256) throw new Error('Configuration proof mismatch');
  rows.push(`| ${report.timeMs} ms | ${report.games.length} | ${report.firstWins} | ${report.draws} | ${report.secondWins} | ${(100*report.firstScore).toFixed(1)}% |`);
  for (let i=0;i<report.games.length;i++) {
    const game = report.games[i];
    const final = replay(game.moves,'renju').at(-1)!;
    if (!final.over || final.winner !== game.winnerColor) throw new Error(`Terminal result mismatch ${filename} game ${i+1}`);
    const save = parseSave(JSON.stringify({version:1,createdAt:report.date,mode:'local',difficulty:'hard',human:1,engine:'rapfi',rule:'renju',moves:game.moves}));
    const name = `${report.timeMs}ms-game-${String(i+1).padStart(2,'0')}.json`;
    writeFileSync(resolve(replayFolder,name),JSON.stringify(save,null,2)+'\n');
    gamesIndex.push({budgetMs:report.timeMs,game:i+1,pair:game.pair,openingIndex:game.sourceIndex,black:game.firstColor===1?'scratch':'official',white:game.firstColor===2?'scratch':'official',winner:game.winner,plies:game.ply,replay:name});
  }
}
const blackCodec=JSON.parse(readFileSync(resolve(root,'codec-black.json'),'utf8'));
const whiteCodec=JSON.parse(readFileSync(resolve(root,'codec-white.json'),'utf8'));
const maxDelta = Math.max(...[...blackCodec.tests,...whiteCodec.tests].map(entry=>entry.max_absolute_difference));
const content = `# 自训 NNUE vs 官方 NNUE：仅替换模型\n\n双方使用同一官方 Rapfi C++ 可执行文件、α–β/PVS 搜索、经典棋形基础表、32MB 置换表和一个搜索线程。配置逐行比对仅黑/白 NNUE 权重路径不同。每局启动新进程，排除上一局的置换表和历史信息；模型初始化不计入落子计时。\n\n规则为有禁手连珠。八个开局来自未参与训练的 RenjuNet 测试开局家族，以参考模型评分作近似均势筛选；同一开局交换黑白。\n\n| 每步预算 | 局数 | 自训胜 | 和 | 官方胜 | 自训得分率 |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n\n在 6 个检查局面上，完整导出模型与 PyTorch 的 WDL 概率最大绝对差为 ${maxDelta.toExponential(3)}。两方模型、配置、可执行文件与开局均记录 SHA-256；没有使用仅供预检的稀疏模型。\n\n自训模型为随机初始化后的首轮：黑白各 2,000 步、每步 16 个样本；测试棋谱落点命中率黑 ${(summary.black.test_final.policy_accuracy*100).toFixed(2)}%、白 ${(summary.white.test_final.policy_accuracy*100).toFixed(2)}%。这两个百分比是棋谱预测命中率，不是对战胜率。\n\n本轮用时短、开局和对局数量有限，不推算 Elo。100ms 与 500ms 使用重叠开局，各档成绩单列。正式对局使用真实时间预算，强制走法可提前结束。\n\n全部棋谱位于 replays/，索引见 replay-index.json。在游戏首页导入一个 JSON，回到开局后点击自动回放即可观看。不会替换网页推荐模型。\n`;
writeFileSync(resolve(root,'MATCH_REPORT.md'),content);
writeFileSync(resolve(root,'replay-index.json'),JSON.stringify(gamesIndex,null,2)+'\n');
console.log(JSON.stringify({verifiedGames:gamesIndex.length,report:resolve(root,'MATCH_REPORT.md'),replays:replayFolder},null,2));
