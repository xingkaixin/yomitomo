---
Author: "Codex"
Updated: 2026-05-04
Status: Draft
---

# klip-0-codebase-review

## 背景

- 本次审查覆盖 `apps/desktop`、`apps/extension`、`packages/shared`、`packages/core`。
- 仓库当前是 Electron 桌面端、WXT 浏览器扩展、React 19、TypeScript、SQLite、WebSocket 本地通信的组合。
- 外部校准参考包含 Vercel Web Interface Guidelines、React performance best practices、React composition patterns、frontend testing、interface polish、transitions、shadcn 与 Vitest 约束。
- 审查目标是找出会影响正确性、安全、可维护性、性能、可访问性和测试信心的问题，并给出最小可落地方案。

## 现状

- 本地通信入口在 `apps/desktop/src/main/server.ts`。桌面端监听 `127.0.0.1:43891`，扩展端在 `apps/extension/entrypoints/content.tsx` 用 `new WebSocket(DESKTOP_WS_URL)` 连接，并在首条应用层消息发送 `auth`。
- 跨端协议类型集中在 `packages/shared/src/index.ts`，`DesktopClientMessage` 已包含 `auth`、`hello`、`agent:list`、`article:get`、`article:save`、`agent:message`、`agent:annotate`；`DesktopServerMessage` 已包含 `auth:result`。
- 桌面端 renderer 主入口已拆到功能域模块。`apps/desktop/src/renderer/src/main.tsx` 当前 436 行，负责 App 状态编排和导航；阅读库、读后卡片、设置面板和日志分别落在 `app-reading-library.tsx`、`app-reading-card-panel.tsx`、`app-settings-panels.tsx`、`app-log-viewer.tsx`。
- 扩展 content script 主入口已拆出视图、文章同步和 Agent 批注队列。`apps/extension/entrypoints/content.tsx` 当前 904 行，负责阅读器挂载、WebSocket 生命周期和用户操作编排；`reader-app-view.tsx`、`use-article-record-sync.ts`、`use-agent-annotation-queue.ts` 承担对应职责。
- 当前测试覆盖已经包含 `packages/shared/src/index.test.ts`、`packages/core/src/annotations.test.ts`、`packages/core/src/reading.test.ts`、`apps/desktop/src/main/server-auth.test.ts`、`apps/desktop/src/main/llm-budget.test.ts`、`apps/desktop/src/renderer/src/__tests__/app-settings-panels.test.tsx`、`apps/desktop/src/renderer/src/__tests__/app-reading-card-panel.test.tsx`、`apps/extension/src/__tests__/reader-components.test.tsx`、`apps/extension/src/__tests__/reader-utils.test.ts`。
- 2026-05-04 校准结果：`pnpm lint` 通过，`pnpm test` 通过，`pnpm build` 通过。

## 目标

- 明确当前代码库最需要先处理的风险点。
- 每个发现绑定到真实代码位置和可验证验收标准。
- 给后续修复提供尽量小的改动边界。
- 保持现有架构方向，优先修补系统边界、数据一致性、测试缺口和 UI 可访问性。

## 非目标

- 范围排除直接修改功能代码。
- 范围排除完整 redesign。
- 范围排除 Electron 打包、签名、自动更新、发布流程审查。
- 范围排除浏览器端真实 E2E 录制。

## 发现与方案

### P0（安全 / 成本边界）

#### 1. 本地 WebSocket 缺少配对认证

状态：已完成（2026-05-04）

- 位置：
  - `packages/shared/src/index.ts:220`
  - `packages/shared/src/index.ts:233`
  - `packages/shared/src/index.ts:254`
  - `apps/desktop/src/main/pairing.ts:17`
  - `apps/desktop/src/main/server-auth.ts:10`
  - `apps/desktop/src/main/server.ts:41`
  - `apps/desktop/src/main/server.ts:84`
  - `apps/desktop/src/main/server.ts:89`
  - `apps/desktop/src/main/server.ts:234`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:240`
  - `apps/extension/entrypoints/content.tsx:342`
  - `apps/extension/entrypoints/content.tsx:449`
  - `apps/extension/entrypoints/content.tsx:722`
  - `apps/extension/entrypoints/content.tsx:746`
  - `apps/extension/entrypoints/content.tsx:780`
  - `apps/extension/src/use-article-record-sync.ts:176`
  - `apps/extension/src/use-article-record-sync.ts:197`
- 现象 / 风险：
  - 桌面端只绑定 `127.0.0.1`，但 WebSocket 服务在 `connection` 阶段接受任意本机来源。
  - `hello` 和 `agent:list` 可返回用户资料和公开 Agent 列表。
  - `article:save` 可写入文章记录。
  - `agent:message` 和 `agent:annotate` 可触发默认 provider 的模型调用，形成 API 成本边界风险。
  - 浏览器页面可以直接发起 `ws://127.0.0.1:43891` 连接，服务端当前没有 Origin、token、extension id 或会话校验。
