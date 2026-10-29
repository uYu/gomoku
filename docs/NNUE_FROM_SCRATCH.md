# 从随机权重训练 Mix9svq

**当前状态：用户已暂缓自建与训练，以下为已完成实验的记录，不自动续训。**

2026-10-29 用户另行授权了一轮无禁手短训与零搜索对比，现已完成；见
[FREESTYLE_TRIAL.md](FREESTYLE_TRIAL.md)。下文的连珠训练仍不自动续训。

用户确认采用模型从零训练，复用 Rapfi 网络结构和 C++ 搜索；不载入官方神经网络
权重，不蒸馏官方模型。现有游戏仍使用已验证的推荐模型，实验独立保存。

## 首轮配置

- 官方训练器：`dotb1ue/pytorch-nnue-trainer`，固定提交
  `3641196344856432c599d1c59e314e345dc7d1dd`，源码位于 `third_party/nnue-trainer`。
- 完整 Mix9svq：middle 128、feature 64、policy 32、value 64、DWConv 32；
  两套 65,536 项码本，每项 64 维。每个模型共 9,146,212 个参数。
- 黑白棋分别建模。所有初始参数来自随机初始化；码本以 EMA 更新，
  棋形映射网络、卷积、策略头和价值头参与反向传播。不是经典排序表微调。
- 每方 2,000 步，batch 16，CPU 两线程；AdamW、梯度裁剪 1，
  学习率 50 步预热到 0.001，余弦下降至 0.0002；种子 20261029/20261030。
- 损失为合法落点掩码下的策略交叉熵、胜负和交叉熵及上游 VQ 辅助损失。
  模型训练仍调用原版量化感知网络，不冻结神经网络的棋形映射或头部。
- 每 250 步在固定 512 个验证样本上选 checkpoint，最后评估完整验证、测试集。
  测试集不参与选择。每方 32,000 次样本呈现是初轮 CPU 实验，不代表充分收敛。

从零指神经网络参数随机初始化；C++ 搜索、规则代码与基础棋形表沿用 Rapfi。

## 数据

RenjuNet 官方库已清洗为 107,764 局，来源、剔除规则和数量见
[DATA_SOURCES.md](DATA_SOURCES.md)。首轮仅取 Rated 人类赛事，加上涉及强引擎
且终局明确的 Gomocup 2025 对局；每局每方最多抽四个局面。

整局 D4 去重后按前六手彩色棋盘家族隔离，再对已选样本清除跨训练/验证/测试的
D4 等价转置局面，并去重验证、测试内部样本。最终每方训练 50,500 个样本；
黑/白验证为 2,156/2,182，测试为 4,201/4,231。局面应用一次种子控制的随机 D4
变换；C++ 生成合法点掩码，包括黑棋禁手。每个样本保留来源与开局家族。

样本、派生权重只用于个人本地离线研究，均留在 `.build`。

## CPU 与格式验证

`nnue_cpu.py` 用有界内存的分块矩阵乘法计算确定性的 L2 最近码本项，保留 VQ
的码本、EMA、直通梯度和辅助损失。当前配置关闭随机码本采样与熵正则。
它与完整两两距离的最近项有独立单元测试；没有缩小网络或码本。

`nnue_export.py` 的向量化有符号 10-bit 打包器另有逐字节参考测试，
用于轻量格式预检。预检文件 `sparse-test-only` 仅覆盖指定局面的查表索引，
严禁用于下棋或对战。正式训练脚本通过官方完整序列化器生成全部棋形映射。
导出后必须用 `check-nnue-codec.py` 比较 PyTorch 与实际 C++ 推理的 WDL 概率。

## 启动与输出

本轮运行目录：`.build/experiments/mix9svq-scratch-r15-v2/`。
每个颜色子目录保存 `initial.pt`、`best.pt`、`last.pt`、`config.json`、
`curve.json`、`status.json`、最终 `report.json` 与 `network.bin.lz4`。
根目录保存源码/数据校验信息、进程 ID 和分颜色日志。

```sh
python3 -m venv --system-site-packages .build/nnue-env
.build/nnue-env/bin/python -m pip install -r requirements-nnue.txt
# macOS 按 CMake 的 SDK 头文件路径配置 CPLUS_INCLUDE_PATH（见本轮启动脚本）
.build/nnue-env/bin/python -m pip install --no-build-isolation --no-deps \
  ./third_party/nnue-trainer/dataset/pipeline/line_encoding_cpp
npm run build:native
python3 scripts/prepare-renjunet.py
.build/nnue-env/bin/python scripts/prepare-nnue-samples.py
.build/nnue-env/bin/python scripts/purge-nnue-overlap.py
sh scripts/run-nnue-scratch.sh
```

启动脚本并行训练两个颜色，完成后自动执行导出加载检查和对照流程。
已有 `initial.pt` 的目录拒绝重开，以免覆盖实验；重新实验需为训练脚本指定新目录。
v1 是因数据重复而取消的预备运行，其验证成绩不使用。

## 已完成：仅替换模型的官方对照

用户要求先保持官方搜索不变，只换模型。本轮已完成：双方均为同一 Rapfi C++
二进制、α–β/PVS 搜索、同一经典棋形表、一个线程和 32MB 置换表。两份完整配置
逐行比较，仅 `weight_file_black` 与 `weight_file_white` 不同，证明在实验目录的
`model-only-proof.json`。每局新开进程，预热不计入思考时间，避免继承上局 TT/历史。

开局取自未参与训练的 RenjuNet 测试家族，经官方模型作近似均衡筛选；同一开局
交换黑白，均为有禁手连珠。模型导出后在六个局面上核对 PyTorch/C++ WDL，
最大绝对差小于 0.00005，检查通过后才计正式对局。

| 每步预算 | 局数 | 自训胜 / 和 / 负 | 自训得分率 |
| --- | ---: | ---: | ---: |
| 100ms | 16 | 2 / 0 / 14 | 12.5% |
| 500ms | 8 | 1 / 0 / 7 | 12.5% |

本轮自训模型在两个用时档都明显落后官方。样本量小、用时短，不推算 Elo；
500ms 档复用了部分 100ms 档开局，不能当成完全独立的开局样本。测试棋谱落点
命中率黑 43.51%、白 47.55%，这不是对战胜率。

实验目录已生成 `summary.json`、`MATCH_REPORT.md` 和 24 份通过逐手校验的
游戏 JSON 棋谱，见 `replays/` 与 `replay-index.json`。导入游戏后可从开局自动回放。
网页推荐模型未被替换。此前自动启动的搜索算法交叉比较移至
`prior-search-comparison/`，不计入本轮模型对照；MCTS 比较按用户当前要求延后。

```sh
node --experimental-strip-types scripts/benchmark.ts \
  --first scratch-ab --second official-ab \
  --first-config "$PWD/.build/experiments/mix9svq-scratch-r15-v2/scratch-ab.toml" \
  --second-config "$PWD/.build/experiments/mix9svq-scratch-r15-v2/official-ab.toml" \
  --rule renju --time 100 --pairs 8 --fresh-process-per-game \
  --openings .build/experiments/mix9svq-scratch-r15-v2/openings.json \
  --output .build/recheck-model-only.json
```

正式权重与原始官方序列化文件均保留。导出说明曾读取到父仓库的 git 哈希，
部署副本已改为实际训练器固定提交，并记录修正前后 SHA-256；神经参数载荷逐字节
保持一致。该说明修正不改变模型推理或训练结果。
