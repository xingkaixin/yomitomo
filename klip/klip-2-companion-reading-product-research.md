---
Author: "Codex"
Updated: 2026-05-05
Status: Draft
---

# klip-2-companion-reading-product-research

## 现状结论（代码校准）

- 产品主线已经闭合：扩展端承载网页阅读器、批注、评论和助手触发；桌面端承载本地同步、provider、助手配置、阅读库、读后卡片和审核。证据：`README.md:5`、`README.md:10`、`README.md:80`。
- 批注是当前交互原子。`Annotation` 绑定 `TextAnchor`、作者、类型、颜色和评论 thread；`Comment` 记录用户或 AI 的一条讨论回复。证据：`packages/shared/src/index.ts:344`、`packages/shared/src/index.ts:352`、`packages/shared/src/index.ts:371`。
- 当前批注类型覆盖关键判断、前提漏洞、概念解释、延伸问题、金句五类。证据：`packages/shared/src/index.ts:42`、`packages/core/src/annotations.ts:24`。
- 阅读助手已按人格预置分化成克制阅读伙伴、第一性原理审阅者、追问型导师、洞察整理者；审核助手已按证据、读者关注、洞察编辑分化。证据：`packages/shared/src/index.ts:222`、`packages/shared/src/index.ts:261`。
- 用户主动评论触发 AI 的路径是 `@agent` 机制：保存用户评论后调用 `findMentionedAgents()`，再发送 `agent:message`。证据：`apps/extension/entrypoints/content.tsx:825`、`apps/extension/entrypoints/content.tsx:842`、`apps/extension/entrypoints/content.tsx:848`。
- AI 主动批注路径是“助手精读”：扩展发送 `agent:annotate`，桌面端流式返回 `agent:annotate:item`。证据：`apps/extension/entrypoints/content.tsx:866`、`apps/desktop/src/main/server.ts:255`、`apps/desktop/src/main/server.ts:275`。
- 桌面端读后卡片流程有三步：阅读审议报告、AI 提炼、卡片审核；UI 通过 `ReadingCardWorkflowStep` 串联。证据：`apps/desktop/src/renderer/src/app-reading-card-panel.tsx:97`、`apps/desktop/src/renderer/src/app-reading-card-panel.tsx:186`、`apps/desktop/src/renderer/src/app-reading-card-panel.tsx:208`、`apps/desktop/src/renderer/src/app-reading-card-panel.tsx:230`。
- 读后卡片证据单元来自批注和评论，包含原文 quote、上下文、批注类型、作者和 comments。证据：`packages/core/src/reading.ts:23`、`packages/core/src/reading.ts:155`。
- 产品口径需要校准：用户描述中使用“读后笔记”，当前 README、UI 和类型命名使用“读后卡片 / reading-card”。证据：`README.md:17`、`apps/desktop/src/renderer/src/app-reading-card-panel.tsx:274`、`packages/shared/src/index.ts:468`。
- 桌面端 SQLite 已持久化文章、批注、评论、阅读审议、读后卡片和审核结果。证据：`apps/desktop/src/main/db/schema.ts:51`、`apps/desktop/src/main/db/schema.ts:91`、`apps/desktop/src/main/db/schema.ts:121`。
- 当前数据模型缺少阅读位置、阅读目标、分段理解状态、概念卡、问题状态、复习队列和跨文章知识连接字段。该判断来自 `ArticleRecord`、`Annotation`、`ReadingDeliberationRecord`、`ReadingCardRecord` 当前字段集合。证据：`packages/shared/src/index.ts:392`、`packages/shared/src/index.ts:413`、`packages/shared/src/index.ts:468`。

## 背景