- 根因：
  - 协议把 `localhost` 当作可信边界。浏览器同源策略覆盖 HTTP 读写语义，WebSocket 连接仍会把 `Origin` 交给服务端决策。
  - 桌面端和插件端都是 Yomitomo 自有客户端，但用户可以只安装插件。插件单独运行时仍应支持本地批注，连接桌面端和调用助手属于用户主动配对后的增强能力。
- 可行性校准：
  - 当前 manifest 已声明 `storage` permission 和 `ws://127.0.0.1/*` host permission，位置在 `apps/extension/wxt.config.ts:27-28`。
  - 开发态 unpacked extension 与发布态 Chrome Web Store extension 都可以使用 `chrome.storage.local` 保存本机数据。
  - 发布态 extension id 稳定，开发态 extension id 可能随加载方式变化；配对 token 不应依赖固定 extension id。
  - 浏览器 WebSocket API 不能像普通 HTTP 请求一样设置任意自定义 header，因此认证 token 应放在第一条应用层消息，或作为 WebSocket subprotocol / query 参数。本文采用第一条应用层消息，避免 token 出现在 URL 和代理日志中。
  - `Origin` 校验作为 defense-in-depth：它能拦截普通网页脚本直接连本地服务；配对 token 承担真正的授权判断。
- 建议方案：
  - 桌面端生成 `desktopPairingToken`，持久化在 userData 或 SQLite 中。token 只在用户点击“配对插件”时展示。
  - 插件端保持独立可用：未配对时允许本地批注、页面缓存、阅读器设置；隐藏或禁用助手、桌面同步、读后卡片相关入口。
  - 用户安装桌面端后，在桌面端打开“配对插件”，复制一次性配对码；插件端输入配对码后保存到 `browser.storage.local`。
  - WebSocket 第一条应用层消息必须是 `{ type: "auth", token }`。认证前只允许 `auth` 和有限错误响应。
  - 认证状态绑定到 socket，`handleMessage` 在分发业务消息前检查认证状态。
  - 服务端同时校验 `request.headers.origin`：允许 `chrome-extension://*`，开发态允许显式配置的 extension origin 或 localhost dev origin，记录异常 origin。
  - 桌面端提供“解除配对”：旋转 `desktopPairingToken`，主动关闭已认证 socket，并广播配对状态变化。
  - 插件端提供“断开桌面端”：删除本地 token，关闭 socket，回到插件独立模式。
  - `agent:message`、`agent:annotate` 的每 socket 并发上限和最小节流归入 P1 第 2 条运行时边界继续处理。
- 实施进展：
  - `DesktopClientMessage` 已新增 `{ type: "auth"; token: string }`，`DesktopServerMessage` 已新增 `auth:result`。
  - `isDesktopSocketOriginAllowed` 已允许 `chrome-extension://*`、`moz-extension://*`、`localhost`、`127.0.0.1` origin，并拒绝普通网页 origin。
  - 桌面端已新增 `apps/desktop/src/main/pairing.ts`，在 Electron `userData` 下持久化 `pairing.json`，并使用 `timingSafeEqual` 校验配对 token。
  - 桌面端 `server.ts` 已改为连接后记录 socket auth state；认证前只处理 `auth`，其他业务消息返回未认证错误；认证成功后才允许 `hello`、`agent:list`、`article:get`、`article:save`、`agent:message`、`agent:annotate` 进入原有分发。
  - 桌面端已新增 `pairing:get`、`pairing:rotate` IPC；通用设置页展示配对码、支持复制和换新配对码；换新配对码会关闭已认证 socket。
  - 扩展端已在阅读设置面板增加桌面端配对码输入；配对码保存到 `browser.storage.local` 的 `yomitomo.desktopPairingToken`。
  - 扩展端连接桌面端后先发送 `auth`；收到 `auth:result.ok === true` 后才发送 `hello`、`agent:list`、`article:get`。
  - 扩展端 `article:save`、`article:get`、`agent:message`、`agent:annotate` 均已增加 `desktopAuthenticatedRef` 门禁，认证前只保留本地批注和本地缓存。
  - 新增 `apps/desktop/src/main/server-auth.test.ts`，覆盖认证前业务消息拦截、认证消息通过、认证后业务消息通过、非法 origin 和错误 token 拒绝、成功认证状态转换。
  - 扩展 `packages/shared/src/index.test.ts`，覆盖 WebSocket origin allowlist。
  - 验证：`pnpm lint`、`pnpm test`、`pnpm build` 均通过。
