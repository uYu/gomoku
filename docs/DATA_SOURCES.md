# 连珠训练棋谱调查

核查日期：2026-10-29。按用户的个人、非商业研究用途筛选，不再仅限 MIT/CC0。
已下载原始库只存放于被忽略的 `.build/datasets/`，不混入网页静态资源或源码包。
以下数量来自实际文件审计，区别于网站宣传总数；尚未用于发布的训练模型。

## 优先：Gomocup 官方引擎比赛

[2025 官方比赛页](https://gomocup.org/results/gomocup-result-2025/)与
[2026 官方比赛页](https://gomocup.org/results/gomocup-result-2026/)提供结果压缩包。
分别下载 [2025 ZIP](https://gomocup.org/static/tournaments/2025/results/gomocup2025results.zip)
和 [2026 ZIP](https://gomocup.org/static/tournaments/2026/results/gomocup2026results.zip)。
其中 Renju 子目录含 Rapfi、KataGomo、Jax、AlphaGomoku 等参赛引擎的实战。

| 实际审计 | 2025 | 2026 |
| --- | ---: | ---: |
| 连珠 PSQ 文件 | 2,184 | 3,264 |
| 通过逐手坐标、占位、禁手、终局校验 | 2,183 | 3,262 |
| 重复落子坏记录 | 1 | 2 |
| 合法棋谱 D4 整局去重后 | 2,088 | 2,978 |
| 合法局中 D4 前六手家族 | 42 | 49 |
| 六手以后着法数，含重复局 | 96,477 | 128,894 |

这些是每年分别统计，不能相加后声称跨年度已经去重。
包内 `result.pgn` 的着法为 `1. d4 d5` 占位，不能用作训练着法。
真实着法在 `.psq`，坐标为从 1 开始的 x/y。赛果编码及玩家顺序需另行核对：
审计仅把合法棋盘上实际成五作为确定颜色的终局，认输、超时、和棋等保留原始
元数据，不猜最后行棋者就是赢家。两年分别有 277/430 局没有成五终局。

建议优先选强引擎着法，并以强搜索重标价值/策略。按 D4 开局家族隔离训练、验证
和测试，同一开局交换黑白的两局不能分到不同集合。整年留出仍需检查跨年开局重合。
Gomocup 连珠赛事有专家预设开局和 200 手和棋等规则，参见
[官方赛事说明](https://gomocup.org/detail-information/)，不能直接把截断局当普通满盘和棋。

两个压缩包未发现独立的数据授权文件；公开下载不是 CC0/MIT 声明。
当前用于个人本地研究，保留原始来源，不随游戏转发。

```sh
npm run build:native
python3 scripts/audit-gomocup.py
# 输出 .build/datasets/gomocup{2025,2026}-quality.json
# 及仅供本地研究的 legal-private.json，不会写入 public/
```

## 人类实战：RenjuNet 完整库

[官方棋谱页](https://www.renju.net/game/)提供
[压缩 XML](https://www.renju.net/game/download/)。已实际下载 2026-10-28 快照：

- 总记录 165,798，连珠类 139,248、Gomoku 类 26,550。
- 有落子记录的连珠类 **110,517**，Gomoku 类 10,785；总计 44,496 条空棋谱记录。
- 包含 Classic、Yamaguchi、Soosyrv、Taraguchi-10 等多种开局协议；不能混称为同一开局规则。
- 已完成逐手合法性、终局一致性与 D4 整局重复检查，清洗后保留 107,764 局。

用于学习人类开局与中盘多样性价值较高，宜优先筛有完整着法、明确规则和强手的
正式赛事，再用强引擎重标。空记录、不同开局的额外打点/交换元数据和旧棋谱错误
都需要处理，不能把网站总数当成可直接训练局数。

官方页面和原始 XML 都明确限定个人非商业 OFFLINE 数据库用途，禁止将内容或其
修改版本用于网站/在线系统。原始库留在本地，未打包到网页，也未用于当前发布权重。
[官方说明](https://www.renju.net/news/245/)保留了相同用途约定。

```sh
python3 scripts/audit-renjunet.py
# 输出 .build/datasets/renjunet-inventory.json
```

## 其他候选

| 来源 | 当前核查结果 | 用途判断 |
| --- | --- | --- |
| [Gomoku Party](https://gomokuparty.com/database/) | CC0，人类 SGF；[实际清单](https://gomokuparty.com/api/v1/database)共 632 局，其中仅 4 局 RENJU，其余多为 Swap2/自由规则 | 可作格式和导入样本，目前不足以训练强连珠 |
| [WinePy](https://huggingface.co/datasets/Karesis/Gomoku) | MIT，875 局单引擎自对弈；已用于当前小规模实验 | 训练管线基线，339 局全程符合连珠禁手，不是专家连珠数据 |
| [RenjuNet 旧下载目录](https://old.renju.net/downloads/downloads.php) | Renlib 分析库、Datafree 等历史库；混有商业数据库和不同个人用途约定 | 可作人工开局研究候选，不按文件数量或变例节点数充当独立实战局数 |

当前优先级：Gomocup 强引擎着法与重标 → RenjuNet 高水平人类实战 → 多引擎连珠
自对弈扩充。许可宽松筛选扩大了候选范围，棋谱质量、规则一致和无测试泄漏仍需校验。

## 下载校验

| 文件 | SHA-256 |
| --- | --- |
| gomocup2025results.zip | `91fc8cbefee5918994e028dd3f17143c5a46b948ed09b21c10ac0c1f1d4a8f09` |
| gomocup2026results.zip | `d14c1acc0daae22a2f7589ca262abb6f1622c27f1f88ec811814cef4c948bf25` |
| renjunet.xml.gz | `8f633bd0d0180cace2bab6dff94e056c5b88b08759218b61302ab70274a89b47` |

## 已执行的清洗与 NNUE 样本准备

`python3 scripts/prepare-renjunet.py` 使用增量 C++ 禁手校验，输出本地 JSONL、
原生训练 `.bin`、逐条剔除原因和来源 ID。保留 107,764 个 D4 唯一棋谱，
按前六手彩色棋盘的 D4 家族隔离为 86,211/10,777/10,776 局训练/验证/测试。
其中 1,529 局的最后一手为黑棋犯禁且官方结果为黑负：删除犯禁手，保留此前合法
局面与白胜结果，绝不把犯禁着法当策略标签。21 个重复棋谱家族的赛果冲突被整体剔除。

当前随机初始化 NNUE 首轮使用其中的 Rated 赛事，加上 Gomocup 2025 中涉及
Rapfi/KataGomo/AlphaGomoku 且棋盘终局明确的对局，每局每方最多抽四个局面。
两种来源共用开局家族分组，Gomocup 2026 未用作学习标签。

抽样后再检查所有 D4 等价棋盘，按训练→验证→测试优先级清除跨集合转置重复；
验证、测试内部也各自去重。最终黑/白训练各 50,500 个样本，验证 2,156/2,182，
测试 4,201/4,231。保存来源棋谱 ID、开局家族、原始赛果与 C++ 合法落点掩码。
这些样本依然采用人类比赛结果，不是强引擎重新标注的价值标签。

```sh
.build/nnue-env/bin/python scripts/prepare-nnue-samples.py
.build/nnue-env/bin/python scripts/purge-nnue-overlap.py
```

完整训练说明见 [NNUE_FROM_SCRATCH.md](NNUE_FROM_SCRATCH.md)。本地处理后的数据库
与实验模型都在 `.build`，未放入游戏资源或对应源码压缩包。
