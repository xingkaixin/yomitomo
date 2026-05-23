# 聚焦共读数据链路与 Prompt 设计

本文档说明聚焦共读从选择助手、自动分析文章、手工编排助手、添加章节留言，到执行共读并合并相同划线想法的完整链路。目标是方便后续接入新的阅读器或调试共读行为。

## 功能边界

聚焦共读不是普通的“让一个助手全文批注”。它先生成或维护一份章节级计划 `FocusCoReadingPlan`，再把计划拆成每位助手自己的 `AgentReadingPlanItem[]` 执行。

核心约定：

- 计划阶段只决定哪些章节值得读、每章分配哪些助手、章节摘要/标签/密度和读者留言。
- 执行阶段才调用批注助手生成真实 `Annotation`。
- 同一划线内容上的 AI 输出会合并为已有批注下的新顶层想法，而不是创建重复批注卡片。
- 计划保存在 `ArticleRecord.focusCoReadingPlan`，批注和想法仍保存在 `ArticleRecord.annotations`。

## 核心数据模型

类型定义在 `packages/shared/src/types.ts`：

```ts
type FocusCoReadingMessage = {
  id: string;
  content: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentIds?: string[];
  agentUsernames?: string[];
  agentNicknames?: string[];
  createdAt: string;
};

type FocusCoReadingSectionPlan = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
  summary?: string;
  tag?: string;
  targetDensity?: AgentAnnotationDensity;
  needsFurtherPlanning?: boolean;
  agentIds: string[];
  messages: FocusCoReadingMessage[];
};

type FocusCoReadingPlan = {
  id: string;
  articleId: string;
  selectedAgentIds: string[];
  sections: FocusCoReadingSectionPlan[];
  readingMemory?: ReadingMemory;
  createdAt: string;
  updatedAt: string;
};

type AgentReadingPlanItem = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
  readingIntent?: AgentReadingIntent;
  sectionSummary?: string;
  sectionTag?: string;
  targetDensity?: AgentAnnotationDensity;
  messages?: AgentReadingPlanMessage[];
};
```

字段含义：

- `selectedAgentIds`：参与规划的助手池，不代表每个章节都会执行。
- `sections`：真正的章节编排。只有有助手、留言、摘要或标签的章节会保存。
- `sectionStart/sectionEnd`：章节在 `article.text` 中的字符范围。执行时模型只能在这个范围内落锚。
- `summary/tag`：自动分析生成的章节级提示，也可以由后续计划延续复用。
- `targetDensity`：该章节批注密度建议，覆盖助手默认密度。
- `messages`：读者给章节或章节内指定助手的留言。
- `readingMemory`：执行过程中产生的压缩阅读记忆，用于后续 segment 上下文。

## UI 入口与组件边界

主要 UI 组件：

- `packages/reader-ui/src/reader-toolbar.tsx`：工具栏“聚焦共读”入口。
- `packages/reader-ui/src/reader-floating-panels.tsx`：弹层容器。
- `packages/reader-ui/src/reader-agent-annotate-menu.tsx`：聚焦共读菜单主体。
- `packages/reader-ui/src/reader-agent-annotate-utils.ts`：计划规范化、留言目标过滤、计划转执行项。

阅读器宿主：

- 网页文章：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx`
- EPUB：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx`

宿主必须传给 `ReaderAppView`：

- `readingSections`
- `focusCoReadingPlan`
- `onPlanFocusCoReading`
- `onSaveFocusCoReadingPlan`
- `onStartAgentReadingPlan`

## 阅读章节来源

聚焦共读基于 `ReaderReadingSection[]` 编排。

网页文章：

- `buildReaderReadingSections(articleRef.current, tocItems, article.title)` 从文章 DOM 和 TOC 推导章节。
- 如果文章有正文前引文，会生成 `intro`。
- 如果没有可用 TOC，会退化成单个 `body` 章节。

EPUB：

- `ebookReaderReadingSections(article, ebookText)` 使用 EPUB index/章节信息生成章节。
- `sectionStart/sectionEnd` 对应全书聚合文本偏移。