- 用户描述的产品价值是“伴读”：AI 在阅读过程中参与讨论，也能主动提出批注，最终把文章阅读沉淀到桌面端读后笔记。
- 当前实现已经把 AI 放进边注层，具备低打扰、可追溯、围绕原文的基本形态。
- 伴读产品的根本任务是降低理解成本、提高阅读质量、保存可复用判断，并让用户保持阅读主导权。
- AI 的优势是知识广度、概念解释、关联提醒、结构化整理和多视角审阅。产品需要把这些优势约束在“帮助阅读”这一任务内。
- 批注层天然适合作为 AI 介入点，因为它绑定具体原文位置、用户意图和后续沉淀证据。

## 目标

- 给出 Yomitomo 伴读产品的核心能力定义。
- 判断当前能力的优化方向。
- 提出可以扩展的产品模式和能力模块。
- 给出基于影响力、实现成本、现有架构匹配度的落地顺序。
- 输出一份可用于后续设计和开发拆分的 KLIP。

## 非目标

- 本文范围排除具体 UI 视觉 redesign。
- 本文范围排除商业化、账号体系、云同步和多人协作完整方案。
- 本文范围排除模型供应商选型细节。
- 本文范围排除本轮直接修改代码。

## 第一性原理推导

阅读可以拆成五个连续动作：

1. 定向：读者知道自己为什么读、要带着什么问题读。
2. 理解：读者把句子、概念、论证链和上下文转成自己的认知结构。
3. 对话：读者对关键片段发问、同意、质疑、联想和补证。
4. 沉淀：读者把分散批注压缩成可复用判断、行动线索和后续问题。
5. 回访：读者在之后的写作、决策、复习或继续阅读中重新取回这些判断。

当前 Yomitomo 已经覆盖理解、对话、沉淀的主路径。下一阶段的产品增量应补齐定向和回访，并提升理解与对话的精度。

伴读 AI 的产品边界可以定义为：在读者仍处于原文现场时，把外部知识、结构化问题和多视角审阅压缩成可追踪的边注；在读者离开原文后，把边注转成可复用的读后资产。

## 外部校准

- Readwise Reader 的 Ghostreader 按词、段落、全文三层触发 AI：词级用于定义和百科解释，段落级用于解释和扩展，全文级用于问题、takeaways 和后续处理。这说明 AI 阅读助手的能力入口应随选择粒度变化。参考：<https://docs.readwise.io/reader/guides/ghostreader/overview>、<https://docs.readwise.io/reader/guides/ghostreader/default-prompts>。
- Hypothesis 把网页、文档和书籍的讨论放在 annotation 层，并提供搜索、过滤和群组视图。这说明“边注即讨论”是成熟交互方向。参考：<https://web.hypothes.is/everyone/>。
- Cornell Note-taking System 强调提问、复述、反思和周期复习。这说明阅读沉淀应包含问题化和复习机制。参考：<https://lsc.cornell.edu/notes.html>。

## 能力地图

| 能力层 | 当前实现 | 产品判断 |
|---|---|---|
| 阅读现场 | 扩展抽取正文、目录、字号、宽度、批注侧栏 | 基础阅读容器已成立，后续重点是读前定向和读中状态 |
| 用户批注 | 高亮、批注类型、评论 thread | 批注粒度合理，缺少问题状态和任务状态 |
| AI 回应 | `@agent` 触发批注 thread 回复 | 适合保留为低打扰主交互，需补充快捷问题入口 |
| AI 主动批注 | 助手精读生成多条批注 | 差异化强，需加入目标导向和可控范围 |
| 多视角助手 | 预置 annotation / review 两类 agent | 方向正确，需把人格从“角色”升级为“阅读任务” |
| 读后沉淀 | 阅读审议、AI 读后卡片、审核助手 | 已经超过普通摘要，下一步应连接回访和跨文章复用 |
| 本地同步 | 扩展缓存 + 桌面 SQLite | 适合本地优先路线，后续知识索引可落在本地库 |

## 评估维度