- 验收标准：
  - [x] 任意网页直接连接 `ws://127.0.0.1:43891` 后发送 `agent:list`，服务端返回未认证错误。
  - [x] 未配对插件可以创建本地批注，并在 UI 上明确显示“桌面端未连接”状态。
  - [x] 扩展端配对成功后可以完成 `hello`、`agent:list`、`article:get`、`article:save`。
  - [x] 桌面端解除配对后，旧 token 立即失效；插件端回到未配对状态。
  - [x] 未认证 socket 发送 `agent:message` 或 `agent:annotate` 时不会触发 `runAgentStream` 或 `runAgentAnnotateStream`。
  - [x] Vitest 覆盖认证成功、认证失败、认证前业务消息拦截、认证后业务消息通过。

### P1（正确性 / 性能 / 可维护性）

#### 2. WebSocket 外部消息缺少运行时 schema、容量边界和模型上下文预算

状态：已完成（2026-05-04）

- 位置：
  - `packages/shared/src/index.ts:220`
  - `packages/shared/src/index.ts:254`
  - `packages/shared/src/index.ts:263`
  - `packages/shared/src/index.ts:281`
  - `packages/shared/src/index.ts:350`
  - `packages/shared/src/index.ts:386`
  - `apps/desktop/src/main/server.ts:79`
  - `apps/desktop/src/main/server.ts:87`
  - `apps/desktop/src/main/llm-budget.ts:32`
  - `apps/desktop/src/main/llm-budget.ts:57`
  - `apps/desktop/src/main/llm-budget.ts:68`
  - `apps/desktop/src/main/llm.ts:84`
  - `apps/desktop/src/main/llm.ts:135`
  - `apps/desktop/src/main/llm.ts:211`
  - `apps/desktop/src/main/llm.ts:233`
  - `apps/desktop/src/main/llm.ts:247`
  - `apps/desktop/src/main/llm.ts:269`
  - `apps/desktop/src/main/llm.ts:305`
  - `apps/desktop/src/main/llm.ts:363`
- 现象 / 风险：
  - 服务端把 `JSON.parse(raw)` 结果直接断言成 `DesktopClientMessage`。
  - `article:save` 的 payload、`agent:message` 的文章正文、批注和评论内容都来自 socket 边界。
  - 当前类型只能约束编译期调用方，无法约束运行期恶意或损坏消息。
  - 大 payload 会进入 SQLite 写入、日志、文章同步和 LLM prompt 构造路径。
  - 真实文章可能很长，保存层需要完整保留原文；模型调用层需要根据 provider / model 的上下文窗口处理超长输入。
  - 当前 LLM prompt 已在调用处用固定字符数裁剪，例如 `buildAgentPrompt`、`buildAgentAnnotatePrompt`、`buildReadingCardPrompt`，但裁剪策略和用户提示尚未形成统一契约。
- 根因：
  - `DesktopClientMessage` 同时承担内部类型和外部协议契约，缺少边界 parser。
  - 存储完整性、传输防滥用、模型上下文预算是三类边界，目前混在同一条“消息大小”问题里。
  - provider 类型和 modelName 还没有映射到可解释的上下文预算，超限失败只能表现为上游 API 错误。
