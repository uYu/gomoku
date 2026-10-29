# C++ 引擎、规则与训练

## 引擎

Rapfi 源码固定在 `1387d11312190ec66665d361ff07a7c70221b78a`，权重固定在
`7eeb19b55219a48138756293f92211a1539bab4d`。这是上游引擎集成与训练实验，
不称为从零自研。搜索包括迭代加深、α–β/PVS、置换表、历史排序、选择性延伸/
缩减及 VCF；默认 Mix9svq NNUE 增量估值与策略排序。原生还可选 MCTS。

入门/熟练/进阶预算约 40/600/2200ms，主搜索深度上限 1/40/99。入门使用
上游最低棋力参数 0，节点预算 256（引擎按检查间隔停止，并非逐节点硬截止）；
每次落子前清空置换表，避免复用强提示的深层搜索结果。熟练和进阶棋力参数为
20/95，不设额外节点限制。上游 SkillMovePicker 进一步将根搜索深度限制为
7/15 层，候选充足时分别至少分析 5/2 个候选，并按棋力参数进行随机选招。
这些是试玩参数，不是官方推荐的人类等级，也不是 20%/95% 的实际棋力。
提示仍使用参数 100；从更强参数回到较弱档位时清空置换表，避免提示影响难度。
离线分析、开局筛选和模型对比显式使用 fullStrength，保留满强度的比较条件。
普通网址的入门仍使用官方 NNUE，并保留成五、挡四和 VCF 等
战术检查；主搜索一层不等于所有变化只看一步，也不对应人类等级或固定胜率。
统计为实际深度、节点与耗时，战术直接返回或中心开局可能为零节点，首次模型
初始化耗时也可能超过搜索预算。
AI 运行于 Worker；正常请求复用，取消时终止，旧结果不写入回放或新棋局。

原生离线实验新增 `NNPOLICY` 诊断命令：先用 `YXBOARD` 输入局面，再输出所有
空点的原始神经策略 logit，不调用走法排序器、价值头、VCF 或搜索。该命令仅在
`COMMAND_MODULES` 下构建，当前浏览器引擎不包含它。零搜索短训对比见
[FREESTYLE_TRIAL.md](FREESTYLE_TRIAL.md)。本地 `?trial=freestyle` 试玩页的入门
通过 Vite 原生桥接使用对应规则的自训模型，零搜索并保留成五/堵四和禁手过滤；
熟练、进阶及提示使用浏览器官方模型。该入口暂不适用于纯静态部署。

## 连珠禁手

主玩法及两个 AI 模型均使用 RENJU（协议规则 4）。黑棋三三、四四、长连禁手，
同手恰好成五优先胜；白棋五连及以上胜。`cpp/rules.cpp` 复用上游 Board/
pattern/checkForbiddenPoint，递归判断假活三，处理同方向四四。它编译成约 37KB
的 `rules.wasm` 供界面、棋谱验证与 Worker 使用，也编译成本地动态库供 Python 清洗。
规则不依赖 NNUE 评分权重。界面禁手标记和 C++ 搜索使用同一套判定核心。

禁手点显示 ×，允许点击落子；黑棋落下三三、四四或长连禁手后立即判负，棋子
和具体禁手类型保留在终局与棋谱中。终局后禁止继续落子，支持回看和悔棋。
AI 的候选点与返回值仍显式排除禁手。黑棋已无合法落点时白棋胜。
休闲模式无禁手，默认入门难度；exact 仅兼容旧棋谱。自由落子开局，未实现交换/
打点等赛事开局协议；不将其称为完整 RIF 赛事流程。

## 当前实际训练：Renju policy v1

公开 WinePy 875 局来自单引擎自由规则自对弈，原始数据与 MIT 数据卡随项目保存。
使用原生 C++ 禁手判定后，只保留全程合法的 339 局，再整局 D4 去重并按种子分组。
训练/验证/测试为 271/34/34 局，8,729/1,042/1,203 个局面，不将其冒充高手连珠实战。

以 220723 经典模型为父模型，微调 1,634 个 Renju 走法排序参数，共 400 轮，
验证集每 20 轮选 checkpoint。量化部署模型测试损失从 1.710424 降为 1.516588
（约 11.33%）。没有重训整个 NNUE；损失下降不代表对弈更强。
`models/training-report.json` 保存完整参数、数据与模型哈希，CSV 保存训练曲线。

```sh
npm run build:native
npm run training:prepare
npm run training:run
npm run build:wasm
python3 scripts/verify-assets.py --write  # 有意更新构建产物后才执行
npm test
npm run test:native
npm run build
```

已另行下载官方高水平引擎连珠棋谱，完成合法性与重复审计，尚未把它们用于发布模型。
优先按开局家族隔离，再用强搜索重新标注。来源详见 [DATA_SOURCES.md](DATA_SOURCES.md)。

## 对战证据

当前 `models/benchmark-renju-smoke.json` 为训练模型 vs NNUE，100ms/步、单线程、
两组留出开局交换黑白共 4 局，2 胜 0 和 2 负。仅用于整局规则和模型切换检查，
样本过小，开局未经连珠均势校准，不据此认定棋力相等或提升。

早期报告均为自由规则，保留历史：NNUE 对旧 TS AI 12/0/0；free-v2 训练版对 NNUE
在平衡开局为 3/1/12；MCTS 对 α–β NNUE 3/0/3。它们不是当前连珠模型的成绩。
旧模型/训练报告在 `models/experiments/`，旧对战文件不被改写为连珠成绩。

所有对战保存完整着法、实际耗时、节点、模型/原生二进制哈希，并运行至棋局结束。
默认 benchmark 现在是连珠，拒绝不会禁手的旧 JS 对手。原生与 Wasm 对三种规则
另做固定节点预算落点/评分/深度一致性检查。

```sh
npm run benchmark -- --first trained --second nnue --rule renju --pairs 2 \
  --time 100 --output .build/recheck-renju.json
```

战胜 Rapfi 仍是待验证目标。正式结论应冻结候选，用至少 50 组未参与调参且按开局
家族隔离的连珠开局交换黑白，多用时档测试，并检查得分率置信区间下界超过 50%。

## 原生与重建

```sh
npm run build:native
npm run analyze -- --moves H8,I8,H9,G7 --time 1000
npm run analyze -- --engine trained --moves H8,I8,H9,G7 --time 1000
npm run analyze -- --wasm --moves H8,I8,H9,G7 --time 1000
```

原生程序 `.build/native/bin/pbrain-rapfi` 支持 Gomocup 行协议；包装默认连珠。
普通前端构建不需要 C++。修改引擎后使用 Emscripten 4.0.18 或兼容版执行
`npm run build:wasm`，可设置 EMSDK_ROOT，或只读使用同级 otello 的已装 SDK。
缓存与构建输出都在本项目 `.build`；不会修改 otello。

`source.tar.gz` 包含实际对应上游引擎、禁手桥、构建脚本、配置、权重及 MIT 训练输入，
不包含仅限本地研究的比赛/人类数据库。`assets:verify` 检查固定模型、Wasm、禁手桥
和上游 C++ 源码哈希，不能用更新哈希掩盖未重建代码。
