---
Author: "Codex"
Updated: 2026-05-20
Status: Draft
---

# klip-17-ai-reading-experience-productization

## 背景

- Yomitomo 的核心产品承诺不是“替用户读完”，而是在阅读现场增加理解、共鸣和反思。这个承诺成立的前提是：AI 少说、说准、能记得、可被用户调教。
- 当前产品已经有锚定批注、用户想法、@助手讨论、审阅助手、EPUB segment context 和 reading memory 的工程底座；主要缺口不是再增加一个总结功能，而是把“克制陪读”变成可控、可验证、可持续改进的产品闭环。
- 从第一性原理看，阅读体验的稀缺资源是用户注意力。任何主动 AI 输出都在消耗注意力，因此它必须先通过“是否值得打断”的判断，再进入界面。
- 主动批注的最大风险不只是不够聪明，而是出现得太早。网页滚动位置和 EPUB 当前页只能说明文本暴露在屏幕上，不能证明用户已经读到或准备好被打断。
- 用户对“几年后打开还记得”的期待，本质不是云端人格记忆，而是本地保存的阅读痕迹能被重新组织出来：我当时关注了什么、和 AI 争论过什么、哪些问题还没解。
- 本 KLIP 聚焦产品落地任务清单，目标是让 Yomitomo 从“有伴读功能”推进到“伴读体验稳定可复用”。

## 现状结论（代码校准）

- 选区入口当前是低摩擦的“记录想法”，不是“一键总结”。证据：`packages/reader-ui/src/reader-selection-menu.tsx:7` 的 `SelectionMenu`，以及 `packages/reader-ui/src/reader-selection-menu.tsx:34` 的按钮文案“记录想法”。
- 批注卡已经支持“原文引用 + 想法 + 回复 + @助手 + 审阅”的讨论结构。证据：`packages/reader-ui/src/reader-annotation-card.tsx:23` 的 `AnnotationCard`，`packages/reader-ui/src/reader-annotation-card.tsx:435` 的 `DiscussionThreadView` 渲染入口，`packages/reader-ui/src/reader-annotation-card.tsx:471` 和 `packages/reader-ui/src/reader-annotation-card.tsx:748` 的输入 placeholder。
- @助手是显式用户意图，不是纯主动打扰。证据：`apps/desktop/src/renderer/src/use-source-annotations.ts:152` 在保存评论后通过 `findMentionedAgents` 识别被提及的助手；Web/EPUB 选区创建也在 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:356` 和 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:495` 使用同一机制。
- 用户划线后提交 composer 时，当前系统先创建用户-owned 引文批注，再用 mention route 判断用户输入是否成为 primary comment，以及每个被 @助手执行 comment 还是 create-thought。证据：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:349` 和 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:488` 的 `createAnnotation` 都先调用 `createUserAnnotation` 并保存；随后调用 `planSelectionMentionRoute`，再分流到 `requestAgentComment` 或 `requestAgentAnnotations`。
- AI 批注生成已经分为普通路径和 EPUB segment 路径。证据：`packages/ai/src/agent-annotation.ts:86` 的 `runAgentAnnotateWithMemory`，`packages/ai/src/agent-annotation.ts:102` 的 `runAgentAnnotateStream`，以及 `packages/ai/src/segment-annotation-runner.ts:254` 的 `createSegmentAnnotation`。
- 助手主动创建 thought 目前来自两类显式用户动作：共读菜单启动 reading plan，或用户划线后 @助手并被 route 判定为 create-thought；不是自动监听滚动或翻页。证据：`packages/reader-ui/src/reader-agent-annotate-menu.tsx:412` 组装 `readingPlan` 并调用 `onStartAgentPlan`，Web/EPUB 分别在 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:964` 和 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1157` 触发 `requestAgentAnnotations`。
- 主动 thought 的播放链路已有队列和“助手正在添加想法”的动效，但还没有基于用户真实阅读进度的展示时机闸门。证据：Web 在 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:647` 启动 `startVirtualReading`；EPUB 在 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:803` 启动 dock；网页批注队列在 `packages/reader-ui/src/use-agent-annotation-queue.ts:76` 取出候选后播放并保存。
- segment prompt 已要求模型输出 `moveType`、`whyHere`、`evidenceUsed`、`confidence`、`shouldShow`，并明确避免“这段说明了”式摘要。证据：`packages/ai/src/segment-annotation-runner.ts:279` 和 `packages/ai/src/segment-annotation-runner.ts:292`。
- 当前展示前过滤主要依赖模型自己的 `shouldShow` 和锚定成功。证据：`packages/ai/src/agent-annotation.ts:67` 与 `packages/ai/src/segment-annotation-runner.ts:254` 都直接跳过 `suggestion.shouldShow === false`；`packages/core/src/annotations.ts:165` 的 `createAgentAnnotation` 在 `findAgentAnnotationMatch` 失败时返回 `null`。
- 当前“克制程度”是助手级配置，不是阅读会话级模式。证据：`packages/shared/src/types.ts` 中 `Agent.annotationDensity` 使用 `AgentAnnotationDensity`；设置页选项来自 `apps/desktop/src/renderer/src/app-settings.ts:57` 的 `annotationDensityOptions`。
- 阅读记忆已有文章内结构，但还不是面向用户的“重访记忆”。证据：`packages/shared/src/types.ts:426` 定义 `ReadingMemory`，`packages/shared/src/types.ts:662` 的 `FocusCoReadingPlan` 持有 `readingMemory`，`packages/core/src/reading-memory.ts:10` 合并 memory，`packages/ai/src/reading-memory.ts:19` 为 EPUB segment 生成 memory update。
- 持久化层已经保存文章、批注、评论和 focus co-reading plan。证据：`apps/desktop/src/main/db/schema.ts:64` 的 `articles` 表包含 `focusCoReadingPlan`，`apps/desktop/src/main/db/schema.ts:91` 的 `annotations` 表保存 `moveType`、`whyHere`、`evidenceUsed`、`confidence`、`shouldShow`，`apps/desktop/src/main/db/schema.ts:127` 的 `comments` 表保存讨论内容。
- 离线评估已有指标结构，但它不是阅读现场的实时质量闸门或用户反馈闭环。证据：`packages/ai/src/evaluation.ts` 定义 `annotationValue`、`noiseControl`、`anchorHitRate`、`duplicateAnnotationRate` 等评估字段。

