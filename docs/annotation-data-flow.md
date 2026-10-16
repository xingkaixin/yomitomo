# 批注、想法与 AI 数据流

本文记录当前 Web、EPUB 和 PDF 阅读器共享的批注边界。重点是数据由谁拥有、在哪一层转换，
以及何时真正写入 SQLite；临时高亮、虚拟鼠标和 dock 都不是持久化事实来源。

## 事实来源与模块边界

`ArticleRecord.annotations` 是阅读器中的批注事实来源。`Annotation.anchor` 定位原文，
`Annotation.comments` 保存顶层想法和回复；`Comment.replyTo` 为空表示顶层想法，否则指向
同一批注中的父评论。

作者只保存 `agentId`/`userId` 等身份字段，SQLite 行和 `article:get` 返回的批注都不带头像。
renderer 用 store 中的用户资料和全部助手（含已停用的助手和审阅助手，见
`apps/desktop/src/renderer/src/source/bookcase/source-public-agents.ts` 的 `publicPersonaAgents`）
解析头像。IPC 序列化不会合并重复字符串，把头像写进每条批注会让负载随批注数线性放大。

类型定义位于：

- `packages/shared/src/sources/article-types.ts`：`ArticleRecord`。
- `packages/shared/src/annotation-types.ts`：`Annotation` 和 `Comment`。
- `packages/shared/src/anchor-types.ts`：`TextAnchor`。

各层职责如下：

| 层 | 稳定入口 | 职责 |
| --- | --- | --- |
| source reader | `apps/desktop/src/renderer/src/source` | 把 Web、EPUB、PDF 选区转换为锚点，并提供正文坐标 |
| renderer orchestration | `apps/desktop/src/renderer/src/source/bookcase/use-source-reader-session.ts` | 组合批注状态、AI 请求和各阅读器播放适配器 |
| shared reader UI | `packages/reader-ui/src/annotations/reader-annotation-card.tsx` | 展示批注 thread，发出新增、回复、删除和审阅意图 |
| IPC contract | `apps/desktop/src/ipc-contract.ts` | 统一声明保存、删除和 AI channel 的参数与返回值 |
| main persistence | `apps/desktop/src/main/store/store-articles.ts` | 将 renderer 意图路由到文章、批注和评论 repository |
| core/AI | `packages/core/src/reader/annotations.ts`、`packages/core/src/reader/agent-annotations.ts`、`packages/ai/src/agent` | 纯数据变换、合并规则、prompt 构造和模型输出解析 |

## 选区到锚点

三种阅读器只共享“产出可恢复锚点”的契约，不共享 DOM 或 PDF 几何实现。

### Web

`apps/desktop/src/renderer/src/source/web/app-source-bookcase-web.tsx` 读取 DOM
`Selection`/`Range`，再用全文字符偏移创建 `TextAnchor`。高亮 box 由
`apps/desktop/src/renderer/src/source/web/use-web-reader-boxes.ts` 从 DOM range 计算。

### EPUB

`apps/desktop/src/renderer/src/source/ebook/use-ebook-selection.ts` 读取 Foliate iframe 选区，
结合章节、前后文和全书文本反查 EPUB 锚点。章节与全书坐标转换位于
`packages/core/src/epub/ebook-index.ts`。无法稳定定位时不创建批注。

全书文本按 `textContent` 提取，`<br>` 处没有空白；选区文本和 iframe 内的锚点恢复把 `<br>` 当作空格。
因此建锚和恢复在空白折叠后匹配不到时，会按去掉全部空白的文本再匹配一次，多处命中时仍按前后文选取。

### PDF

`apps/desktop/src/renderer/src/source/pdfium/app-source-bookcase-pdfium-selection-bridge.tsx`
接收 PDFium 选区事件；
`apps/desktop/src/renderer/src/source/pdfium/pdfium-geometry.ts`
负责页内文字范围与 PDF rect 的转换，
`apps/desktop/src/renderer/src/source/pdfium/pdfium-agent-plan.ts`
负责页内锚点与全局文本坐标之间的映射。

所有阅读器最终都必须提供：原文 `exact`、可恢复位置，以及能从锚点重建的正文高亮 box。

## 用户批注与评论

Web 和 EPUB 的用户划线入口分别在
`apps/desktop/src/renderer/src/source/web/app-source-bookcase-web.tsx` 与
`apps/desktop/src/renderer/src/source/ebook/app-source-bookcase-ebook.tsx`。PDF 入口在
`apps/desktop/src/renderer/src/source/pdfium/app-source-bookcase-pdfium.tsx`。

共同链路是：

1. source reader 将选区转换成 `Annotation.anchor`。
2. `packages/core/src/reader/annotations.ts` 创建或更新用户批注与评论。
3. `apps/desktop/src/renderer/src/source/bookcase/use-source-annotations.ts` 先调用持久化回调，
   成功后再基于当前 `annotationsRef` 合并结果并更新 React state，时间戳使用 main 返回的
   `updatedAt`。持久化失败时不修改 state，由调用方保留用户输入（例如 composer 保持打开）。
4. `packages/reader-ui/src/annotations/reader-annotation-card.tsx` 添加顶层想法或回复时，只通过
   `onAddComment(annotationId, content, replyTo)` 把意图交还宿主，不直接访问 Electron API。
5. 评论包含 `@助手` 时，`useSourceReaderSession()` 在保存用户评论后启动 AI 回复，确保模型失败
   不会回滚用户内容。

`useSourceAnnotations()` 只走细粒度回调，没有整篇文章写入的 fallback：

- `saveAnnotation()` → `onSaveArticleAnnotation()`。
- `saveComment()` → `onSaveArticleComment()`。
- `deleteAnnotation()` → `onDeleteArticleAnnotation()`。
- `deleteComment()` → `onDeleteArticleComment()`。