新阅读器接入时，最重要的是提供稳定的章节 id 和字符范围。自动分析、手工编排、执行落锚和无剧透上下文都依赖这些范围。

## 选择助手与自动分析

入口：`AgentAnnotateMenu`

链路：

1. 用户点击“聚焦共读”打开菜单。
2. 点击“添加助手”，把助手 id 加入 `selectedAgentIds`。
3. 点击“开始分析文章”触发 `planCoReading()`。
4. `planCoReading()` 调用宿主传入的 `onPlanFocusCoReading(selectedAgentIds)`。
5. 宿主的 `planFocusCoReading(selectedAgentIds)` 调用 `window.yomitomoDesktop.planFocusCoReadingRoute(...)`。
6. main 进程 `focus-co-reading:route` 读取本地 store、找到被选中的 annotation agents，并调用 `planFocusCoReadingRoute(provider, payload, agents)`。
7. AI 返回 `FocusCoReadingRouteResult`。
8. renderer 把 route 合并为新的 `FocusCoReadingPlan` 并保存到 `ArticleRecord.focusCoReadingPlan`。

请求 payload：

```ts
{
  selectedAgentIds,
  sections: readingSections.map(section => ({
    sectionId: section.id,
    sectionTitle: section.title,
    sectionStart: section.start,
    sectionEnd: section.end,
  })),
  chapterSummaries: currentArticle.focusCoReadingPlan?.sections.flatMap(...),
  article: promptArticle(currentArticle, currentArticleText()),
}
```

合并规则：

- route 返回的 `agentIds` 会过滤，只保留用户本轮选择的助手。
- 旧计划里的 `messages` 会按 section 继承，自动分析不会清空读者留言。
- 没有助手、留言、summary、tag 的 section 不保存。
- `readingMemory`、`createdAt` 会从旧计划延续。

## 自动分析 Prompt

实现：`packages/ai/src/focus-route.ts`

system prompt：

- 说明模型是“聚焦共读任务路由”。
- 任务是根据文章章节和助手角色卡，为章节补充摘要、标签，并给出章节级助手分配。
- 只返回 JSON。

### 网页文章 route prompt

函数：`buildFocusCoReadingRoutePrompt()` 的非 EPUB 分支。

拼接内容：

- 文章标题、URL。
- 可分配助手列表：每位助手包含 `agentId`、`agentUsername`、`nickname`、`roleCard`。
- 章节清单：`webRouteSections(payload)`。
  - `sectionId`
  - `sectionTitle`
  - 压缩后的章节文本 `text`

网页章节文本压缩规则：

- `compactRouteSectionText()` 会先压缩空白。
- 小于等于 1200 字符直接放入。
- 超过 1200 字符时保留前 900 字符和后 240 字符。

输出要求：

```json
{
  "sections": [
    {
      "sectionId": "来自章节清单的 sectionId",
      "summary": "一句话说明该章节在说什么",
      "tag": "2 到 6 个字的内容标签",
      "agentIds": ["来自可分配助手的 agentId"]
    }
  ]
}
```

路由规则强调：

- 只能使用可分配助手 id。
- 低密度、过渡、重复章节可以返回空数组。
- 按章节性质匹配助手角色：论证、概念、结构、沉淀等。
- 避免把所有助手集中到同一章节。

### EPUB route prompt

函数：`buildEpubFocusCoReadingRoutePrompt()`

拼接内容：

- 书籍标题、作者、语言、出版方、文件名、章节数、全文长度。
- 可分配助手列表，包含完整角色卡。
- 章节 descriptors：
  - `sectionId`
  - `chapterId`
  - `chapterTitle`
  - `textLength`
  - `segmentCount`
  - `previewStart`
  - `previewEnd`
  - `existingSummary`
  - `existingTag`
- `chapter_route context`：由 `buildChapterRouteContext()` 和 `packReadingContext()` 压缩出来。

EPUB route 不读取整章正文，而是用目录、章节长度、章节 preview、已有摘要和角色卡做章节级规划。prompt 明确要求不要假装读过未提供的整章正文。

输出字段比网页多：