1. 阅读价值：是否直接提升理解、判断、记忆或回访。
2. 交互贴合：是否顺着批注层展开，减少上下文切换。
3. 数据复用：是否能沉淀成后续卡片、搜索、复习或跨文关联资产。
4. 实现成本：是否能复用现有 `Annotation`、`Comment`、`ArticleRecord`、LLM prompt 和桌面存储。
5. 风险边界：是否保持用户主导、证据可追溯、AI 输出可审阅。

## 评估结果

### 1. 当前能力最应该优化：读中“高价值介入”

结论：优先把 AI 从“被 @ 回复”和“整篇主动批注”扩展为“选择粒度感知的阅读动作”。

当前 `agent:message` 已绑定用户高亮和 thread，`agent:annotate` 已绑定全文。中间缺少词级、句级、段级的快捷动作，例如解释术语、拆论证、找假设、给反例、生成追问、对比上下文。它们都可以落回一条 AI comment 或 AI annotation，复用现有数据模型。

建议新增 `ReaderAction` 概念，先以 UI action + prompt 分支实现，无需立刻新增持久化表。动作类型可以包括：

- 解释此处：概念、术语、典故、人物、方法。
- 拆解论证：结论、前提、证据、推理跳跃。
- 挑战假设：隐含前提、反例、适用边界。
- 生成追问：把片段转成 1-3 个可继续讨论的问题。
- 联系全文：说明当前片段和文章主线的关系。

### 2. 当前能力最需要补齐：读前定向

结论：进入阅读器后应允许用户选择本次阅读目标，并让 AI 的批注密度、批注类型和读后卡片结构围绕目标收敛。

当前 `AgentAnnotationDensity` 只有低、中、高，`runAgentAnnotateStream()` 的选择标准固定在“值得讨论的片段”。证据：`packages/shared/src/index.ts:44`、`apps/desktop/src/main/llm.ts:145`、`apps/desktop/src/main/llm.ts:367`。

建议增加轻量级“阅读意图”状态：

- 快速了解：降低批注密度，偏向核心主张和结构。
- 深度理解：偏向概念解释、论证拆解和上下文连接。
- 批判审阅：偏向前提、反例、证据强弱和边界。
- 写作取材：偏向金句、可迁移洞见、引用和行动线索。

最小实现可以先存在扩展端 reader settings 和 `agent:annotate` payload 中；读后卡片生成时把阅读意图作为 prompt 输入。后续再进入桌面端持久化。

### 3. 当前能力最适合扩展：问题状态和阅读任务

结论：把“问题”从普通文本升级为可追踪对象，可以显著提高伴读感。

现在问题只通过批注类型 `question` 或评论中含问号被读后卡片收集。证据：`packages/core/src/reading.ts:119`、`packages/core/src/reading.ts:149`。

建议给批注或评论增加轻量状态：

- `open`：仍需继续查证或讨论。
- `answered`：本轮讨论已有可接受回答。
- `parked`：暂存，读后处理。

这会把 AI 伴读从一次性回复升级成“陪你推进未决问题”。读后审议的 `未决问题` 可以自动读取 `open` 和 `parked` 项。

### 4. 当前读后卡片可继续深化：从卡片到回访队列

结论：读后卡片已经形成高价值沉淀，下一步应让它在之后重新出现。

当前 `computeReadingActivityDays()` 已按文章、批注、评论、卡片计算阅读活动，但没有复习或回访实体。证据：`packages/core/src/reading.ts:35`、`packages/core/src/reading.ts:48`。

建议新增“回访队列”：

- 从读后卡片的 `可复用洞见`、`后续行动线索`、`未决问题` 提取条目。
- 每条条目回链到证据单元和原文批注。
- 桌面端提供今日回访列表。
- 用户可以标记已处理、继续追问或打开原文位置。

这条路线能把 Yomitomo 从“读完生成总结”推进到“阅读资产持续产生价值”。

### 5. 中期差异化能力：跨文章连接

结论：当本地文章库积累后，跨文章连接会成为高壁垒能力。

