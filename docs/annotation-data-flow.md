# 划线批注、想法与 AI 数据链路

本文档面向后续接入新的阅读器实现。目标不是描述 UI 细节，而是说明从“用户划线并添加想法”到本地持久化、AI 回复、AI 新想法、审阅评论的核心数据链路和 API 边界。

## 核心模型

批注数据挂在 `ArticleRecord.annotations` 上。每条划线是一个 `Annotation`，每条想法或回复是一个 `Comment`。

关键类型在 `packages/shared/src/types.ts`：

```ts
type TextAnchor = {
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  paragraphId?: string;
  chapterId?: string;
  segmentId?: string;
  textStartInParagraph?: number;
  textEndInParagraph?: number;
  textStartInBook?: number;
  textEndInBook?: number;
  quoteHash?: string;
};

type Annotation = {
  id: string;
  anchor: TextAnchor;
  author: "user" | "ai";
  annotationType?: AnnotationType;
  readingIntent?: AgentReadingIntent;
  color: string;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
};

type Comment = {
  id: string;
  author: "user" | "ai";
  content: string;
  createdAt: string;
  replyTo?: string;
  readingIntent?: AgentReadingIntent;
  reviewLabel?: ReviewOpinionLabel;
  pending?: boolean;
};
```

含义约定：

- `Annotation.anchor` 是划线定位的唯一事实来源。新阅读器接入时，最重要的是能从用户选区生成可恢复的 `TextAnchor`。
- `Annotation.comments` 是卡片中的想法列表和回复树。
- `replyTo` 为空的 `Comment` 是一个顶层“想法”。
- `replyTo` 指向某个顶层想法或回复的 `Comment` 是回复。当前卡片 UI 按顶层想法组织 thread。
- 用户划线时会先创建空评论的 `Annotation`，然后再把用户文本写成第一条顶层 `Comment`。这样即使用户只是 `@助手`、不保存自己的想法，也有一个锚点可以承接助手想法。
- `pending: true` 只用于前端流式占位，不应作为最终持久化状态依赖。

## 选区到锚点

### 网页文章