## 目标

- P0：建立阅读位置与展示时机闸门，避免用户刚滚到或刚翻页时被 AI 抢先打断。
- P0：建立 AI 输出质量闸门，减少套话、复读、弱依据和低价值内容。
- P0：把“批注密度”升级为阅读会话级“介入模式”，让用户能在静读、同读、精读之间切换。
- P1：明确划线 composer 中“用户想法”“助手评论”和“助手想法”的产品分流；用户确实写下想法时必须原文保存，只有 @助手场景才进入意图判断。
- P2：聚焦共读留言复用同一套 mention route，但本轮只生成每个助手的 create-thought 指令，不新增评论已有想法动作。
- P1：建立文章级重访记忆，让用户重新打开文章或 EPUB 章节时能看到上次阅读留下的关键问题、观点和争论。
- P1：建立本地价值反馈信号，让“无价值 / 有价值 / 保留”的用户动作反向影响后续展示策略，但不把观点喜好当作评价维度。
- P2：把首次体验做成可感知闭环：导入内容后快速出现一条高质量锚定互动，但不强迫用户进入总结或读后产物流程。

## 非目标

- 不恢复“读后笔记”“读后总结”“读后产出物”作为主路径。
- 不做跨设备云同步、账号体系、团队协作或云端长期人格记忆。
- 不在本轮引入 vector database、embedding pipeline 或模型微调。
- 不新增大量助手人格来掩盖质量问题；优先提高同一条输出是否值得展示。
- 不重写阅读器、EPUB 导入链路或现有批注卡组件结构。
- 不引入遥测。所有反馈和质量信号先保持本地优先。
- 不改写用户真实写下的想法。可以为路由和 prompt 提取结构化意图，但展示和持久化的用户 thought 必须保留用户原文。
- 不把“滚动到某区域”或“翻到某页”直接等同于“用户已读到这里”。
- 不默认在用户每次滚动、翻页或定位跳转后自动生成并展开批注。
- 不在本轮让聚焦共读助手主动评论章节内已有 thought；这是合理动作，但作为 P3 等待真实用户反馈后再设计。

## 术语表

- 质量闸门：AI 生成候选输出之后、写入或展示之前的确定性评估层，输出 `show` 或 `drop`，并记录原因。
- 介入模式：一次阅读现场的 AI 主动程度，独立于具体助手人格和 provider 配置。
- 静读：AI 不主动出现；用户手动记录想法或 @助手时才响应。
- 同读：AI 克制参与；默认低密度、折叠展示，只在高置信位置出现。
- 精读：AI 主动协助拆解结构、追踪论证、连接前文，适合研究或难文。
- 阅读位置：系统根据滚动、翻页、锚点、停留时间推断出的屏幕位置；它只是曝光位置，不等同于真实阅读进度。
- 可展示时机：某条 AI thought 可以进入界面的时间点，必须晚于候选生成，并满足稳定、读到、未打扰三个条件。
- 助手想法：助手直接创建的 anchored annotation，属于主动或半主动阅读产物。
- 助手评论：助手回复某条用户想法或 thread 的 comment，属于用户显式发起的讨论产物。
- 重访记忆：从已保存的用户想法、AI 回复、审阅观点和 reading memory 中整理出的文章级回看线索。
- 本地价值反馈信号：用户对某条 AI 输出的无价值、有价值、保留动作，只保存在本机，用于后续过滤和排序，不用于训练“迎合用户观点”。

## 选择理由