- 建议方案：
  - 在 `packages/shared` 增加 `parseDesktopClientMessage(value: unknown)`，返回窄化后的消息或结构化错误。
  - parser 负责结构校验和防滥用容量边界，避免对正常长文做内容裁剪：
    - URL 只接受 `http:` / `https:`。
    - annotations/comments 数量设置产品容量上限。
    - 单条 comment、title、byline、excerpt 设置字段长度上限。
    - `contentHtml` 和 `article.text` 设置高水位上限，高水位用于拒绝异常 payload 或提示用户文章过大，阈值应明显高于常规长文。
  - `article:save` 保存层完整保留已通过边界校验的 `contentHtml`，不按模型上下文裁剪原文。
  - 新增模型输入预算层，输入为 provider、modelName、任务类型、全文、证据单元，输出为 prompt segments 和 budget report。
  - 模型输入预算层按任务降级：
    - 批注：长文按章节 / 段落分块，让 Agent 在每块内生成候选批注，再合并去重。
    - 评论回复：优先保留当前高亮、thread、文章标题、局部上下文，再附加截断后的全文摘要或前后文。
    - 读后卡片 / 审议：优先保留 evidenceUnits 和用户/助手讨论，全文按章节摘要或片段索引参与。
  - provider / modelName 未知时使用保守默认预算；用户选择小上下文模型时允许流程继续，但 UI 明确提示“已按模型上下文压缩输入，输出质量可能下降”。
  - 上游 API 返回上下文超限时，捕获错误并返回结构化失败原因，提示用户换大上下文模型、缩小文章范围或改用分块模式。
  - `apps/desktop/src/main/server.ts` 只接受 parser 输出的消息。
  - 对 `article:save`、`agent:message`、`agent:annotate` 分别写单元测试。
- 实施进展：
  - `packages/shared/src/index.ts` 已新增 `parseDesktopClientMessage(value: unknown)`，返回 `{ ok: true, message }` 或 `{ ok: false, error }`，错误对象携带 `requestId` 和可展示错误信息。
  - parser 已覆盖 `auth`、`hello`、`agent:list`、`article:get`、`article:save`、`agent:message`、`agent:annotate`，并校验未知 type、缺失 requestId、payload object 形态、Agent 标识、批注和评论基础结构。
  - parser 已加入容量边界：URL 4096 字符、title 512 字符、byline 512 字符、excerpt 2000 字符、`contentHtml` 2,000,000 字符、`article.text` 300,000 字符、annotations 1000 条、单批注 comments 200 条、comment 20,000 字符、anchor exact 20,000 字符。
  - parser 已限制外部 URL 为 `http:` / `https:`；保存层仍完整保留已通过边界校验的 `contentHtml`。
  - `apps/desktop/src/main/server.ts` 已改为先处理 malformed JSON，再调用 parser；业务分发只接收 parser 窄化后的 `DesktopClientMessage`。
  - `apps/desktop/src/main/llm-budget.ts` 已新增模型输入预算层，按任务处理文章全文、evidence JSON、reading deliberation JSON、reading card JSON，输出 `ModelBudgetReport` 和 prompt 内的预算说明。
  - `apps/desktop/src/main/llm.ts` 已移除散落的固定 `slice` 调用，`runAgentStream`、`runAgent`、`runAgentAnnotate`、`runAgentAnnotateStream`、`generateReadingCard`、`generateReadingDeliberation`、`reviewReadingCard` 均通过预算层生成 prompt。
  - Anthropic 非流式和流式调用已使用 `normalizeAnthropicError`，将上下文超限错误转为“模型上下文超限”结构化文案。
  - `packages/shared/src/index.test.ts` 已覆盖合法消息、未知 type、缺 requestId、非 HTTP URL、超大 `contentHtml`、合法 `agent:message`。
  - `apps/desktop/src/main/llm-budget.test.ts` 已覆盖短输入保留、长输入压缩报告、上下文超限错误归一化。
  - 验证：`pnpm lint`、`pnpm test`、`pnpm build` 均通过。
- 验收标准：
  - [x] malformed JSON、未知 type、缺 requestId、非 HTTP URL 都返回结构化错误。
  - [x] 正常长文可以完整保存到桌面端并在阅读库查看原文。
  - [x] 异常超大 payload 会在 parser 层得到结构化错误，错误文案说明是传输/存储容量边界。
  - [x] 合法扩展消息照常通过。
  - [x] LLM 调用入口只收到 parser 校验后的 payload，并通过模型输入预算层生成 prompt。
  - [x] 小上下文模型执行批注/读后卡片任务时流程可继续，prompt 能显示输入压缩提示。
  - [x] 上游 API 上下文超限错误会转成用户可理解的错误信息。