当前文章、批注和卡片都在 SQLite 本地库中，有天然的本地索引基础。证据：`apps/desktop/src/main/db/schema.ts:51`、`apps/desktop/src/main/db/schema.ts:91`。

建议分两步：

- 规则层：按标题、URL、批注类型、关键词、同一问题进行本地搜索和手动关联。
- 语义层：后续引入本地 embedding 或 provider embedding，把新批注连接到过去文章中的相似判断、相反观点和相关问题。

这项能力的价值高，实现成本也高，适合在问题状态和回访队列成立后推进。

## 最终建议

### P0：产品命名校准为“读后笔记”

目标：用户可见命名使用“读后笔记”，内部代码可以继续沿用 `reading-card`，直到后续有足够理由做结构性重命名。

理由：

- “笔记”更接近阅读沉淀和持续回访。
- “卡片”更容易被理解成一次性生成物。
- 本轮只需改产品文案和 KLIP 口径，内部命名改造可以单独评估。

### P0：选择粒度感知的 AI 阅读动作

目标：让用户选中文本后直接获得“解释、拆解、挑战、追问、联系全文”五类动作，结果进入当前批注 thread。

理由：

- 直接服务读中理解。
- 复用现有 `Annotation`、`Comment`、`agent:message` 和 prompt 预算层。
- 与“批注层交互”产品定位一致。
- 体感收益明显，改动边界较小。

### P1：阅读意图驱动的助手精读

目标：用户进入阅读器或发起助手精读时选择阅读意图，AI 主动批注和读后卡片围绕意图组织。

理由：

- 解决 AI 主动批注的泛化问题。
- 让同一篇文章可以按不同目标重读。
- 为读后卡片结构提供用户视角。

### P1：问题状态与未决问题面板

目标：把问题类批注和评论转成可追踪问题，支持 open / answered / parked 状态，并在读后审议中汇总。

理由：

- 伴读的核心体验来自持续推进问题。
- 数据结构可以小幅扩展。
- 与 Cornell 式问题和复述机制一致。

### P2：读后回访队列

目标：从读后卡片、审议和未决问题生成回访项，并在桌面端展示今日回访。

理由：

- 提高读后卡片复用率。
- 把阅读沉淀转成后续行动。
- 需要新增数据实体和桌面 UI，适合在 P0/P1 后推进。

### P2：跨文章连接

目标：基于本地阅读库建立相似观点、相反观点、同类问题和概念网络。

理由：

- 长期壁垒强。
- 依赖足够文章和批注积累。
- 可先规则索引，后续引入语义索引。

## 目标态设计

### 阅读现场

读者选中文本后有两类入口：

- 创建批注：保留当前高亮和手写 note。
- 询问助手：出现动作菜单，动作结果写入当前批注 thread。

助手精读入口增加阅读意图：

```typescript
type ReadingIntent = 'skim' | 'deep_understanding' | 'critical_review' | 'writing_material';
```

`agent:annotate` payload 增加可选字段：

```typescript
type AgentAnnotatePayload = {
  agentId?: string;
  agentUsername: string;
  readingIntent?: ReadingIntent;
  article: {
    title: string;
    url: string;
    text: string;
  };
};
```

### 批注讨论

问题状态可以先落在 `Annotation` 上：

```typescript
type AnnotationQuestionStatus = 'open' | 'answered' | 'parked';

type Annotation = {
  questionStatus?: AnnotationQuestionStatus;
};
```

状态来源：

- 用户手动切换。
- AI 回复后建议标记为 answered。
- 读后审议中将 open / parked 收进 `未决问题`。

### 读后沉淀

读后卡片继续保留三步流程：

1. 阅读审议：汇总共识、张力、证据强弱和未决问题。
2. AI 提炼：生成读后卡片。
3. 卡片审核：检查证据链、归因、覆盖、压缩和行动线索。

新增回访队列：

