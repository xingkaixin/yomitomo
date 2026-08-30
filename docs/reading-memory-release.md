# 阅读记忆发布门禁

本文件区分“开发交付完成”和“对外发布验收通过”。三个入口已启用，供开发环境持续验证；
本轮开发 goal 完成不等于发布产品，模型能运行或 CI 通过也不代表人工质量验收通过。

## 开放状态

发布开关集中在 `apps/desktop/src/reading-memory-release.ts`，当前为 `true`。它同时控制：

- 阅读中关联、问书库、重新审视的界面入口，以及设置中的模型管理。
- 阅读记忆 invoke handler 的执行；关闭时仍注册完整协议，但拒绝调用。
- 主进程投影 worker、语义索引启动和阅读记忆使用计数。

旧的判断库入口保持可用。开关不是用户设置，也没有生产环境变量或 IPC 可以绕过它。
该值对开发运行和后续打包均生效，不表示已发布安装包。隔离验收包通过独立构建配置
替换开关，不改变正式包。

按 2026-08-30 的用户决定，先打开总开关，后续由用户在开发环境持续人工验证。
本轮开发 goal 与实现 issue 在工程检查及 PR 流程完成后关闭，不以人工材料齐备为前提。
真实阅读样本和独立人工复核记录仍未随仓库提供，下面的人工门槛保留为后续发布验收；
不得把固定夹具的预期答案作为人工评审结果，也不得以本轮完成替代发布决定。

## 必须分别核对的证据

| 门槛 | 可重跑的工程证据 | 仍需核对的发布证据 |
| --- | --- | --- |
| 所有展示的 AI 主张引用有效资产，覆盖率 100% | 范围、版本、删除、未知引用和异步失效的契约测试 | 三个入口当次运行的实际引用 |
| AI 主张的直接支持率 ≥95% | 人工记录校验与评分工具 | 独立人工对真实输出及所引内容的逐项判定 |
| 九个语言方向各 ≥20 条查询；关联 Top3 有帮助率 ≥80% | 真实模型经过 SQLite、生产排序、证据选择的固定夹具回归 | 去敏真实阅读场景及人工有帮助标注，逐方向评分 |
| 相同分层下，问书库实际发送的 ≤12 条证据必要覆盖率 ≥90% | 实际输入打包后的 sent IDs 评分 | 人工必要证据标注；不能只检查打包前候选 |
| 相同、补充、相反各类覆盖率 ≥60%，实际标签准确率 ≥90% | 人工记录工具逐类计算，不以总分代替 | 真实关系输出、独立标注及无关负例 |
| 复审 Top5 可复审率 ≥70% | 人工记录工具分别计算语义排序和时间排序 | 两种队列各自的真实样本及人工逐项判定 |
| 四核、16 GB 环境下，一万条资产本地候选 P95 <1 秒 | 双平台实际模型与 SQLite 基准；报告机器规格、冷启动和热查询 | 核对目标平台报告，不把冷启动和远程时间混入热查询 |
| 保存不等待投影、向量或远程 AI；无确认不改原始资产 | 同事务入队、后台失败、幂等提交及无写入流程测试 | 对照当次实现与测试结果 |
| 三个入口正常、离线、失败、取消均可用 | 隔离打包 GUI 的 4 组、至少 13 个用例，无跳过 | 核对 macOS arm64 与 Windows x64 各自的产物 |

“引用标识合法”不证明“内容支持主张”。合成样本、假提供商输出、测试中编写的人工布尔值，
都只能验证实现，不是人工发布证据。人工材料至少覆盖过去支持现在、过去反驳现在、文字相似但
观点无关三类场景，并保留样本来源、系统版本、完整候选与实际发送集合，避免挑选成功结果。

## 本地与 CI 运行

先执行仓库完整门禁：

```bash
mise run check
```

无 mise 时使用根目录 `AGENTS.md` 中同序的等价命令。普通单测不会自动下载或运行大模型；
跳过未配置模型缓存的重评测用例不代表该门槛通过。

### 真实模型的生产检索回归

先完成正式桌面构建，并按 [模型分发说明](reading-memory-model-distribution.md) 准备已校验的
选定模型缓存。下面的离线工具只使用指定缓存，不构建、不下载，也不调用远程 AI：

```bash
READING_MEMORY_MODEL_CACHE=/absolute/path/to/verified-model-cache
READING_MEMORY_REPORT_DIR="$(mktemp -d)"
node apps/desktop/scripts/evaluate-reading-memory-quality.mjs \
  --model-cache="$READING_MEMORY_MODEL_CACHE" \
  --output="$READING_MEMORY_REPORT_DIR/production-quality.json"
```