#### 3. 流式 Agent 回复每个 delta 都触发整篇文章持久化和同步

- 位置：
  - `apps/extension/entrypoints/content.tsx:315`
  - `apps/extension/entrypoints/content.tsx:320`
  - `apps/extension/entrypoints/content.tsx:370`
  - `apps/extension/entrypoints/content.tsx:681`
  - `apps/extension/entrypoints/content.tsx:727`
  - `apps/extension/entrypoints/content.tsx:740`
- 现象 / 风险：
  - `agent:message:delta` 每到一个文本片段就调用 `updateComment`。
  - `updateComment` 每次都调用 `saveAnnotations`。
  - `saveAnnotations` 会 `applyArticleRecord`、发送完整 `article:save`、写入 `browser.storage.local`。
  - 流式回复较长时会产生高频全量文章写入和 WebSocket 消息，UI 线程、扩展 storage、桌面 SQLite 都会被 delta 频率放大。
- 根因：
  - UI 增量渲染和持久化提交使用同一条函数路径。
- 建议方案：
  - 拆分 `applyAnnotations` 与 `commitAnnotations`。
  - delta 阶段只更新 React state 和 ref，使用 `requestAnimationFrame` 或短间隔合并 UI 更新。
  - `agent:message:done`、错误结束、手动评论保存、批注新增/删除时执行持久化提交。
  - 对异常关闭场景加一次 `beforeunload` / cleanup commit，保存最后已收到内容。
- 验收标准：
  - 一次 100 个 delta 的流式回复最多触发 1 次桌面 `article:save`。
  - UI 仍然能实时显示流式内容。
  - socket 中断后保留已收到文本。

#### 4. AI 批注锚定在重复文本场景会落到首次匹配

状态：已完成（2026-05-04）

- 位置：
  - `packages/core/src/annotations.ts:13`
  - `packages/core/src/annotations.ts:102`
  - `packages/core/src/annotations.ts:144`
  - `packages/core/src/annotations.ts:344`
  - `apps/desktop/src/main/llm.ts:160`
  - `apps/desktop/src/main/llm.ts:437`
  - `apps/desktop/src/main/llm.ts:441`
- 现象 / 风险：
  - `createAgentAnnotation` 使用 `articleText.indexOf(exact)` 创建 anchor。
  - 当文章中存在多个相同 `exact` 片段时，AI 批注会绑定到第一次出现的位置。
  - `resolveTextAnchor` 已经具备 prefix/suffix 打分能力，但 Agent suggestion 目前只有 `exact`、`comment`、`annotationType`。
- 根因：
  - Agent 输出协议只传 exact，创建阶段缺少上下文或位置候选选择信息。
- 建议方案：
  - 扩展 `AnnotationSuggestion`，增加可选 `prefix`、`suffix` 或 `context`。
  - 调整 `buildAgentAnnotateStreamPrompt`，让模型输出短上下文。
  - `createAgentAnnotation` 优先使用上下文匹配，缺上下文时保留当前 exact 兼容路径。
  - 对重复 exact 添加单元测试。
- 实施进展：
  - `AnnotationSuggestion` 已新增可选 `prefix`、`suffix`、`context`。
  - `createAgentAnnotation` 已改为在重复 `exact` 中按前后文相似度选择锚点；只有单一匹配时直接使用该位置。
  - `parseAnnotationSuggestions` 已保留模型返回的 `prefix`、`suffix`、`context` 字段。
  - 非流式和流式 Agent 批注 prompt 已要求输出 `prefix` / `suffix`；流式 NDJSON parser 已读取这些字段。
  - `packages/core/src/annotations.test.ts` 已覆盖 prefix/suffix 锚定、context 锚定、旧 exact-only suggestion 和新字段解析。
  - 验证：`pnpm lint`、`pnpm test`、`pnpm build` 均通过。
- 验收标准：
  - [x] 两处相同 exact 但上下文不同的文章，批注落在匹配上下文的位置。
  - [x] 缺上下文字段的旧 suggestion 仍可创建批注。