- 先做展示时机闸门，而不是自动绑定滚动或翻页：因为位置暴露不等于已经阅读，过早出现比内容平庸更容易破坏心流。
- 先做质量闸门，而不是先做更复杂的记忆层：因为差内容会直接破坏阅读心流，属于体验正确性问题。
- 先做会话级介入模式，而不是继续调助手级密度：因为用户当下的阅读状态比助手人格更能决定是否应该被打断。
- 先做文章级重访记忆，而不是跨文章知识图谱：因为用户最先感知到的是“这篇我以前怎么读过”，跨文章主题聚合需要更稳定的本地记忆语义后再做。
- 先用确定性规则和已有数据，而不是引入二次 LLM 审稿：因为本轮要降低噪声和成本，避免把质量问题转移给另一个模型调用。
- 用户输入意图分流只在出现 @助手时介入。没有 @助手时，用户输入就是用户想法；有 @助手时，才判断这段内容是“用户想法 + 助手参与”，还是“纯粹给助手下指令”。
- 用户输入意图分流不应改写用户原文。划线 composer 里“我写了想法并 @助手”和“我没有写想法，只是在要求助手回应或写想法”是不同动作，产品上需要可见的判断和可撤回的结果。

## 设计概览

1. 主动 thought 必须先过时机闸门，再进入阅读器
   - 可以提前生成候选，但不能因为用户刚滚到或刚翻页就立刻展开。
   - Web 以稳定滚动窗口和锚点进入已读区域为信号；EPUB 以当前页稳定和页内锚点读到概率为信号。

2. AI 输出必须先过质量闸门，再保存或展示
   - 模型可以提出候选批注，但产品不直接相信模型的“我值得展示”。
   - 闸门根据锚定、内容、依据、重复度和打扰成本做确定性判断。

3. 阅读现场由用户选择介入模式
   - `quiet` 保留手动记录和 @助手。
   - `companion` 保留少量主动批注，但默认收敛。
   - `deep` 使用现有 focus co-reading 能力做更主动的精读。

4. 助手评论和助手想法分开建模
   - 划线本身永远是用户创建的引文批注，应立即出现并归属用户。
   - 用户写下自己的想法并 @助手时，用户原文作为 primary comment，助手可回复 comment。
   - 用户只是在请求助手给一个角度时，不创建用户想法内容，但仍保留用户-owned 引文批注，助手可在该引文下创建 assistant thought。

5. 聚焦共读留言只路由为 create-thought 指令
   - 全局留言继续作为章节级 create-thought 关注点。
   - @助手留言会被拆成每个助手自己的 create-thought instruction。
   - `comment_existing_thought` 暂不纳入本轮，避免用户看不懂助手完成了什么。

6. 重访记忆先从真实痕迹中提取
   - 第一版不要求 AI 生成“读后总结”。
   - 优先展示用户自己写过的想法、用户追问过的问题、高置信 AI 回应和审阅标签。

7. 用户反馈形成本地价值回路
   - 无价值代表“这条不值得占用注意力”。
   - 有价值代表“这种介入方式对我有帮助”。
   - 保留代表“这条是阅读资产”，重访时优先露出。

## 方案细节

### 1. P0：阅读位置与展示时机闸门

核心原则：位置只能触发“候选生成”，不能直接触发“展开展示”。用户刚滚到某段、刚翻到某页时，系统最多可以开始准备，但不应抢先把 thought 打开。

建议新增 runtime 层的 `ReadingReadinessGate`，第一版不持久化，只在阅读器会话中判断：

```typescript
export type ReadingSurfaceKind = 'web' | 'ebook';

export type ReadingReadinessDecision = {
  action: 'hold' | 'reveal';
  reason:
    | 'viewport_unstable'
    | 'page_unstable'
    | 'anchor_not_reached'
    | 'too_soon_after_navigation'
    | 'user_is_composing'
    | 'ready';
};
```

Web 判断：

- 滚动停止后只进入 stable 状态，不立刻 reveal。
- 候选 thought 的 anchor 必须进入“已读区域”才可 reveal；第一版可用 viewport 上半区或中心线之后作为近似，不用猜测用户眼动。
- 用户正在选区、输入 composer、打开 thread 或手动导航时，主动 thought 继续 hold。
- 如果候选在当前 viewport 下半区，默认不展开，避免用户还没读到就看到 AI 观点。

EPUB 判断：

- `relocate` 或翻页后只更新当前页，不立刻 reveal。
- 当前页上半区 thought 可以在页面稳定后进入折叠提示；下半区 thought 需要更晚出现，或等用户停留足够久后再 reveal。
- 若无法可靠判断页内位置，宁可只显示“助手有想法”的轻提示，不自动展开内容。
- 翻页本身不能作为生成和展示的唯一依据。

展示策略：

- `companion` 模式：符合时机后仍默认折叠，只显示助手、锚点和轻量状态。
- `deep` 模式：可以播放“助手正在阅读 / 添加想法”的过程，但最终 thought 仍要等 anchor 可展示。
- 主动共读生成的 thought 应在卡片样式上和用户手动想法区分：例如更轻的外观、明确的助手创建者、默认收起正文。

实施入口：

