# 聚焦共读执行数据流

本文描述当前代码中“带阅读计划创建 AI 批注”的执行 seam。它不再描述已删除的聚焦共读
规划 UI：当前生产 reader 没有调用 `requestAgentAnnotations(agent, { readingPlan })` 的入口，
也没有独立 `focus-co-reading:route` channel。若重新引入规划 UI，应在 renderer 生成
`AgentReadingPlanItem[]`，复用下述执行链路，而不是恢复旧的并行实现。

## 当前边界

两组类型承担不同职责：

- `packages/shared/src/agents/agent-payload-types.ts` 的 `AgentReadingPlanItem` 是一次 AI 执行请求的
  section 范围、阅读动作、密度和留言。
- `packages/shared/src/sources/article-types.ts` 的 `FocusCoReadingPlan` 是文章上可持久化的历史计划，
  当前运行时只读取其中的 `readingMemory`；它不是活动 UI state。

现有执行路径是：

```text
调用方提供 AgentReadingPlanItem[]
  → useSourceReaderSession.requestAgentAnnotations()
  → prepareSourceAgentAnnotationRequestInput()
  → preload agent:annotate:stream
  → main registerAgentIpc()
  → @yomitomo/ai runAgentAnnotateStream()
  → source-specific playback adapter
  → mergeAgentAnnotationAsThought()
  → article persistence
```

## Renderer orchestration

统一入口位于 `apps/desktop/src/renderer/src/source/bookcase/use-source-reader-session.ts`。
`requestAgentAnnotations()` 不关心 DOM、Foliate 或 PDF 几何，只协调以下步骤：

1. source adapter 提供文章正文、当前 article id、可见性和阅读记忆。
2. `apps/desktop/src/renderer/src/source/bookcase/app-source-agent-request.ts` 的
   `buildAgentAnnotationRequestInput()` 将 `readingPlan` 放入 `AgentAnnotatePayload`。
3. `prepareSourceAgentAnnotationRequestInput()` 调用
   `apps/desktop/src/renderer/src/source/bookcase/app-source-bookcase-shared.ts` 的
   `routeFocusReadingPlanMessages()`，只处理 section 留言中的 `@助手` 路由。
4. `runSourceAgentAnnotationRequest()` 消费流式 `item`，把每条结果交给 source adapter。
5. adapter 完成范围约束、坐标转换、播放与保存，session 在 finally 中清理 pending 状态。

`routeFocusReadingPlanMessages()` 复用 `agent:mention-route`，不是一个计划生成器。没有留言或 preload
不可用时，它原样返回 reading plan。

## IPC 与 AI 执行

stream transport 在 `apps/desktop/src/preload/desktop-api-fragments.ts` 创建 request id，并通过
`agent:annotate:stream` 发送请求。事件协议由
`apps/desktop/src/main/ipc/ipc-agent-stream.ts` 统一发送 `item`、`done` 和 `error`。

`apps/desktop/src/main/ipc/ipc-agent.ts` 的 handler：

1. 根据 agent 与设置选择 provider。
2. 用 `apps/desktop/src/main/agents/agent-reading-memory.ts` 补齐持久化阅读记忆。
3. 调用 `packages/ai/src/agent/agent-annotation.ts` 的 `runAgentAnnotateStream()`。
4. 将解析出的 `Annotation` 逐条发送给 renderer，并在完成时返回更新后的 reading memory。

当 payload 含 EPUB index 和 section plan 时，AI 层可通过
`packages/ai/src/context/segment-annotation-context.ts` 构建 segment tasks，再由
`packages/ai/src/context/segment-annotation-runner.ts` 执行带记忆的逐段生成。普通 Web/PDF 计划则走
`packages/ai/src/agent/agent-annotation.ts` 的 reading-plan prompt 分支。

## Web、EPUB 与 PDF adapter

### Web

`apps/desktop/src/renderer/src/source/web/app-source-bookcase-web-controller.ts` 用全文字符范围约束
模型锚点。可见文章进入 Web 播放队列和虚拟阅读；article-scoped 后台写入跳过演出，直接合并保存。

### EPUB

`apps/desktop/src/renderer/src/source/ebook/app-source-bookcase-ebook-controller.ts` 使用全书文本约束
section，并把结果送入 Foliate 播放队列。具体可见性、跳页和 fallback 位于
`apps/desktop/src/renderer/src/source/ebook/app-source-ebook-agent-playback.ts`。

### PDF

`apps/desktop/src/renderer/src/source/pdfium/app-source-bookcase-pdfium-controller.ts` 要求完整 PDF
文本索引，将全局计划范围映射回页内 anchor。转换规则位于
`apps/desktop/src/renderer/src/source/pdfium/app-source-bookcase-pdfium-utils.ts`；无法映射到有效页面
几何的结果不会保存。

三种 adapter 最终都必须保证：模型锚点属于某个计划 section、阅读动作与 section 一致，并且
source-specific anchor 可恢复。source 差异止于 adapter，不进入共享 session 或 AI transport。

## 合并、保存与阅读记忆

`packages/reader-ui/src/agent/reader-agent-annotation-playback.ts` 的
`mergeAgentAnnotationAsThought()` 是最终合并规则：同一 exact key 已存在时，把 AI comment 追加为
顶层想法；否则新增批注。Web、EPUB、PDF 的保存边界与普通 AI 批注一致，详见
`docs/annotation-data-flow.md`。

非 target 且带 reading plan 的请求会设置 `shouldSaveReadingMemory`。完成结果由 source adapter
写回文章；后续请求可从 `ArticleRecord.focusCoReadingPlan.readingMemory` 继续读取。target 选区请求
不会把单次局部上下文当作整轮聚焦共读记忆。

## 重新接入规划 UI 的约束

1. UI 只负责编辑计划，执行统一调用 `requestAgentAnnotations(agent, { readingPlan })`。
2. section 的 `start/end` 必须基于传给 AI 的同一份全文，不能使用 DOM 或页内局部偏移。
3. 留言路由复用 `routeFocusReadingPlanMessages()`，不要新增第二套 mention channel。
4. Web、EPUB、PDF 只在 adapter 内做坐标转换，不复制 session、IPC 或 prompt orchestration。
5. 计划和 reading memory 需要持久化时走 article patch；播放进度、dock 和 cursor 只保存在内存。
6. 接通生产入口时，应增加至少一个覆盖“UI 计划 → stream → source adapter”的集成测试。

仓库路径由 `pnpm docs:check-paths` 校验；新增或移动上述模块时，应在同一提交更新本文。