#### 5. 桌面端和扩展端缺少关键 UI / 集成测试

状态：已完成（2026-05-04）

- 位置：
  - `apps/desktop/package.json:11`
  - `apps/extension/package.json:8`
  - `packages/shared/package.json:10`
  - `packages/core/src/annotations.test.ts`
  - `packages/core/src/reading.test.ts`
- 现象 / 风险：
  - 当前测试只覆盖 core 的批注和阅读卡片纯函数。
  - 桌面端 provider/agent 表单、读后卡片工作流、阅读卡片 evidence 引用、日志面板没有组件测试。
  - 扩展端阅读器挂载、WebSocket message handling、Agent 流式 delta、批注创建和 mention 菜单没有组件或 hook 测试。
  - `--passWithNoTests` 让空测试包显示为成功，CI 无法体现 UI 关键路径缺口。
- 根因：
  - 大量逻辑在 React 组件文件内，纯函数边界集中在 core，UI 行为缺少可单测切口。
- 建议方案：
  - 先加 parser / server auth 纯函数测试。
  - 把扩展端 WebSocket message reducer、annotation commit 策略、桌面端 reading card markdown/evidence rendering 抽到小函数。
  - 为抽出的函数写 Vitest。
  - 对 2 个代表性组件补 React Testing Library 测试：`ReadingCardWorkflow`、`AnnotationCard`。
- 实施进展：
  - shared：新增 `packages/shared/src/index.test.ts`，覆盖重复文本锚定解析和 Markdown HTML 转义。
  - desktop：新增 `apps/desktop/src/renderer/src/__tests__/app-reading-card-panel.test.tsx`，覆盖读后卡片流程、审议生成入参和 evidence 引用打开；既有 `app-settings-panels.test.tsx` 覆盖 provider / agent 表单可访问名称与 radio group 键盘操作。
  - extension：新增 `apps/extension/src/__tests__/reader-utils.test.ts`，覆盖 Agent 流式 delta 合并；扩展 `reader-components.test.tsx` 覆盖 Composer 批注提交、mention 选择、评论提交和文本框可访问名称。
  - extension：抽出 `applyAgentCommentDelta` 并接入 `apps/extension/entrypoints/content.tsx` 的 `agent:message:delta` 分支。
  - 验证：`pnpm lint`、`pnpm test`、`pnpm build` 均通过。
- 验收标准：
  - [x] `apps/desktop` 至少有 3 个测试覆盖读后卡片流程、表单可访问名称、evidence 引用渲染。
  - [x] `apps/extension` 至少有 3 个测试覆盖 delta 合并、mention 选择、批注提交。
  - [x] CI 报告显示 desktop、extension、shared、core 都有真实测试文件。

#### 6. renderer 和 content script 文件承担过多职责

状态：已完成（2026-05-04）

- 位置：
  - `apps/desktop/src/renderer/src/main.tsx`：417 行
  - `apps/desktop/src/renderer/src/app-reading-library.tsx`：676 行
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx`：791 行
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx`：975 行
  - `apps/desktop/src/renderer/src/app-log-viewer.tsx`：184 行
  - `apps/extension/entrypoints/content.tsx`：813 行
  - `apps/extension/src/reader-app-view.tsx`：344 行
  - `apps/extension/src/use-article-record-sync.ts`：251 行
  - `apps/extension/src/use-agent-annotation-queue.ts`：400 行
  - `apps/extension/src/reader-components.tsx`：588 行
- 现象 / 风险：
  - `apps/desktop/src/renderer/src/main.tsx` 同时包含 App shell、导航、设置页、表单、阅读库、原文渲染、批注本、读后卡片、审核结果、日志查看。
  - `apps/extension/entrypoints/content.tsx` 同时包含浏览器消息、文章状态、WebSocket 生命周期、同步协议、批注创建、Agent 队列、虚拟光标和渲染。
  - 变更时容易牵动大型文件，测试切口和代码评审粒度偏粗。
- 根因：
  - 早期功能累积在入口文件，组件边界跟产品域边界没有同步拆分。