- Web：在 `packages/reader-ui/src/use-agent-annotation-queue.ts` 的 `processAgentAnnotationQueue` 播放前增加 readiness 判断；没有 ready 时保留队列，不调用 `playAgentAnnotationPlayback`。
- EPUB：在 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx` 的 `handleEbookStreamItem` 入队或播放前加入当前页 readiness 判断。
- 阅读位置计算应放在 reader-ui / desktop renderer 层，不进入 `packages/ai`。AI 负责生成候选，UI 负责何时打扰用户。

验收重点：

- 用户刚滚动停止或刚翻页时，AI thought 不会立即展开。
- 用户正在写想法或选区时，主动 thought 不抢焦点。
- 同一条候选在 hold 后仍可在用户读到位置时出现，而不是被永久丢弃。

### 2. P0：AI 输出质量闸门

建议新增纯函数，优先放在 `packages/core/src/annotations.ts` 或独立 `packages/core/src/annotation-quality.ts`。它只依赖候选 suggestion、已生成 annotation、已有 annotations 和运行上下文，不调用 provider。

```typescript
export type AnnotationQualityDecision = {
  action: 'show' | 'drop';
  reasons: AnnotationQualityReason[];
};

export type AnnotationQualityReason =
  | 'model_should_hide'
  | 'anchor_not_found'
  | 'empty_comment'
  | 'generic_summary'
  | 'weak_grounding'
  | 'low_confidence'
  | 'duplicate_anchor'
  | 'duplicate_move_nearby';
```

主动 thought 第一版规则：

- `suggestion.shouldShow === false`：`drop`。
- 锚定失败：`drop`，继续沿用 `createAgentAnnotation` 返回 `null` 的语义。
- `comment.trim()` 为空：`drop`。
- 明显套话：`drop`。例如以“这段说明了”“这句话很有道理”“作者在这里提到”开头，且没有具体概念、问题或反驳。
- `confidence === 'low'` 且缺少 `whyHere` 或 `evidenceUsed`：`drop`。
- 相同 exact 或近距离相同 `moveType`：`drop`。segment 路径已有 `createSegmentAnnotationDeduper`，需要把重复判断抽到普通路径也可复用的位置。
- 第一版不做 `draft` 状态，避免新增复杂 UI。候选只有展示或丢弃。

助手 comment 也需要质量约束，但不要和 thought 混用同一套锚定闸门：

- 用户 @助手后，助手回复的是 thread comment，不能因为“没有新锚点”被丢弃。
- comment 的低价值处理重点是空泛复述、无视用户问题、没有回应划线内容。
- 第一版可以在 comment prompt 和测试中处理，不新增 comment schema。

实施入口：

- `packages/ai/src/agent-annotation.ts`：普通和 stream 路径在 `createAgentAnnotation` 后、push 或回调前应用闸门。
- `packages/ai/src/segment-annotation-runner.ts`：`createSegmentAnnotation` 继续负责构造 annotation，但 `runAgentSegmentAnnotate*` 在 accept 前应用统一闸门。
- `packages/core/src/annotations.ts`：保留锚定和 annotation 构造；新增质量评估时不要把 provider、React 或 Electron 依赖带进 core。

验收重点：

- 差 thought 不能写入 `annotations` 表。
- 闸门原因能进入测试和 debug log，但不要求在 UI 中展示给普通用户。
- 普通 Web 文章路径和 EPUB segment 路径使用同一套规则。
- 用户显式 @助手得到的 comment 不被误判为主动 thought。

### 3. P0：阅读介入模式

新增类型建议放在 `packages/shared/src/types.ts`：

```typescript
export type ReadingInterventionMode = 'quiet' | 'companion' | 'deep';
```

模式映射：

| 模式 | 主动 thought | 手动记录 | @助手回复 | 默认密度 | 默认展示 |
|---|---:|---:|---:|---|---|
| `quiet` | 关闭 | 开启 | 开启 | none | 不出现 AI 主动卡 |
| `companion` | 开启 | 开启 | 开启 | low | 时机满足后折叠显示 |
| `deep` | 开启 | 开启 | 开启 | medium/high | 使用 focus co-reading，但仍过时机闸门 |

实施入口：

- `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx` 和 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx`：阅读器顶部或助手入口增加三段式模式切换。
- `apps/desktop/src/renderer/src/app-source-agent-request.ts`：`buildAgentAnnotationRequestInput` 根据 mode 决定是否构造 proactive request、是否传入 reading plan、是否覆盖 `targetDensity`。
- `packages/shared/src/types.ts`：`FocusCoReadingPlan` 可以增加可选 `interventionMode?: ReadingInterventionMode`。由于 `focusCoReadingPlan` 是 JSON 字段，第一版不需要新增 SQLite 列。
- `packages/reader-ui/src/reader-annotation-card.tsx`：`companion` 模式下 assistant thought 默认折叠；用户主动打开后保持现有讨论体验。

规则边界：

- `quiet` 不能禁用用户手动选区、写想法和 @助手。
- `quiet` 不删除已有 AI thought，只影响新的主动生成和默认展示。
- 模式优先级高于助手自身 `annotationDensity`，但不永久改写 `Agent.annotationDensity`。

### 4. P1：用户输入意图分流

当前逻辑是：用户划线并提交 note 后，系统创建用户 thought；如果 note 提到了助手，助手回复 comment。这个逻辑适合“我有一个想法，想和助手讨论”的场景，但不覆盖“我希望助手直接给这个选区写一个想法”的场景。