评测程序在任一方向不达标时仍返回失败，报告保留全部方向的真实结果。报告保存模型与源文件
摘要、每次检索的 candidate/evidence/sent IDs、覆盖状态、打包大小和裁剪状态，标记
`evidenceClass: synthetic-engineering`、`humanReleaseEvidence: false`。

固定样本包括 60 个场景、360 条派生查询。它为每个语言建立独立书库，每篇样本只投影为一条
用户划线，每条问书库查询只有一份必要文档。因此它不证明真实混合书库、判断型资产、需要多份
证据的问题或生成主张的人工质量。当前命令不接受外部真实阅读数据；人工检索验证必须另附实际
查询、人工标注和生产运行记录，不能覆盖内置夹具后仍沿用旧报告。

### 人工记录评分

工具不会生成标注。同一命令接受两种互斥输入；主张、关系和队列的格式见
`packages/ai/src/evaluation/reading-memory-human-review-evaluation.ts`：

- `schemaVersion` 为 1；`evaluationId` 和完整 40 位 `systemRevision` 标识该次评测。
- `provenance` 记录去敏真实阅读来源说明、独立人工方式与复核者标识。
- `claims` 包含实际主张、引用摘录和 `directlySupported` 判定。
- `relations` 包含判断、证据、人工预期关系及系统输出关系；未输出关系用 `null`。
- `reviewQueues` 中每个队列恰好五条，分别提供 `semantic` 与 `time` 模式、上下文与可复审判定。

人工检索记录的格式见 `packages/ai/src/evaluation/reading-memory-human-retrieval-evaluation.ts`。
它复用相同的版本和来源字段，但根对象只包含 `retrieval`，不能混入上述三组字段。每条记录包含
唯一 `id`、`kind`、`queryLanguage`、`evidenceLanguage`、实际 `query`、最终 `displayedIds` 和
实际 `sentIds`；`relate` 只附人工 `helpfulIds`，`ask` 只附人工 `necessaryIds`。

九方向的每种查询各需至少二十条，不接受同方向同类型的重复查询。关联最多三条展示结果，命中
任一有帮助证据才算该题通过；问书库最多十二条，实际发送集合须是展示候选的有序子集，且覆盖
该题所有必要证据才通过。例如二十题每题需要十份证据、每题都缺一份，完整覆盖率为 0%，不是
90%。两种输入须分别运行、保存报告，单份报告通过不等于所有人工门槛通过。

```bash
node packages/ai/scripts/evaluate-reading-memory-human-review.js \
  --input /absolute/path/to/private-review-records.json \
  --output "$READING_MEMORY_REPORT_DIR/human-review-scores.json"
node packages/ai/scripts/evaluate-reading-memory-human-review.js \
  --input /absolute/path/to/private-retrieval-records.json \
  --output "$READING_MEMORY_REPORT_DIR/human-retrieval-scores.json"
```

输入缺失、结构错误、类别缺失或分数未达标都返回非零退出码。输出包含输入摘要、案例标识与
评分，不复制阅读正文或复核者标识；原始材料仍需在授权范围内单独保存。工具不能验证填表人的
身份或来源真实性，所以即使数值达标，也固定输出 `provenanceVerified: false`，不授予发布许可。
检索报告另有 `retrievalBasis: submitted-final-ids-not-production-replay`：它复算已提交的结果，
不自动回放真实书库。必须另外保留对应语料快照和生产运行记录，不能用手填结果替代真实检索。

### 打包 GUI 与正式模型包

```bash
pnpm --filter @yomitomo/desktop reading-memory:test-fixtures
pnpm --filter @yomitomo/desktop native:verify
pnpm --filter @yomitomo/desktop reading-memory:acceptance
```

验收命令只支持 macOS arm64、Windows x64，默认在新临时目录构建。它使用独立应用标识，
在加载真实主进程前隔离 appData、userData 和 sessionData；模型、提供商、凭据均为测试夹具，
应用测试网络只允许本机回环。正常流程仍通过真实 IPC、业务运行时、输入预算和引用校验。

GUI 覆盖部分索引、无模型、无提供商、远程不可达、真实超时、取消、切页面、锁定及原始数据
保持不变。报告标记 `fixture-package-gui`、`formalRelease: false`，不能充当真实模型、系统
keyring、签名安装器或人工质量的验证。普通 UI 测试配置不重复执行这四组测试；本命令必须
实际执行全部四组且至少 13 条全通过，筛选运行或跳过用例不能算最终验收。

`.github/workflows/reading-memory-model.yml` 分别运行：

- 两个平台的正式包、真实模型、SQLite 性能和严格生产检索回归。正式包烟测保留原始 ASAR，
  报告标记 `formal-package-real-model`；这仍不是签名、公证或安装器交互验收。