```typescript
type ReadingReviewItem = {
  id: string;
  articleId: string;
  sourceType: 'reading_card' | 'deliberation' | 'question';
  sourceId: string;
  title: string;
  evidenceAnnotationIds: string[];
  status: 'open' | 'done';
  createdAt: string;
  updatedAt: string;
};
```

## 实施阶段

### Phase 1：AI 阅读动作

- 扩展端 SelectionMenu 增加动作入口。
- 复用当前选区创建临时或正式 annotation。
- 桌面端根据 action 构建 prompt。
- 回复写入批注 thread。
- 测试覆盖 action payload、prompt 构造和 comment 落地。

### Phase 2：阅读意图

- 新增 `ReadingIntent` 类型。
- 扩展端 reader settings 记录当前意图。
- `agent:annotate` payload 携带意图。
- `buildAgentAnnotateStreamPrompt()` 和读后卡片 prompt 使用意图。
- UI 中展示本次阅读目标。

### Phase 3：问题状态

- 扩展 `Annotation` 类型和 SQLite schema。
- 扩展端批注卡片显示问题状态切换。
- 桌面端阅读库和读后卡片读取问题状态。
- 阅读审议 prompt 注入 open / parked 问题列表。

### Phase 4：回访队列

- 新增 `ReadingReviewItem` 类型和 SQLite 表。
- 从读后卡片生成候选回访项。
- 桌面端新增回访视图或阅读库侧栏。
- 支持打开原文证据、标记完成、继续追问。

### Phase 5：跨文章连接

- 先做本地关键词和批注类型连接。
- 增加手动关联入口。
- 后续评估 embedding 存储和检索。

## 验收标准

- [ ] 选中文本后可以直接执行至少三种 AI 阅读动作，结果保存在对应批注 thread。
- [ ] AI 阅读动作输出都能回到原文 anchor，并区分用户问题、文章观点和助手补充。
- [ ] 助手精读支持阅读意图，且不同意图会改变批注类型分布和 prompt 指令。
- [ ] 读后审议能读取并呈现 open / parked 问题。
- [ ] 读后卡片能保留阅读意图和用户关注点，并继续标注证据编号。
- [ ] 回访队列能从读后卡片或未决问题生成条目，并能打开原文批注。
- [ ] 新增能力不破坏未配对扩展的本地批注能力。

## 待讨论

- 阅读意图是否做成全局 reader setting、单篇文章状态，或每次助手精读的临时参数。
- AI 阅读动作结果应默认创建新批注，还是附着到当前选区已有批注。
- 问题状态归属在 `Annotation` 还是 `Comment`。如果一个批注内有多个问题，`Comment` 级状态表达更精确；如果先做最小实现，`Annotation` 级状态改动更小。
- 回访队列是否进入桌面端首页，还是放在阅读库文章详情侧栏。

## 关键参考位置

- `README.md:5`
- `packages/shared/src/index.ts:222`
- `packages/shared/src/index.ts:344`
- `packages/shared/src/index.ts:371`
- `packages/shared/src/index.ts:392`
- `packages/core/src/reading.ts:23`
- `packages/core/src/reading.ts:119`
- `apps/extension/entrypoints/content.tsx:825`
- `apps/extension/entrypoints/content.tsx:866`
- `apps/extension/src/use-agent-annotation-queue.ts:126`
- `apps/desktop/src/main/llm.ts:68`
- `apps/desktop/src/main/llm.ts:139`
- `apps/desktop/src/main/llm.ts:273`
- `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:97`
- `apps/desktop/src/main/db/schema.ts:51`

## 外部参考

- Readwise Reader Ghostreader overview：<https://docs.readwise.io/reader/guides/ghostreader/overview>
- Readwise Reader Ghostreader default prompts：<https://docs.readwise.io/reader/guides/ghostreader/default-prompts>
- Hypothesis personal and collaborative annotation：<https://web.hypothes.is/everyone/>
- Cornell Note-taking System：<https://lsc.cornell.edu/notes.html>