边界原则：

- 用户划线后，引文批注本身立即创建，author 归属用户；gate 不决定这条引文是否存在。
- 没有 @助手时，不进入语义 gate，直接把用户输入作为该引文下的用户 thought 保存。
- 有 @助手时，gate 只判断用户文本中是否存在真实用户想法，以及每个助手要 comment 还是 create_thought；不负责润色、提炼或替换用户想法。
- 只要判定用户写下了自己的想法，用户原文必须完整进入 primary comment。
- 若判定用户没有写想法，只是在给助手下指令，则不创建用户 primary comment，但保留用户-owned 引文批注，并触发 assistant thought。

建议分流规则：

- 用户输入了实质性观点 + @助手：创建用户 thought，助手回复 comment。
- 用户只输入 @助手、或明显是“你怎么看 / 给我一个角度 / 帮我想想”：允许创建 assistant thought，但 UI 需要让用户知道这是“让助手写想法”，不是普通评论。
- 用户没有输入内容：不自动推断为助手 thought，除非用户明确点了“让助手写想法”动作。

实现上不要完全依赖 LLM 判断用户意图。第一版可以用确定性规则加 UI 二次确认；LLM gate 只处理有 @助手且规则不明确的文本：

- composer 检测到“只有 @助手或短指令”时，把提交按钮文案切换为“让助手写想法”。
- 仍保留“作为我的想法保存”的路径，避免误判。
- assistant thought 生成后默认折叠，并标明创建者是助手。

这部分需要进一步产品确认，尤其是“短指令”的边界和是否引入显式按钮。

### 5. P2：聚焦共读留言路由

聚焦共读当前的主动作是 assistant thought：助手在章节内选择值得讨论的原文并创建想法。如果生成的 thought 和已有划线相同，现有 `mergeAgentAnnotationAsThought` 会把它合并到已有 annotation 的 comments 中，而不是新增重复划线。

本轮只增强“留言如何进入每个助手 prompt”：

- 不 @助手的留言：作为该章节的全局 create-thought 关注点，传给本章节所有被安排的助手。
- @一个助手的留言：只传给该助手，并去掉无关 @称呼。
- @多个助手且语义不同的留言：通过 mention route 拆成每个助手自己的 create-thought instruction。
- 即使用户写了“评论已有想法”，本轮也不执行 `comment_existing_thought`，只把它降级为 create-thought 关注点。

这样做的原因：

- 聚焦共读结束后，用户仍能用“新增了哪些想法”理解助手完成了什么。
- 不引入“助手只评论、没有新增划线”的不可见完成状态。
- 复用同一套 mention route 能力，为 P3 的 `comment_existing_thought` 留出动作类型，但不提前暴露复杂行为。

### 6. P1：文章级重访记忆

先明确边界：当前数据库保存的是阅读事件结果，不等于已经有了记忆系统。真正的记忆需要把这些结果按文章、助手、时间和触发来源整理成可复用上下文。

第一版重访记忆不做“总结生成”，而是从已保存事实中抽取：

- 用户 top-level 想法：`Annotation.author === 'user'` 的 primary comment。
- 用户追问或 @助手触发的 thread：`comments.replyTo` 以及提及助手后的 AI 回复。
- AI 高质量 thought：通过质量闸门、`confidence !== 'low'`、有 `whyHere` 或 `moveType` 的批注。
- 审阅观点：`Comment.reviewLabel`。
- EPUB segment reading memory：`FocusCoReadingPlan.readingMemory.textSummaries` 和 `readingTraces`。

记忆分层：

- 文章共享记忆：这篇文章里发生过什么，包含用户想法、未解问题、保留的 AI thought 和关键 thread。所有助手都可以读取，因为它属于文章现场。
- 助手局部记忆：某个助手在这篇文章里说过什么、提出过哪些问题、被用户保留或判为无价值的内容。用于保持角色连续性，不用于隔离文章事实。
- 跨文章记忆：不纳入本 KLIP。后续可以基于共享文章记忆做检索，但不能直接把原始 comments 当作跨文章记忆。

建议新增 core 纯函数：

```typescript
export type ArticleRevisitMemoryItem = {
  id: string;
  kind: 'user_thought' | 'open_question' | 'valuable_ai_note' | 'review_point' | 'reading_trace';
  title: string;
  excerpt: string;
  agentId?: string;
  annotationId?: string;
  commentId?: string;
  anchor?: TextAnchor;
  updatedAt: string;
};
```

实施入口：

- `packages/core/src/revisit-memory.ts`：从 `ArticleRecord` 推导 `ArticleRevisitMemoryItem[]`，先不调用 LLM。
- `packages/reader-ui/src/reader-annotation-card.tsx` 或阅读器 rail 外层：增加轻量“上次阅读”入口，展示 2-3 条可跳转记忆。
- Web/EPUB 阅读器打开文章时计算；若后续 EPUB 长书性能有压力，再把 snapshot 写入 `FocusCoReadingPlan` 的可选字段。
- 若要支持更好的回放语义，需要给新生成的 annotation/comment 记录最小 provenance：例如来自 selection、mention reply、co-reading、review，以及生成时的阅读位置快照。