```json
{
  "sections": [
    {
      "sectionId": "来自章节 descriptors 的 sectionId",
      "chapterId": "来自章节 descriptors 的 chapterId",
      "chapterTitle": "来自章节 descriptors 的 chapterTitle",
      "summary": "一句话说明章节内容功能",
      "tag": "2 到 6 个字的内容标签",
      "agentIds": ["来自可分配助手的 agentId"],
      "targetDensity": "low | medium | high",
      "needsFurtherPlanning": true
    }
  ]
}
```

解析保护：

- `parseFocusCoReadingRouteResult()` 只接受已知 section id / chapter id。
- `agentIds` 只保留真实被选助手。
- `targetDensity` 只接受 `low | medium | high`。
- 同一个 section 只保留第一次有效输出。

## 手工编排助手

用户可以在自动分析前后手工调整：

- 顶部添加/移除参与规划的助手。
- 在某个章节展开后添加/移除该章节的助手。
- 清空所有章节分配。
- 对指定章节添加留言。

实现：`AgentAnnotateMenu`

关键函数：

- `addPlanAgent(agentId)`：加入全局参与助手池。
- `removePlanAgent(agentId)`：从全局助手池移除，同时从所有章节 `agentIds` 移除，并过滤掉不再适用的留言。
- `addSectionAgent(sectionId, agentId)`：把助手加入某章节。
- `removeSectionAgent(sectionId, agentId)`：从章节移除助手，并过滤该章节中只发给该助手的留言。
- `clearSectionAssignments()`：清空所有章节助手和留言。
- `saveSections(nextSections)`：生成并保存新的 `FocusCoReadingPlan`。

保存规则：

- 每次手工调整都会调用 `onSaveFocusCoReadingPlan(plan)`。
- 宿主执行 `saveFocusCoReadingPlan(plan)`，通过 `onUpdateArticle(articleId, updater)` 写回文章。
- 最终仍走 `article:save` 落库。

## 添加章节留言

留言是 `FocusCoReadingMessage`，保存在 `FocusCoReadingSectionPlan.messages`。

链路：

1. 用户展开章节。
2. 输入留言。
3. 可以用 `@助手昵称` 指定本章节已分配助手。
4. `addSectionMessage(sectionId)` 调用 `focusMessageFromDraft(content, section, availableAgents)`。
5. `focusMessageFromDraft()` 从留言中提取被 @ 的章节助手。
6. 如果匹配到目标助手，写入 `agentIds/agentUsernames/agentNicknames`。
7. 如果没有 @，该留言是全局留言，对本章节所有助手生效。

过滤规则：

- `filterFocusMessagesForAgents(messages, agentIds)` 会在助手被移出章节时过滤留言。
- 如果留言没有指定目标助手，则只要章节还有任意助手就保留。
- 如果留言指定了多个助手，只保留仍在章节中的目标。

## 开始共读：计划转执行

入口：`AgentAnnotateMenu.startReadingPlan()`

链路：

1. 遍历所有可用助手。
2. 对每个助手，从 `sectionPlans` 中筛选包含该助手 id 的章节。
3. 每个章节调用 `focusSectionToReadingPlanItem(section, agent)` 转成 `AgentReadingPlanItem`。
4. 只把适用于当前助手的 `messages` 放进该助手的 reading plan。
5. 调用 `onStartAgentPlan(agent, readingPlan)`。
6. 宿主关闭菜单并调用 `requestAgentAnnotations(agent, { readingPlan })`。

`focusSectionToReadingPlanItem()` 映射：

- `sectionId/title/start/end` 原样传递。
- `summary -> sectionSummary`
- `tag -> sectionTag`
- `targetDensity` 原样传递。
- `messages` 只保留对当前助手生效的留言。

是否保存阅读记忆：

- `buildAgentAnnotationRequestInput()` 看到 `readingPlan.length > 0` 且不是目标选区请求时，设置 `shouldSaveReadingMemory = true`。
- payload 中会带上 `readingMemory` 和 `readingPlan`。
- AI 执行完成后，renderer 调用 `saveFocusCoReadingReadingMemory(articleId, result.readingMemory)` 合并保存阅读记忆。