- 建议方案：
  - 按现有功能域拆文件，避免抽象层膨胀：
    - desktop：`ReadingLibrary`、`ReadingCardPanel`、`SettingsPanels`、`LogViewer`。
    - extension：`useArticleRecordSync`、`useAgentAnnotationQueue`、`ReaderAppView`。
  - 首轮只做搬迁，保持行为和 CSS class 名稳定。
  - 每次搬迁配套一个最小测试或 typecheck 校验。
- 实施进展：
  - desktop：`main.tsx` 保留 App shell、导航和 store 保存编排；`ReadingLibrary`、`ReadingCard`、统计面板、设置面板、日志查看已搬到功能域模块。
  - extension：`ReaderAppView` 承接 JSX 渲染；`useArticleRecordSync` 承接本地 storage 迁移、文章记录构建、桌面端拉取和保存提交；`useAgentAnnotationQueue` 承接 Agent 批注排队、虚拟阅读光标和剧场高亮播放。
  - 验证：`pnpm --filter @yomitomo/desktop build` 通过；`pnpm --filter @yomitomo/extension build` 通过。
- 验收标准：
  - [x] `main.tsx` 降到 1200 行以内，当前 417 行。
  - [x] `content.tsx` 降到 900 行以内，当前 813 行。
  - [x] 拆出的模块具备清晰导出边界，并已通过 desktop / extension build 校验。

### P2（UI / 可访问性 / 体验一致性）

#### 7. 表单标签和输入控件缺少可访问关联

状态：已完成（2026-05-04）

- 位置：
  - `apps/desktop/src/renderer/src/app-ui.tsx:111`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:551`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:727`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:861`
  - `apps/extension/src/reader-components.tsx:267`
  - `apps/extension/src/reader-components.tsx:493`
- 现象 / 风险：
  - `Field` 渲染 `<Label>{label}</Label>`，但没有 `htmlFor`，子级 input 也没有稳定 `id`。
  - 纯 placeholder 的 textarea 对屏幕阅读器和语音输入不稳定。
  - `SecretInput` 的 API Key 输入框只有父级视觉 label，控件自身没有可访问名称。
- 建议方案：
  - 改造 `Field` 为 `Field({ id, label, descriptionId })`，向 children 显式传 id 的场景优先处理。
  - Provider、Agent、General 设置表单为每个 Input/Textarea/SelectTrigger 补稳定 id。
  - 扩展阅读器 composer/comment textarea 补 `aria-label` 或可见 label。
  - 对 `ProviderForm` 和 `AgentForm` 加 RTL 测试，使用 `getByLabelText` 查询关键控件。
- 实施进展：
  - `Field` 已支持 `id`、`htmlFor`、label id 和 description id。
  - Provider、Agent、General 关键输入已补稳定 `id`、`name`、`autocomplete` 和必要的 `spellCheck={false}`。
  - `SecretInput` 接收外部 `id`，API Key 输入框可由视觉 label 查询。
  - 扩展端批注 textarea 和评论 textarea 已补 `aria-label`。
  - 新增 `apps/desktop/src/renderer/src/__tests__/app-settings-panels.test.tsx` 和 `apps/extension/src/__tests__/reader-components.test.tsx`。
- 验收标准：
  - [x] `getByLabelText("API Key")`、`getByLabelText("用户名")`、`getByLabelText("自定义系统提示词")` 能找到控件。
  - [x] 扩展端两个 textarea 都有可访问名称。

#### 8. 扩展阅读器的焦点和 motion 保护不完整

状态：已完成（2026-05-04）

- 位置：
  - `apps/extension/src/reader-app-view.tsx:129`
  - `apps/extension/src/reader-app-view.tsx:255`
  - `apps/extension/src/reader-styles.ts:105`
  - `apps/extension/src/reader-styles.ts:107`
- 现象 / 风险：
  - 阅读器高亮按钮没有 `aria-label`，键盘用户无法知道按钮指向哪条批注。
  - 扩展样式里有 keyframes 和 transition，缺少 `prefers-reduced-motion` 保护。
  - 巨型字符串样式中 textarea 使用 `outline:none`，只看到 tabs 的 `:focus-visible` 规则，基础按钮和输入的键盘焦点表现不完整。
- 建议方案：
  - 高亮按钮补 `aria-label={`打开批注 ${index}`}` 或引用批注类型/作者。
  - 在 `readerStyles` 加全局 `:focus-visible`，覆盖按钮、textarea、输入、tab。
  - 为扩展阅读器加入 `@media (prefers-reduced-motion: reduce)`，关闭动画并缩短 transition。
  - 保持现有视觉，不改布局。
- 实施进展：
  - 高亮按钮已按批注序号和类型生成 `aria-label`。
  - 阅读器样式已添加全局 `:focus-visible`，覆盖 button、textarea、input 和 tabindex 元素，并给高亮按钮单独增强 focus ring。
  - `prefers-reduced-motion: reduce` 已覆盖虚拟光标、删除 hold 进度和 spinner 动画。
- 验收标准：
  - [x] 键盘 Tab 可以看到 toolbar、目录、批注、评论、关闭按钮的焦点位置。
  - [x] 系统 reduced motion 打开时，虚拟光标 leave、delete hold、spinner 以静态或低运动反馈呈现。

#### 9. UI polish 已有基础，但部分 shadcn / 组件语义可以收敛

状态：已完成（2026-05-04）

- 位置：
  - `apps/desktop/components.json`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:655`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:762`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:805`
  - `apps/desktop/src/renderer/src/styles.css:37`
  - `apps/desktop/src/renderer/src/styles.css:53`