展示原则：

- 不弹窗，不打断打开文章。
- 不写“这是你的阅读总结”。
- 文案应贴近事实，例如“上次你在这里追问过”“你曾保留这条反驳”“这章前面留下过一个未解问题”。

### 7. P1：本地价值反馈信号

反馈动作先限制为三种：

- 无价值：这条 AI 输出不值得占用注意力，后续降低同类展示优先级。
- 有价值：这种介入方式对阅读有帮助，后续同类输出更容易通过展示闸门。
- 保留：作为重访记忆候选优先展示。

明确不做的判断：

- 不提供“不喜欢这个观点”作为负反馈。
- 不把“观点和我不同”当作错误。
- 不让反馈训练助手迎合用户立场；反馈只影响价值、时机和噪声控制。

数据建议：

- 第一版可以给 `Annotation` 增加可选字段，而不是新建复杂反馈表。

```typescript
export type AnnotationUserFeedback = {
  notValuableAt?: string;
  valuableAt?: string;
  keptAt?: string;
};
```

- SQLite 层可在 `annotations` 表增加 `user_feedback` JSON 字段；如果只做 UI 状态而不持久化，会破坏“用户调教”的产品承诺，不建议。
- 不复用现有 `shouldShow` 字段表示用户价值反馈；`shouldShow` 是模型输出语义，用户反馈是产品语义，混用会让后续评估失真。

实施入口：

- `packages/shared/src/types.ts`：新增 `AnnotationUserFeedback` 和 `Annotation.userFeedback?: AnnotationUserFeedback`。
- `apps/desktop/src/main/db/schema.ts`：`annotations` 表新增 `userFeedback` JSON 字段。
- `packages/reader-ui/src/reader-annotation-card.tsx`：AI thought 卡提供无价值、有价值、保留三个小动作；用户批注不显示这些动作。
- `packages/core/src/annotations.ts`：新增更新 feedback 的纯函数，避免 UI 直接手改 annotation shape。

### 8. P2：首次体验闭环

首次体验只解决一个问题：用户导入第一篇文章后，尽快理解 Yomitomo 是“和你一起读”，不是“替你总结”。

建议任务：

- 导入示例文章或首次导入真实文章后，默认进入 `companion`，不默认 `deep`。
- 首次主动 AI 输出最多一条，必须通过时机闸门和质量闸门。
- 第一条 AI thought 优先选择 `ask_question`、`surface_assumption` 或 `connect_previous`，避免概括全文。
- 选区菜单仍以“记录想法”为主，不把“一键总结”放在主按钮。
- 如果未配置 provider，首次体验应引导配置 provider，而不是展示空白 AI 状态。

## 数据存储

- P0 时机闸门优先使用 runtime state，不新增存储；滚动停留、页内稳定和 composer active 状态不需要落库。
- P0 质量闸门不要求新增存储；被丢弃的候选不写入 `annotations`。
- P0 介入模式优先使用 renderer runtime state，并可选写入 `FocusCoReadingPlan.interventionMode`。该字段落在 `articles.focusCoReadingPlan` JSON 内，不需要新增 SQLite 列。
- P1 重访记忆第一版从 `ArticleRecord.annotations`、`comments` 和 `focusCoReadingPlan.readingMemory` 现算；只有性能或跨会话排序需要时，再追加 `FocusCoReadingPlan.revisitMemory` snapshot。
- P1 provenance 建议作为可选字段追加到 `Annotation` 或 `Comment`：例如 `origin?: 'selection' | 'mention_reply' | 'co_reading' | 'review'` 和 `readingPositionSnapshot?: { source: 'web' | 'ebook'; anchorId?: string; progress?: number }`。第一版只记录新数据，不迁移旧数据。
- P1 用户反馈需要持久化，建议新增 `annotations.user_feedback` JSON 字段，并同步更新 `Annotation` 类型。

## 交互与工作流

### 静读

1. 用户打开文章。
2. 模式为 `quiet`。
3. 系统不主动请求 assistant thought。
4. 用户划线后仍可“记录想法”。
5. 用户在想法中 @助手时，助手只回复该 thread。

### 同读

1. 用户打开文章。
2. 模式为 `companion`。
3. 系统低密度准备主动 thought 候选。
4. 候选 thought 先通过质量闸门，再等待阅读位置满足时机闸门。
5. 满足时机后默认折叠进入 rail，不抢焦点；用户展开后进入讨论。

### 精读

1. 用户选择 `deep` 或启动 focus co-reading。
2. 系统按章节或 segment 生成 reading plan。
3. segment 批注使用 existing `readingMemory`、`chapterTrace`、`dedupContext`。
4. 每条候选 thought 仍需通过质量闸门和时机闸门。
5. 主动共读 thought 默认以助手创建者样式折叠展示，和用户手动想法区分。
6. 结束或 idle 后，更新 article-level 重访记忆。

### 划线请求助手想法