## 留言二次路由

执行前，宿主会调用 `routeFocusReadingPlanMessages()`。

目的：如果章节留言里 `@` 了某个助手，先用 `agent:mention-route` 把留言拆成当前执行助手真正需要看到的指令。

链路：

1. 对 reading plan 中每条 message 调用 `routeFocusMessagesForAgent()`。
2. `findMentionedAgents(message.content, agents)` 找出留言提到的助手。
3. 如果没有 @，该 message 保留。
4. 如果 @ 了其他助手而不是当前执行助手，对当前助手过滤掉。
5. 如果 @ 了当前助手，调用 `planAgentMentionRoute()`，允许动作只有 `create_thought`。
6. 返回的 directive 会把 `content` 替换成该助手的具体 instruction，并固定 `agentId/agentUsername/agentNickname` 为当前助手。
7. 路由失败时退回到 `agentInstructionFromNote()` 去掉 @ 称呼后的文本。

这一步保证同一句章节留言可以自然写成“@A 解释概念，@B 挑战前提”，执行时 A 和 B 看到各自的任务。

## 执行共读：生成批注

入口：

- 网页：`app-source-bookcase-web.tsx` 的 `requestAgentAnnotations()`
- EPUB：`app-source-bookcase-ebook.tsx` 的 `requestAgentAnnotations()`

共同链路：

1. 构造 `articleContext = promptArticle(currentArticle, currentArticleText())`。
2. `buildAgentAnnotationRequestInput(agent, { readingPlan }, context)` 构造 `AgentAnnotatePayload`。
3. 通过 `routeFocusReadingPlanMessages()` 二次路由留言。
4. 调用 `runSourceAgentAnnotationRequest()`。
5. preload 发送 `agent:annotate:stream`。
6. main 进程找到 annotation agent 和 readingAssistant provider。
7. `runAgentAnnotateStream(provider, agent, payload, onAnnotation)` 生成批注。
8. renderer 收到每条 `item` 后先用 `constrainAgentPlanAnnotation()` 验证它落在 reading plan 的章节范围内。
9. 验证通过后进入播放/保存链路。

`constrainAgentPlanAnnotation()` 的作用：

- 用 `resolveTextAnchor(articleText, annotation.anchor)` 反解 AI 批注位置。
- 找到包含该位置的 `AgentReadingPlanItem`。
- 找不到对应章节则丢弃。
- 如果章节有 `readingIntent`，覆盖 annotation 和 comment 的 `readingIntent`。

## 网页与 EPUB 执行差异

网页文章：

- `startAgentAnnotationPlayback()` 标记助手正在共读，并启动虚拟阅读动画。
- 收到 annotation 后：
  - 如果是后台 article scoped 写入，直接 `appendAgentAnnotationToArticle()`。
  - 如果是当前文章，进入 `enqueueAgentAnnotation()` 和 `processAgentAnnotationQueue()`，边播放边保存。

EPUB：

- `startEbookPlayback()` 启动 dock 或目标选区虚拟阅读。
- 收到 annotation 后：
  - 当前文章调用 `enqueueEbookAgentAnnotationPlayback()`，通过 Foliate 页面定位和播放。
  - 非当前文章直接 `appendAgentAnnotationToArticle()`。
- 如果批注所在范围当前不可见，播放层会尝试跳转或直接保存。

两者最终都调用 `appendAgentAnnotationToArticle()`，因此保存和合并规则一致。

## 相同划线合并为新想法

核心函数：`packages/reader-ui/src/reader-agent-annotation-playback.ts` 的 `mergeAgentAnnotationAsThought()`

触发点：

- 网页和 EPUB 的 `appendAgentAnnotationToArticle(articleId, annotation)`。
- 网页播放失败或离屏保存时的 `saveAgentAnnotationAsThought()`。

合并规则：