- 两个平台独立的夹具包 GUI。夹具构建不会覆盖正式 dist，正式产物校验拒绝夹具标记。

按 2026-08-30 确认的验收调整，Windows x64 的合成生产检索质量步骤设为非阻塞，仍执行
原评测命令并上传实际报告。该步骤失败后继续正式打包与实模型烟测；macOS 的质量步骤仍为
阻塞检查。此豁免不包含模型验证、一万条资产性能、正式包烟测、GUI 或报告上传，也不豁免
独立人工发布验收。绿色 CI 不表示 Windows 检索质量达标；人工验收后续持续进行，
不阻塞本轮开发 goal 和入口开启。

核对同一 PR 最新提交的所有未豁免检查、实际质量报告和冲突状态。需要保留的 CI 产物分别是
`reading-memory-model-<platform>`、`reading-memory-production-quality-<platform>`、
`reading-memory-fixture-gui-<platform>`。不要用前一提交的绿色结果代替当前提交。

## 升级、回滚与重建

数据库迁移 `0071_reading_memory_reviews` 要求 reader level 3。关闭阅读记忆开关不会撤销迁移，
reader level 2 的旧版不能直接读取升级后的数据库。不要删除迁移记录、降低兼容级别或删表来
强行降级。

升级前通过设置中的数据管理保存 SQLite 备份。备份包含原始阅读资产、复审事件和修订链；
它不是整个用户目录的归档，不包含外部 EPUB/PDF 文件、本地模型或系统 keyring 凭据。
这些资源按各自原有方式保留，恢复后必要时重新选择文件、安装模型或配置提供商。

需要退回旧版时，先另存当前状态，再使用与旧版兼容的升级前备份。升级后的备份不能替代它；
也不要先用新版打开旧备份、使其自动迁移后，再交给旧版。没有兼容备份时保留当前数据库，
寻求迁移方案，不承诺无损降级。

“重建索引”只重建派生数据：FTS、检索条目、投影收据与任务、各模型版本向量和派生语义状态。
它先取消并等待旧模型工作退出，再以短事务清除这些数据，随后从原始资产回填。原始文章、
批注、评论、复审历史及用户暂停选择保持不变。普通重启继续未完成工作，不反复清空索引；
数据库恢复后主动重新派生，避免把备份里的旧收据误当作完整索引。

重建期间显示实际覆盖度，并允许关键词或部分索引降级。模型下载失败不影响原始数据；
删除模型、取消下载、暂停索引与重建索引不是同一个动作。恢复操作仅在数据库真正替换后通知
后台运行时，取消、校验失败或替换失败不触发恢复完成逻辑。

## 匿名效果计数

沿用用户现有匿名遥测选择，但新增计数独立发送至 `/v1/reading-memory-counts`，不拼进原有
heartbeat。载荷只能是 `{ counts: { <允许的计数名>: <正整数> } }`，不含安装标识、设备信息、
日期、用户标识、问题、标题、摘录、引用标识、观点或回答。原有 heartbeat 的协议不因此改变；
不能把整个既有遥测系统描述为从来不使用安装标识。

| 计数名 | 触发时点 |
| --- | --- |
| `feature_opened` | 打开关联面板或切入问书库、重新审视；同面板改查不重复记打开 |
| `query_completed` | 当前查询接受到本地检索结果；取消或失效的结果不计 |
| `source_jump` | 文章打开成功；指定批注还须定位成功；讨论须打开成功 |
| `review_still_agree` / `review_changed` / `review_need_evidence` | 新复审事件实际入库；幂等重试不重复计数 |
| `fallback_keyword` / `fallback_partial_index` / `fallback_no_provider` | 当前检索结果实际处于该降级状态 |
| `fallback_call_failure` | 接受到远程判断失败的本地降级结果；取消、版本冲突或会话失效不计 |

计数只在内存累积，单类上限 65535。发送沿用启动、定期检查、恢复或聚焦等时机；失败不重试，
退出会丢弃未发送数据，不持久化队列，也不生成去重标识。因此这是可能少计的动作总量，
不是独立用户数、严格转化漏斗或准确会话数。

关闭遥测或恢复出关闭状态时，立即清空内存计数并中止当前请求；不等待界面全量快照返回，
再次打开也不会复活旧计数。已经被服务器接收的请求无法靠本地取消撤回。数据库暂不可读时
同样不收集。自动化与烟测环境禁用遥测。

服务端拒绝未知字段、未知计数、空载荷、非正整数和越界值，按计数类型写入 Analytics Engine。
新增路由需要独立部署 telemetry Worker 才能接收；本次代码合入、测试或 PR 合并不代表服务
已经部署。部署、版本 tag、Release 和对外开放仍按授权的发布流程执行。