1. 用户划线后打开 composer。
2. 提交后立即创建用户-owned 引文批注并打开。
3. 用户写入自己的想法并 @助手：把用户原文保存为 primary comment，助手回复 comment。
4. 用户只输入 @助手或短指令：不创建用户 primary comment，助手在同一引文批注下生成 assistant thought。
5. gate 产物只进入助手 prompt，不替换用户内容。
6. assistant thought 仍走质量闸门和默认折叠展示。

### 重访

1. 用户重新打开读过的文章或 EPUB。
2. 阅读器轻量显示“上次阅读”入口。
3. 用户可跳转到保留的想法、未解问题或关键 AI 批注。
4. 不自动生成总结，不自动弹出对话。

## 实施阶段

### Phase 1：阅读位置与时机闸门

- [ ] 定义 Web / EPUB 的 runtime readiness decision。
- [ ] Web 主动 thought 播放前检查 viewport stable、anchor reached、composer inactive。
- [ ] EPUB 主动 thought 播放前检查 page stable、anchor position、navigation cooldown。
- [ ] `companion` 模式下主动 thought 默认折叠，不抢 active annotation。
- [ ] 补 Web scroll 和 EPUB page turn 的组件或 hook 测试。

### Phase 2：质量闸门

- [ ] 定义 `AnnotationQualityDecision` 和 `AnnotationQualityReason`。
- [ ] 在普通 assistant thought 路径应用闸门。
- [ ] 在 EPUB segment thought 路径应用闸门。
- [ ] 明确 assistant comment 的低价值回复测试，不和 thought 闸门混用。
- [ ] 抽出普通路径和 segment 路径都能复用的重复判断。
- [ ] 补 `packages/core` 和 `packages/ai` 测试。

### Phase 3：介入模式

- [ ] 新增 `ReadingInterventionMode` 类型。
- [ ] 在阅读器增加 `quiet / companion / deep` 切换。
- [ ] `quiet` 禁止 proactive annotation request，但保留 @助手。
- [ ] `companion` 映射为低密度和默认折叠。
- [ ] `deep` 复用现有 focus co-reading path。

### Phase 4：用户输入意图分流

- [x] composer 区分“用户想法 + 助手评论”和“让助手写想法”。
- [x] 划线提交后先创建用户-owned 引文批注；gate 不决定引文是否存在。
- [x] 没有 @助手时不调用语义 gate，直接保存用户原文 thought。
- [x] 有 @助手且判定为用户想法时，primary comment 必须保留用户原文。
- [~] 只有 @助手或短指令时，提交动作提供明确文案或二次确认；当前先通过 route 决定是否创建 assistant thought，显式 UI 文案后续补。
- [~] assistant thought 创建后记录 provenance，并默认折叠展示；当前已创建 assistant thought，provenance 和折叠样式后续补。
- [x] 保留当前用户 thought + assistant comment 路径。

### Phase 5：聚焦共读留言路由

- [x] 聚焦共读 reading plan 发送前按当前助手路由 section messages。
- [x] @留言只产出 create-thought instruction，不新增评论已有 thought。
- [x] 全局留言继续传给本章节被安排的助手。
- [~] P3 `comment_existing_thought` 延后，等待真实用户反馈。

### Phase 6：重访记忆

- [ ] 新增 `ArticleRevisitMemoryItem` 类型。
- [ ] 从现有 annotations、comments、readingMemory 推导重访条目。
- [ ] 区分 article shared memory 和 per-agent memory view。
- [ ] 新增最小 provenance 字段，记录 selection / mention reply / co-reading / review 来源。
- [ ] 阅读器增加非打扰式“上次阅读”入口。
- [ ] 支持点击记忆跳转到对应 anchor 或 thread。

### Phase 7：价值反馈信号

- [ ] 新增 `AnnotationUserFeedback` 类型和 schema 字段。
- [ ] AI thought 卡增加无价值、有价值、保留动作。
- [ ] 无价值的 AI thought 默认降低展示优先级或不进 rail。
- [ ] 有价值和保留参与重访记忆排序。
- [ ] 质量闸门在后续请求中读取本地反馈统计。

### Phase 8：首次体验

- [ ] 首次导入后默认 `companion`。
- [ ] provider 未配置时给出明确入口。
- [ ] 第一条主动 AI thought 最多一条且必须通过时机闸门和质量闸门。
- [ ] 不新增“一键总结”主入口。

## 测试矩阵