1. 如果已有同 id annotation，直接返回已有数据。
2. 计算 `annotationExactKey(annotation)`。
3. 在现有 annotations 中查找相同 exact key 的批注。
4. 如果找不到，新增一条 annotation，也就是新批注卡片。
5. 如果找到，把 AI annotation 的 comments 追加到已有 annotation 的 `comments` 中。
6. 追加时会把 comment 的 `replyTo` 置空，使它成为该批注卡片下的新顶层想法。
7. 已存在相同 comment id 时跳过，避免重复追加。
8. 返回 `activeId = existing.id`，UI 打开已有批注卡片。

这就是“相同划线内容合并作为新想法，而不是新批注”的核心。它基于划线文本 key，不依赖 AI annotation id。

注意：

- 合并只合并 comment，不合并 AI annotation 的 `annotationType/moveType/whyHere` 到已有 annotation 顶层字段。
- 不同 exact 但语义相近的文本不会合并。
- 执行阶段另有 segment deduper，会减少同一 segment 内重复 exact 或重复 moveType 的输出，但最终落库前仍以 `mergeAgentAnnotationAsThought()` 为准。

## 聚焦共读 Prompt：计划阶段

计划阶段只调用 `focus-co-reading:route`，不生成批注。

设计目标：

- 快速根据章节结构分配助手。
- 不在 EPUB 中读取未提供的整章正文，避免编造。
- 让用户手工留言和已有 summary 能延续进下一轮计划。

网页文章 prompt 使用章节压缩文本，因此可以直接基于章节局部正文判断内容类型。

EPUB prompt 使用 chapter descriptors 和压缩上下文，因此只能做章节级规划。它显式要求：

- 只能基于元数据、目录顺序、章节标题、章节长度、preview 和已有 summary。
- 不要假装读过未提供的整章正文。
- preview 显示章节跨度很大时，设置 `needsFurtherPlanning = true`。

## 聚焦共读 Prompt：执行阶段

执行阶段走 `agent:annotate:stream`，prompt 在 `packages/ai/src/agent-annotation.ts` 和 `packages/ai/src/segment-annotation-runner.ts`。

### 非 segment 执行 prompt

当没有 EPUB segment tasks 时，`buildAgentAnnotateStreamPrompt()` 的 reading plan 分支生效。

拼接内容：

- 文章标题、URL。
- `budgetArticleText(provider, "agent-annotate", context.articleText)` 后的可用原文范围。
- `readingPlanPrompt(payload, context)`：
  - `sectionId`
  - `sectionTitle`
  - `sectionSummary`
  - `sectionTag`
  - `action` / `readingIntent`
  - `actionDescription`
  - `readerMessages`
  - `sectionText`
- 无剧透范围 `spoilerScopePrompt(context)`。
- 批注密度 `annotationDensityInstruction()`。

关键约束：

- 只能在编排列表里的 `sectionText` 内选择批注片段。
- `exact` 必须来自对应 `sectionText` 的连续原文。
- `readerMessages` 是读者给本章节或给当前助手的留言，需要作为阅读关注点。
- 章节 `readingIntent` 有值时，每条批注必须使用它。

### EPUB segment-level prompt

当文章有 `ebookIndex` 且 reading plan 存在时，`buildSegmentAnnotationTasks()` 会把章节拆成 segment task。执行 prompt 来自 `buildAgentSegmentAnnotateStreamPrompt()`。

每个 task 会拼接 `segment-level 上下文`：

- book / chapter / currentSegment 基本信息。
- routeInstruction：
  - `sectionSummary`
  - `sectionTag`
  - `readingIntent`
  - `readerMessages`
- `targetDensity`
- `allowedAnchorRange`，包含允许落锚的 paragraph ids。
- assistant 身份。
- packed blocks：
  - `segment`
  - `retrieved_evidence`
  - `segment_memory`
  - `segment_trace`
  - `next_preview`
  - `chapter_trace`
  - `dedup`

关键约束：

- `currentSegment` 是唯一可落锚原文。
- `exact` 必须来自 `allowedAnchorRange.coreParagraphIds` 覆盖的 current segment 文本。
- retrieved evidence、memory、trace、next preview、chapter trace 只能辅助理解，不能作为落锚来源。
- dedup 块用于避免重复选点、重复 moveType 和相邻批注。
- 没有足够讨论价值时可以不输出任何行。