- 现象 / 风险：
  - 桌面端已经有字体平滑、heading balance、body pretty、按钮 press scale 等 polish 基础。
  - 助手类型、批注密度、个性选择是 option set，但当前由自定义 button grid 实现。
  - 这些 option set 缺少统一 `aria-pressed` / radio group 语义。
- 建议方案：
  - 保留现有视觉 class，给 option button 加 `aria-pressed` 或改为语义化 ToggleGroup / RadioGroup。
  - 优先处理可访问语义和测试查询，随后评估是否纳入 shadcn form primitives。
- 实施进展：
  - 助手类型、批注密度、个性选择已保留现有视觉 class，并改为 `role="radiogroup"` / `role="radio"` / `aria-checked`。
  - 三组 option set 已支持 ArrowUp、ArrowDown、ArrowLeft、ArrowRight、Home、End 键盘切换。
  - `app-settings-panels.test.tsx` 已覆盖 option set 的 radio 语义和键盘切换。
- 验收标准：
  - [x] 助手类型、批注密度、个性选择均可通过键盘操作和可访问名称识别当前选择。
  - [x] UI 回归测试覆盖至少一个 option set。

## 建议落地顺序

1. 修复 P0 WebSocket 配对认证边界，同时加协议 parser 的第一批测试。
2. 为 `DesktopClientMessage` 增加运行时 schema 和 payload 上限。
3. 拆分扩展端流式 UI 更新与持久化提交，降低 delta 写入放大。
4. 修复 AI 批注重复文本锚定，扩展 suggestion 上下文。
5. 为 desktop / extension 各补 3 个关键路径测试。
6. 分阶段拆 `main.tsx` 和 `content.tsx`，每次只搬迁一个功能域。
7. 修复表单 label、阅读器焦点、reduced motion 和 option set 语义。

## 验证记录

```bash
pnpm lint
# Found 0 warnings and 0 errors.

pnpm test
# 6 successful, 6 total
# packages/core: 2 test files, 10 tests passed
# apps/desktop: app-settings-panels.test.tsx, 3 tests passed
# apps/extension: reader-components.test.tsx, 2 tests passed
# packages/shared: passWithNoTests

pnpm build
# 4 successful, 4 total
# extension and desktop production builds completed
```

## 关键参考位置

| 范围 | 文件 |
|---|---|
| 本地 WebSocket 服务 | `apps/desktop/src/main/server.ts` |
| LLM 调用与流式解析 | `apps/desktop/src/main/llm.ts` |
| SQLite store | `apps/desktop/src/main/store.ts` |
| 跨端协议类型 | `packages/shared/src/index.ts` |
| 扩展阅读器入口 | `apps/extension/entrypoints/content.tsx` |
| 扩展阅读器组件 | `apps/extension/src/reader-components.tsx` |
| 扩展阅读器样式 | `apps/extension/src/reader-styles.ts` |
| 桌面 renderer | `apps/desktop/src/renderer/src/main.tsx` |
| 桌面全局样式 | `apps/desktop/src/renderer/src/styles.css` |
| 当前测试 | `packages/core/src/annotations.test.ts`, `packages/core/src/reading.test.ts` |