| 场景 | 测试类型 | 覆盖要求 / 优先级 |
|---|---|---|
| Web 刚滚动到目标区域 | component / hook | 主动 thought 进入 hold，不自动展开，P0 |
| Web anchor 进入已读区域且 composer inactive | component / hook | hold 的 thought 可 reveal，P0 |
| EPUB 刚翻页 | component / integration | 当前页 thought 不立即展开，P0 |
| EPUB 页面稳定后上半区 anchor | component / integration | 可折叠提示，不抢 active annotation，P0 |
| `shouldShow === false` 的候选 | unit | 必须被质量闸门丢弃，P0 |
| 空评论、锚定失败、套话评论 | unit | 不写入 annotation，P0 |
| 用户 @助手请求 comment | unit / integration | 不被 thought 质量闸门误丢弃，P0 |
| 相同 exact 或近距离相同 `moveType` | unit | 普通路径和 segment 路径都去重，P0 |
| 高置信、有 `whyHere`、有 evidence 的挑战型批注 | unit | 必须保留，P0 |
| `quiet` 模式 | component / integration | 不主动请求 AI，但 @助手仍触发回复，P0 |
| `companion` 模式 | component | 低密度、默认折叠、不抢焦点，P0 |
| `deep` 模式 | integration | 继续走 focus co-reading / segment path，P0 |
| 划线 + 纯 @助手指令 | integration | 先创建用户-owned 引文批注，assistant thought 合并到同一引文下，P1 |
| 没有 @助手的划线 composer | unit / integration | 不调用语义 gate，原文保存为用户 thought，P1 |
| 用户想法 + @助手 | integration | primary comment 保留原文，助手回复 comment，P1 |
| 只有 @助手或短指令的划线 composer | component | 能进入“让助手写想法”路径，P1 |
| 聚焦共读 @多助手留言 | unit | 路由为每个助手的 create-thought instruction，P2 |
| 聚焦共读要求评论已有想法 | unit / manual | 本轮不执行 comment_existing_thought，降级为 create-thought 关注点，P2 |
| 重访记忆生成 | unit | 从用户想法、审阅标签、readingMemory 推导条目，P1 |
| per-agent memory view | unit | 同一文章共享记忆可读，助手局部贡献可区分，P1 |
| 重访记忆跳转 | component | 点击可定位到批注或 thread，P1 |
| 用户标记 AI thought 无价值 | integration | 持久化后降低默认展示优先级，P1 |
| 有价值 / 保留反馈 | unit | 参与重访排序，不影响原文批注数据，P1 |

## 验收标准

- [ ] 用户刚滚动到某段或刚翻到某页时，主动 AI thought 不会立即展开。
- [ ] 用户正在选区、输入想法或阅读 thread 时，主动 AI thought 不会抢焦点。
- [ ] 在一组手工样例文章中，明显套话型 AI 批注不会出现在阅读器。
- [ ] `quiet` 模式下，系统不会主动生成 AI 批注；用户 @助手仍能收到回复。
- [ ] `companion` 模式下，主动 AI 批注数量低于或等于现有 low density 上限，并且默认不打断当前阅读焦点。
- [ ] `deep` 模式下，现有 EPUB segment reading memory 和 dedup 能力继续可用。
- [x] 划线本身始终先创建为用户-owned 引文批注，纯 @助手指令不会把引文归属给助手。
- [ ] 用户划线并写下自己的想法时，用户原文完整保存，助手以 comment 参与；用户明确让助手写想法时，助手可创建 assistant thought。
- [ ] 用户重新打开读过的文章时，可以看到至少 2 条来自真实阅读痕迹的重访线索；没有历史痕迹时不展示空状态噪音。
- [ ] 用户标记一条 AI thought 无价值后，关闭再打开文章仍不会默认高优先展示该 thought。
- [ ] 所有新增能力保持本地优先，不引入云同步或遥测。

## 成本与风险

- 时机闸门可能让用户感觉“AI 反应慢”。缓解方式：允许轻量状态提示，但不展开内容；把候选生成和内容 reveal 分开。
- 阅读位置只能近似，无法知道真实眼动。缓解方式：宁可保守，默认折叠，并允许用户手动展开。
- 质量闸门可能误杀有价值但表达短的批注。缓解方式：规则保持少而清晰，先只丢弃高确定性噪声。
- 介入模式如果和助手密度同时存在，容易形成设置歧义。缓解方式：介入模式控制“这次阅读是否主动出现”，助手密度控制“这个助手主动时的上限”。
- 用户输入意图分流可能误判。缓解方式：关键路径使用明确文案或二次确认，不静默把用户想法改成助手想法。
- 重访记忆如果写得像总结，会重新滑向“读后产物”。缓解方式：第一版只展示真实痕迹，不生成抽象总结。
- 反馈字段会引入 schema migration。缓解方式：放在 Phase 7，并保持字段可选；P0/P1 前半段不依赖它。

## 待讨论

- 默认介入模式是否为 `companion`，还是首次打开文章默认 `quiet`、用户启动同读后才进入 `companion`。
- Web 的“已读区域”第一版用 viewport 上半区、中心线，还是显式 dwell time。
- EPUB 当前页的下半区 thought 是否永远不自动展开，只做轻提示。
- `generic_summary` 的规则是否只做中文，还是同时覆盖英文常见套话。
- `companion` 下 AI thought 默认折叠到什么程度：只显示锚点高亮、显示一行摘要，还是仅 rail 提示。
- 划线 composer 是否新增显式“让助手写想法”按钮，还是通过输入内容动态切换提交动作。
- P3 是否引入 `comment_existing_thought`，以及完成状态如何让用户理解“助手评论了已有想法但没有新增划线”。
- 文章共享记忆和助手局部记忆是否都写入 snapshot，还是第一版只在 runtime 推导。
- 重访记忆是否需要跨文章主题聚合。本文建议另开 KLIP，不纳入本轮。