## IPC 与持久化

preload 实现在 `apps/desktop/src/preload/desktop-api-fragments.ts`，main handler 在
`apps/desktop/src/main/ipc/ipc-article.ts`。

| Channel | 持久化函数 | 粒度 |
| --- | --- | --- |
| `article:save-annotation` | `saveArticleAnnotation()` | upsert 一条批注，并同步其 comments |
| `article:save-comment` | `saveArticleComment()` | upsert 一条评论 |
| `article:delete-annotation` | `deleteArticleAnnotation()` | 删除批注 thread，并软删除相关阅读记忆 |
| `article:delete-comment` | `deleteArticleComment()` | 删除评论子树，并软删除相关阅读记忆 |
| `article:save` | `saveArticle()` | 导入、整篇替换等完整文章写入 |

细粒度 upsert 位于 `apps/desktop/src/main/articles/article-annotation-upsert.ts`，删除生命周期位于
`apps/desktop/src/main/articles/article-repository-lifecycle.ts`。完整文章写入才走
`apps/desktop/src/main/articles/article-row-writes.ts`。三种路径都返回 article patch，由 renderer
统一合并，避免替换无关 store 状态。

SQLite schema 位于 `apps/desktop/src/main/db/schema.ts`；`articles`、`annotations`、`comments`
分表存储。批注写入还会通过 `apps/desktop/src/main/articles/article-annotation-memory.ts` 同步阅读记忆。

## AI 回复与新想法

讨论串回复、追加想法和问一问都投递到助手会话的频道，入口是 `assistant:deliver`
（`apps/desktop/src/main/ipc/ipc-assistant.ts`）。main 的
`apps/desktop/src/main/assistant-sessions/assistant-channel-runtime.ts` 读取频道快照，把该 agent
尚未收到的消息追加进会话；频道读写位于 `assistant-channel-sources.ts`，投递文本格式位于
`assistant-channel-delivery.ts`。运行进度通过 `assistant:run` 事件广播给主窗口和讨论窗口，
renderer 在 `apps/desktop/src/renderer/src/shell/app-assistant-runs.ts` 中把运行中的回复显示成占位，
保存后的回复到达时撤掉占位。

### 回复现有 thread

讨论窗口 `apps/desktop/src/renderer/src/annotation-discussion/app-annotation-discussion-window.tsx`
先保存用户评论，再为每个被 @ 或按规则回复的 agent 投递到 `{ kind: 'thread' }` 频道，多个 agent
并行，互不覆盖。main 用 `upsertCommentRows()` 保存回复（`replyTo` 为该 thread），并广播 article
patch；不再有 renderer 侧的 `pending` 评论落库。

### 在划线下追加助手想法

讨论窗口选择让助手写想法时投递到 `{ kind: 'annotation' }` 频道，用户输入作为指令随投递发送，
不写成用户想法。结果是该批注下一条顶层 AI 想法（`replyTo` 为空），划线仍归属用户。

### 问一问

`apps/desktop/src/renderer/src/source/bookcase/use-reader-chat-session.ts` 先把用户消息写入文章的
reader chat state，再投递到 `{ kind: 'chat', sessionId }` 频道。main 把回答追加到同一 state，
并广播 `article-reader-chat-state` patch。两边都整列写 reader chat state，所以回答生成期间
renderer 不发送新问题，避免覆盖 main 刚写入的回答。

### 生成新的锚定批注（当前无 UI 入口）

`apps/desktop/src/renderer/src/source/bookcase/app-source-agent-request.ts` 构造
`AgentAnnotatePayload`，通过 `agent:annotate:stream` 接收模型生成的新批注，AI 实现在
`packages/ai/src/agent/agent-annotation.ts`。聚焦共读规划 UI 移除后，
`useSourceReaderSession().requestAgentAnnotations()` 没有生产调用方；执行链路和重新接入约束见
`docs/focus-co-reading-data-flow.md`。

模型输出不会直接落库。renderer 先验证锚点属于请求范围，再由
`packages/core/src/reader/agent-annotations.ts` 的 `mergeAgentAnnotationAsThought()`
合并：相同划线已有批注时追加顶层 AI 想法，否则新增批注。保存走 `article:merge-agent-annotation`，
仍回到前述 article persistence seam。

## 播放状态边界

这一节只适用于 `agent:annotate:stream`。Web、EPUB、PDF 分别通过以下 adapter 把统一 AI 流映射到
各自坐标系统：

- `apps/desktop/src/renderer/src/source/web/app-source-bookcase-web-controller.ts`
- `apps/desktop/src/renderer/src/source/ebook/app-source-bookcase-ebook-controller.ts`
- `apps/desktop/src/renderer/src/source/pdfium/app-source-bookcase-pdfium-controller.ts`

adapter 可以维护虚拟鼠标、dock、临时高亮和播放队列，但只有成功通过锚点约束并进入
`saveAnnotation()`/`saveComment()` 的数据才是持久化结果。后台文章或无法播放的锚点可跳过演出，
但不能跳过范围校验与 repository 写入。

## 接入或排查清单

1. 选区是否能稳定转换成 source-specific `TextAnchor`？
2. 锚点能否在重新打开后恢复高亮和批注定位？
3. UI 是否只发意图，由宿主的 `useSourceAnnotations()` 更新事实来源？
4. 单批注、单评论改动是否走细粒度 IPC，而非整篇 `article:save`？
5. AI 生成的新批注是否经过范围约束和 `mergeAgentAnnotationAsThought()` 后才保存？
6. 失败与取消是否只清理临时状态，不删除已经保存的用户内容？

仓库路径由 `pnpm docs:check-paths` 校验；新增或移动上述模块时，应在同一提交更新本文。