入口：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx`

链路：

1. 用户在文章 DOM 中划线。
2. `handleArticleMouseUp()` 读取 `Selection` 和 `Range`。
3. `offsetFromArticleStart(articleElement, range.startContainer, range.startOffset)` 和结束 offset 计算选区在全文 `articleRef.current.textContent` 中的位置。
4. 普通网页文章调用 `createTextAnchor(articleText, start, end)`。
5. 如果文章带 `ebook.index`，则调用 `createEpubTextAnchor(article.ebook.index, articleText, start, end)`。
6. `openSelectionAction()` 打开选择菜单，临时高亮由 `rangeHighlightBoxes()` 生成。
7. 用户选择批注后，`openComposer()` 打开输入框，提交后进入 `createAnnotation(note)`。

### EPUB 电子书

入口：`apps/desktop/src/renderer/src/use-ebook-selection.ts`

链路：

1. 用户在 Foliate iframe 文档中划线。
2. `handleFoliateSelection(doc)` 读取 iframe 内部 `Selection` 和 `Range`。
3. 通过 `ebookChapterForFoliateSection()` 定位当前章节。
4. `selectionContextForRange()` 提取选区前后文。
5. `createEpubTextAnchorFromQuote(article.ebook.index, ebookText, range.toString(), { chapterId, prefix, suffix })` 在全书文本中反查锚点。
6. 无法定位时提示“无法定位这段选区，请缩短或重新选择”。
7. 可定位时调用 `openSelectionAction()`，之后和网页文章一样走 `createAnnotation(note)`。

新阅读器接入要求：

- 必须能给出当前阅读内容的纯文本 `articleText`。
- 必须能把选区转换为 `TextAnchor`。最低要求是 `exact/start/end/prefix/suffix`；电子书建议补齐 `chapterId/segmentId/paragraphId/textStartInBook/textEndInBook`，这样 AI 上下文、无剧透范围和高亮恢复更稳定。
- 必须能根据 `Annotation.anchor` 重新计算页面高亮 boxes，用于正文高亮、侧栏卡片定位和点击命中。

## 用户划线添加想法

网页和 EPUB 的 `createAnnotation(note)` 逻辑基本一致。

入口：

- 网页：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx`
- EPUB：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx`

链路：

1. 读取当前文章和当前选区 `composer.anchor`。
2. `promptArticle(currentArticle, currentArticleText())` 构造 AI 可用文章上下文。
3. `findMentionedAgents(note, annotationAgents)` 找出 `@助手`。
4. `createUserAnnotation(currentComposer.anchor, userProfile, "")` 创建用户批注，初始不带想法。
5. `saveAnnotations([...currentArticle.annotations, annotation])` 保存批注锚点。
6. 如果没有 `@助手`：
   - `createUserComment(userProfile, note, { now: annotation.createdAt })` 创建顶层想法。
   - `appendAnnotationComment(..., annotation.id, comment, annotation.createdAt)` 写入 `comments`。
   - `inferAnnotationMetadata()` 异步推断 `annotationType` 和 `readingIntent`。
7. 如果有 `@助手`：
   - 先调用 `agent:mention-route` 决定是否保存用户想法，以及每个助手执行 `comment` 还是 `create_thought`。
   - `createUserThought === true` 时，同样保存用户原文为顶层想法。
   - `comment` 指令走 AI 回复链路。
   - `create_thought` 指令走 AI 新想法链路。

这里的设计原则是：用户写下的真实想法只以原文保存，不由路由模型改写；路由模型只负责判断是否保存以及助手该怎么响应。

## 批注卡片中添加想法

入口：`packages/reader-ui/src/reader-annotation-card.tsx`

链路：

1. 用户点击“添加想法”。
2. `InlineCommentComposer` 提交文本，调用 `addTopLevelComment(content)`。
3. `addTopLevelComment()` 调用 `onAddComment(annotation.id, content)`，不传 `replyTo`。
4. 宿主阅读器传入的 `onAddComment` 来自 `useSourceAnnotations().addComment()`。
5. `addComment(annotationId, content)`：
   - trim 空文本，空则返回。
   - `createUserComment(userProfile, trimmed)` 创建用户顶层想法。
   - `appendAnnotationComment(currentArticle.annotations, annotationId, comment, comment.createdAt)` 写入对应批注。
   - `saveAnnotations(nextAnnotations)` 保存整篇文章。
   - `findMentionedAgents(trimmed, annotationAgents)` 找出 `@助手`。
   - `onCommentSaved({ annotation, comment, mentionedAgents })` 通知宿主触发 AI 回复。

如果顶层想法中包含 `@助手`，网页和 EPUB 宿主都会对每个被提及助手调用 `requestAgentComment(agent, annotation, comment)`。

## 批注卡片中想法添加回复

入口：`packages/reader-ui/src/reader-annotation-card.tsx`

链路：

1. 用户展开某条顶层想法。
2. 点击回复，`openReplyComposer(commentId)` 设置 `replyToCommentId`。
3. 回复输入框提交后调用 `addReply(content, replyTo)`。
4. `addReply()` 调用 `onAddComment(annotation.id, content, replyTo)`。
5. `useSourceAnnotations().addComment(annotationId, content, replyTo)` 创建带 `replyTo` 的用户评论。
6. 保存后同样触发 `onCommentSaved()`；若回复里 `@助手`，会请求 AI 在同一个 thread 下回复。

删除规则：

- 删除批注：`deleteAnnotation(annotationId)` 直接移除整条 `Annotation`。
- 删除想法或回复：`deleteAnnotationComment()` 会删除目标 comment，以及所有 `replyTo` 指向它的子回复。

## 保存与持久化

共享 hook：`apps/desktop/src/renderer/src/use-source-annotations.ts`

核心函数：

- `saveAnnotations(nextAnnotations)`：排序后生成新 `ArticleRecord`，更新本地状态，然后调用 `onSaveArticle(nextArticle)`。
- `applyAnnotations(nextAnnotations)`：只更新当前阅读器本地状态，不立即落库，主要用于流式 AI 占位。
- `replaceAnnotations(nextAnnotations)`：外部文章更新进入当前阅读器时替换本地批注状态。

桌面端 API：

| 层级 | API | 作用 |
| --- | --- | --- |
| renderer preload | `window.yomitomoDesktop.saveArticle(article)` | 调用 `article:save` |
| IPC contract | `article:save` | 参数 `ArticleRecord`，返回 `ArticleUpsertPatch` |
| main store | `saveArticle(input)` | 写入 SQLite 后回读文章，返回 patch |
| SQLite | `articles`、`annotations`、`comments` | 文章、批注、评论分表存储 |

持久化细节在 `apps/desktop/src/main/store.ts`：

- `writeArticleRows()` upsert `articles`。
- 然后删除该文章所有旧 `annotations`。
- 再按当前 `article.annotations` 重建 `annotations` 和 `comments`。
- `annotation.anchor`、`ebookIndex`、`focusCoReadingPlan` 等复杂字段以 JSON 存储。

这意味着批注保存当前是“文章级替换”，不是单条 comment patch。新阅读器如果并发写入同一文章，应通过现有 `onUpdateArticle(articleId, updater)` 队列读取最新文章后再合并，避免覆盖其他窗口刚写入的批注。

## Desktop IPC/API 清单

类型定义：`apps/desktop/src/ipc-contract.ts`

### 文章与批注保存

| Channel | Renderer 方法 | 参数 | 返回 | 用途 |
| --- | --- | --- | --- | --- |
| `article:get` | `getArticle(id)` | `id` | `ArticleRecord \| null` | 读取完整文章和批注 |
| `article:save` | `saveArticle(article)` | `ArticleRecord` | `ArticleUpsertPatch` | 保存文章、批注、评论 |
| `article:reading-progress` | `saveArticleReadingProgress(articleId, progress)` | 阅读进度 | `ArticleReadingProgressPatch` | 保存阅读进度 |

### AI：划线后添加想法相关

| Channel | Renderer 方法 | 参数 | 返回 | 用途 |
| --- | --- | --- | --- | --- |
| `annotation:metadata` | `inferAnnotationMetadata(payload)` | `AnnotationMetadataPayload` | `AnnotationMetadata` | 根据选区和用户想法推断批注类型与阅读动作 |
| `agent:mention-route` | `planAgentMentionRoute(payload)` | `AgentMentionInstructionPayload` | `AgentMentionRoutePlan` | 判断 `@助手` 后是否保存用户想法，以及助手执行 `comment` / `create_thought` |
| `agent:comment` | `requestAgentComment(payload)` | `AgentMessagePayload` | `Comment` | 非流式助手回复 |
| `agent:comment:stream` | `requestAgentCommentStream(payload, onEvent)` | `AgentMessagePayload` | `Comment` | 流式助手回复，前端边收边写入占位 comment |
| `agent:annotate` | `requestAgentAnnotations(payload)` | `AgentAnnotatePayload` | `AgentAnnotateResult` | 非流式助手创建批注/想法 |
| `agent:annotate:stream` | `requestAgentAnnotationsStream(payload, onEvent)` | `AgentAnnotatePayload` | `AgentAnnotateResult` | 流式助手创建批注/想法 |
| `agent:review` | `requestAgentReview(payload)` | `AgentReviewPayload` | `Comment[]` | 审阅助手给顶层想法添加审阅回复 |

## 前端演出状态边界

批注、想法和 AI 回复的事实来源只有 `ArticleRecord.annotations`。虚拟鼠标、
dock 栏和临时剧场高亮都是阅读器内存态，用来表现“助手正在读”和“正在添加想法”，
不会写入 SQLite，也不能作为批注保存成功的判断依据。

相关类型与组件：

- `VirtualCursorState`：定义虚拟鼠标位置、label、离场状态和离屏方向。
- `AgentDockItem`：只记录 dock 中助手的 `active` / `done` 展示状态。
- `agentTheaterBoxes`：播放 AI 新批注时的临时高亮 boxes，动画结束后清空；最终正文高亮仍来自 `Annotation.anchor`。
- `AgentReadingDock` / `VirtualCursor`：只渲染宿主阅读器传入的内存状态。

普通 `agent:comment:stream` 只更新批注卡片中的 AI comment 占位、增量内容和
`pending` 状态，不启动聚焦共读的虚拟阅读和 dock 完成演出。它的保存边界仍是
流式完成后调用 `saveAnnotations()`。

AI 新想法链路会涉及演出：当前文章收到 AI annotation 时，阅读器会先把 annotation
放入播放队列，尝试把锚点映射成 viewport 坐标，移动虚拟鼠标并展示
`agentTheaterBoxes` 临时高亮；播放完成后才通过 `mergeAgentAnnotationAsThought()`
保存或合并为真实批注/想法。后台文章或无法播放的场景会跳过演出，直接保存合并结果。

## AI 回复链路

入口：`apps/desktop/src/renderer/src/app-source-agent-comment-request.ts`

触发场景：

- 用户创建划线想法时 `@助手`，且路由给出 `comment` 指令。
- 用户在批注卡片中添加想法或回复时 `@助手`。
- `runSourceAgentCommentRequest()` 也支持 `reviewTargetCommentId`，但当前批注卡片的“审阅”入口主要走 `agent:review` 批量审阅链路。

链路：

1. `runSourceAgentCommentRequest()` 先在本地追加一个 `pending` AI comment，占位位置为：
   - `reviewTargetCommentId`，或
   - `userComment.replyTo`，或
   - `userComment.id`。
2. 调用 `window.yomitomoDesktop.requestAgentCommentStream(payload, onEvent)`。
3. main 进程通过 `agent:comment:stream` 找到目标助手和 provider。
4. `runAgentStream(provider, agent, payload, onDelta)` 生成 prompt 并流式调用 provider。
5. renderer 收到 `start` 后用真实 comment id 替换占位，收到 `delta` 后通过 `updateAnnotationComment()` 追加内容。
6. 完成后把 `pending` 设为 false，并 `saveAnnotations(nextAnnotations)` 持久化。

`AgentMessagePayload` 包含：

- `agentId` / `agentUsername`
- `readingIntent`
- `instruction`
- `reviewTargetCommentId`
- `agentRoster`
- `article: { title, url, text, ebookIndex }`
- `annotation`
- `userComment`

## AI 新想法链路

入口：`apps/desktop/src/renderer/src/app-source-agent-request.ts`

触发场景：

- 用户划线输入框只 `@助手` 或明确要求助手“写一个想法”。
- 聚焦共读或主动伴读让助手在文章/章节中创建批注。

链路：

1. `buildAgentAnnotationRequestInput(agent, options, context)` 构造 `AgentAnnotatePayload`。
2. 如果传入 `targetAnchor`，生成单项 reading plan：`targetAnchorReadingPlan(targetAnchor, readingIntent)`。
3. target 模式下 `payload.annotations = context.annotations`，用于 AI 看到附近已有批注。
4. 调用 `requestAgentAnnotationsStream(payload, onEvent)`。
5. main 进程执行 `runAgentAnnotateStream()`。
6. AI 输出 JSON/NDJSON suggestion。
7. `createAgentAnnotation(agent, payload.article.text, suggestion, now, { ebookIndex })` 把 suggestion 反定位成真正 `Annotation`。
8. renderer 收到流式 `item` 后调用 `appendAgentAnnotationToArticle()`。
9. `mergeAgentAnnotationAsThought()` 会尝试把同一锚点上的助手批注合并为已有批注下的一条 AI 顶层想法，而不是无条件新建一张卡片。
10. 保存时仍走 `article:save`。

target 选区模式下，AI suggestion 的 `exact/prefix/suffix` 会被 `targetAnchorSuggestion()` 强制覆盖为用户选区，避免模型把锚点漂移到上下文其他句子。

## 审阅助手链路

入口：`apps/desktop/src/renderer/src/app-source-agent-review-request.ts`

链路：

1. 批注卡片中有顶层想法时显示“审阅”入口。
2. 用户选择审阅助手后调用 `runSourceAgentReviewRequest()`。
3. 对每位审阅助手调用 `requestAgentReview({ agentId, agentUsername, article, annotation })`。
4. main 进程调用 `runAgentReview()`。
5. AI 返回 JSON 数组，每个元素绑定一个 `thoughtId`。
6. 返回的 comment 带 `replyTo = thoughtId` 和 `reviewLabel`。
7. renderer 通过 `appendAnnotationComment()` 写到对应想法 thread 下。
8. 全部审阅完成后统一 `saveAnnotations()`。

重复控制：

- `reviewerAlreadyCommented()` 会避免同一审阅助手对同一个顶层想法重复写入带 `reviewLabel` 的评论。
- `runAgentReview()` 也会把已经审阅过的 thought id 从可审阅集合里排除。

## Prompt 拼接规则

### 统一文章上下文

renderer 通过 `promptArticle(currentArticle, articleText)` 构造传给 AI 的文章对象：

```ts
{
  title: currentArticle?.title || "",
  url: currentArticle?.canonicalUrl || currentArticle?.url || "",
  byline: currentArticle?.byline,
  text: articleText,
  ebookIndex: currentArticle?.ebook?.index,
  ebookMetadata: currentArticle?.ebook?.metadata,
}
```

网页文章的 `articleText` 来自 DOM `textContent`；EPUB 的 `articleText` 来自 `ebookArticleText(article)`，即整本书聚合文本。

### 用户想法标签 prompt

函数：`packages/ai/src/annotation-metadata.ts` 的 `buildAnnotationMetadataPrompt()`

拼接内容：

- 文章标题
- 文章 URL
- 用户选区 `anchor.exact`
- 用户批注 `note`
- 批注类型候选和阅读动作候选

输出：`{ annotationType, readingIntent }`。

注意：这里不拼接全文，只做轻量分类。

### @助手语义路由 prompt

函数：`buildAgentMentionInstructionPrompt()`

拼接内容：

- 文章标题、URL
- 目标选区 `targetAnchor.exact`，或目标章节标题与章节文本
- 用户文本
- 被 `@` 的助手列表 `{ agentId, agentUsername, nickname, personalityName }`
- 可选阅读动作列表
- 允许执行动作 `comment` / `create_thought`

输出：

- `createUserThought`
- `directives[]`

该 prompt 不要求模型回答正文问题，只做路由决策。

### 助手回复 prompt

函数：`packages/ai/src/agent-message.ts` 的 `buildAgentPrompt()`

system prompt：

- `buildAgentRoleCard(agent)` 注入角色卡。
- 说明当前助手身份、是否为审阅模式、回复会成为批注 thread 中的一条评论。
- 注入 `readingIntentSystemPrompt(payload)`。

user prompt 分两类：

1. EPUB 或带 `ebookIndex` 的文章优先使用 thread-first 上下文：
   - `buildReadingContextBundle()` 根据 `targetAnchor`、阅读进度和无剧透策略裁剪可用文本。
   - `buildSelectionThreadContext()` 生成：
     - 原选区 `selection`
     - 附近原文 `local_window`
     - 裁剪后的 thread 历史和最新用户评论
     - 同章 lexical 召回 `retrieved_evidence`
   - `selectionThreadContextPrompt()` 把这些块 JSON 化到 prompt 中。
2. 没有 thread-first 上下文时使用全文预算裁剪：
   - `budgetArticleText(provider, "agent-message", context.articleText)`
   - 拼接“可用原文范围”
   - 拼接“用户高亮”
   - 拼接“当前批注讨论”
   - 拼接“刚刚触发你的读者评论”

两种路径都会拼接：

- 文章标题、URL
- 阅读动作说明
- 读者具体要求 `instruction`
- 讨论参与者
- 当前发言助手身份规则
- 可提及的读者账号
- 无剧透范围说明 `spoilerScopePrompt(context)`

### 助手新想法 prompt

函数：`packages/ai/src/agent-annotation.ts` 的 `buildAgentAnnotatePrompt()` / `buildAgentAnnotateStreamPrompt()`

system prompt：

- 注入角色卡。
- 如果有 `targetAnchor`：说明“对读者选中的文本创建批注，只围绕目标选区本身展开”。
- 如果无 `targetAnchor`：说明“主动阅读文章并创建批注，只标出真正值得讨论的原文片段”。
- 注入阅读动作系统说明。

user prompt 分三类：

1. 聚焦共读 reading plan：
   - `budgetArticleText()` 裁剪可用原文。
   - `readingPlanPrompt()` 拼接每个 section 的 `sectionText`、summary、tag、readerMessages、readingIntent。
   - 要求 `exact` 必须来自对应 `sectionText`。
2. 目标选区 `targetAnchor`：
   - 网页文章主要拼接文章标题、URL、目标选区、阅读动作、批注类型、读者指令。
   - EPUB 会额外拼接 `selection-first 上下文`，包含局部窗口、附近批注、章节记忆、同章召回。
   - 要求只返回 1 条，`exact` 必须等于目标选区。
3. 主动全文批注：
   - `budgetArticleText()` 裁剪全文。
   - 拼接“可用原文范围”、阅读动作、无剧透范围、批注密度和类型说明。
   - 输出 JSON 数组或 NDJSON。

模型输出不会直接保存。必须经过 `createAgentAnnotation()`：

- 在 `payload.article.text` 中匹配 `exact`。
- 匹配成功才生成 `Annotation`。
- 电子书会用 `ebookIndex` 生成 EPUB 锚点。
- 匹配失败会跳过，避免保存无法定位的 AI 批注。

### 审阅 prompt

函数：`packages/ai/src/agent-review.ts` 的 `buildAgentReviewPrompt()`

拼接内容：

- 角色卡 system prompt，说明审阅标签和审阅规则。
- 文章标题、URL。
- `budgetArticleText(provider, "agent-message", context.articleText)` 后的可用原文范围。
- 无剧透范围。
- 用户高亮 `annotation.anchor.exact`。
- 待审阅想法 JSON：只包含顶层想法 `{ id, author, content }`。
- 已审阅 thought id 排除提示。

输出 JSON 数组：

- `thoughtId`
- `label`
- `content`

renderer 再把每条结果作为 `replyTo = thoughtId` 的 AI comment 写回批注。

## 新阅读器接入检查清单

1. 提供文章纯文本：用于 `promptArticle()`、锚点定位和 AI exact 匹配。
2. 选区生成 `TextAnchor`：普通文档可用 `createTextAnchor()`；电子书类内容优先建立 index 后使用 EPUB 风格锚点。
3. 实现高亮 boxes：根据 `annotationsRef.current` 和当前 viewport 计算每条批注的 DOM/画布矩形。
4. 复用 `useSourceAnnotations()`：不要在新阅读器里重新实现评论追加、删除、保存和 stale article 防护。
5. 接入 `AnnotationCard` / `ReaderAppView` 时，把 `onAddComment`、`onDelete`、`onDeleteComment` 传回 `useSourceAnnotations()`。
6. 保存批注统一走 `onSaveArticle()` 或 `onUpdateArticle()`，最终落到 `article:save`。
7. 需要 AI 回复时复用 `runSourceAgentCommentRequest()`。
8. 需要 AI 围绕选区创建想法时复用 `buildAgentAnnotationRequestInput()` 和 `runSourceAgentAnnotationRequest()`。
9. 需要 `@助手` 智能路由时调用 `planSelectionMentionRoute()`，不要在新阅读器里硬编码 `@` 文本语义。
10. 电子书或长文接入时传入 `ebookIndex`、阅读进度和稳定章节/段落 id，否则 AI 上下文只能退化到全文预算裁剪。
11. 如果支持助手新想法演出，必须把 `Annotation.anchor` 映射为 viewport 坐标，提供不可见内容 fallback，并在文章切换、播放取消和组件卸载时清理 interval/timeout、虚拟光标、临时高亮和 dock 状态。

## 调试建议

- 如果划线后卡片出现但刷新后定位失败，优先检查 `TextAnchor.exact/start/end/prefix/suffix` 是否对应同一份 `articleText`。
- 如果 EPUB AI 回复引用了未读内容，检查 `ebookIndex`、`readerProgress` 和 `spoilerPolicy` 是否传入。
- 如果 `@助手` 后没有保存用户想法，先看 `agent:mention-route` 的 `createUserThought`。用户只发指令时这是预期行为。
- 如果 AI 新想法没有出现，检查模型输出的 `exact` 是否能在 `payload.article.text` 中匹配；匹配失败会被 `createAgentAnnotation()` 丢弃。
- 如果卡片中回复层级不对，检查 `Comment.replyTo`。顶层想法必须为空，回复必须指向已有 comment id。