### 阅读记忆 prompt

EPUB segment 执行后会调用 `generateSegmentReadingMemoryUpdate()`。

prompt 位置：`packages/ai/src/reading-memory.ts`

拼接内容：

- 当前 chapter 和 segment 范围。
- currentSegment 原文。
- previousSummary。
- previousSegmentTrace。
- chapterTrace。
- routeInstruction。
- 当前助手身份。
- 本 segment 已接受的 annotations。

输出：

- `segmentSummary`：只总结原文说了什么。
- `segmentTrace`：记录读到这里注意到什么。
- `chapterTrace`：需要带入后续 segment 的章节级关注点。

保存：

- `runAgentSegmentAnnotateStreamWithMemory()` 每个 segment 后合并 memory。
- renderer 最后调用 `saveFocusCoReadingReadingMemory()` 写回 `focusCoReadingPlan.readingMemory`。

## 存储与 API

相关 IPC：

| Channel | Renderer 方法 | 参数 | 返回 | 用途 |
| --- | --- | --- | --- | --- |
| `focus-co-reading:route` | `planFocusCoReadingRoute(payload)` | `FocusCoReadingRoutePayload` | `FocusCoReadingRouteResult` | 自动分析文章并生成章节级分配 |
| `agent:annotate:stream` | `requestAgentAnnotationsStream(payload, onEvent)` | `AgentAnnotatePayload` | `AgentAnnotateResult` | 执行共读并流式返回批注 |
| `agent:mention-route` | `planAgentMentionRoute(payload)` | `AgentMentionInstructionPayload` | `AgentMentionRoutePlan` | 章节留言二次路由 |
| `article:save` | `saveArticle(article)` | `ArticleRecord` | `ArticleUpsertPatch` | 保存计划、reading memory、批注和评论 |

`FocusCoReadingPlan` 持久化在 `articles.focus_co_reading_plan` JSON 字段中。批注仍持久化在 `annotations` 和 `comments` 表。

## 新阅读器接入检查清单

1. 提供稳定的 `ReaderReadingSection[]`，包含 id、标题、开始/结束文本 offset。
2. 把 `focusCoReadingPlan` 从当前 `ArticleRecord` 传给 `ReaderAppView`。
3. 实现 `onPlanFocusCoReading()`，调用 `focus-co-reading:route`。
4. 实现 `onSaveFocusCoReadingPlan()`，通过 `onUpdateArticle()` 写回 `ArticleRecord.focusCoReadingPlan`。
5. 实现 `onStartAgentReadingPlan()`，调用 `requestAgentAnnotations(agent, { readingPlan })`。
6. 确保 `promptArticle()` 的 `text` 与 section offset 使用的是同一份文本。
7. 执行 AI 输出后必须经过 `constrainAgentPlanAnnotation()`，避免跨章节落锚。
8. 保存 AI 输出时必须经过 `mergeAgentAnnotationAsThought()`，保证相同划线合并为新想法。
9. 长文或电子书应提供 index、segment、paragraph 信息，否则无法使用 segment-level 上下文和 reading memory。

## 调试建议

- 自动分析后没有章节分配：检查 `selectedAgentIds` 是否为空、route 返回的 `agentIds` 是否被过滤掉、section id 是否匹配。
- 手工留言执行时没进 prompt：检查留言是否在 `focusSectionToReadingPlanItem()` 中适用于当前助手。
- `@助手` 留言没有按助手拆分：检查 `routeFocusReadingPlanMessages()` 和 `agent:mention-route` 返回的 directive。
- AI 批注落在计划外章节被丢弃：检查 `resolveTextAnchor()` 是否能反解位置，以及 `sectionStart/sectionEnd` 是否对应同一份文章文本。
- 相同划线仍出现重复卡片：检查两个 annotation 的 `anchor.exact` 规范化后是否一致；当前合并基于 exact key。
- EPUB 共读引用了不应出现的内容：检查 `ebookIndex`、reader progress、segment task 和 `spoilerScopePrompt()`。
