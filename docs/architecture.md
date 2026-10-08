# 架构概览

本文记录跨模块的边界、依赖方向和已定决策，用来判断新代码该放在哪里、哪些约束不能破坏。
产品层取舍见 [产品方向](product.md)，目录职责见根目录 `AGENTS.md`，子系统细节见各专题文档。

## 运行单元

| 单元 | 职责 |
| --- | --- |
| desktop main | SQLite、文件、系统 keyring、IPC handler、LLM 调用、导入、微信读书同步、阅读记忆后台任务、更新 |
| desktop preload | 通过 `contextBridge` 暴露唯一的 `yomitomoDesktop` API，所有窗口共用 |
| desktop renderer | 界面和临时状态，不直接访问 Node、文件或密钥 |
| `apps/web` | Astro 官网、帮助文档、changelog 和更新说明 JSON |
| `apps/download` | 代理 GitHub Release 安装包、更新 manifest 和 Sparkle feed |
| `apps/telemetry` | 接收匿名 heartbeat 和阅读记忆计数，写入 Analytics Engine |

## 包依赖方向

```text
shared ← core ← ai
           ↖
            reader-ui
desktop → shared, core, ai, reader-ui
telemetry → shared
```

- 依赖只沿上图方向。`shared` 不依赖任何 workspace 包；`core` 和 `reader-ui` 不依赖 `ai`。
- `packages/*` 不引入 Electron 和 `node:` 内置模块。需要文件、进程、数据库或窗口的逻辑留在
  `apps/desktop/src/main`。
- `shared`、`core`、`ai` 不依赖 React。`reader-ui` 不依赖 desktop renderer 模块和 desktop 主题工具。
- 判断归属的顺序：协议类型和底层纯函数放 `shared`；不依赖 UI 和 IO 的业务规则放 `core`；
  模型调用和 prompt 放 `ai`；可复用的阅读器界面放 `reader-ui`；其余留在 desktop。

## 进程与窗口边界

- renderer 窗口启用 `sandbox`、`contextIsolation`，关闭 `nodeIntegration`，见
  `apps/desktop/src/main/windows/renderer-window-security.ts`。
- 窗口分三类：主窗口；批注窗口（讨论与沉淀两个路由，按文章和批注复用，见
  `apps/desktop/src/main/windows/annotation-window-lifecycle.ts`）；使用独立 session 的隐藏网页导入窗口。
- 每个 invoke channel 由一个 descriptor 声明路由、允许的窗口角色和参数校验方式，见
  `apps/desktop/src/ipc/desktop-ipc-descriptor.ts`。参数在 main 侧用 Zod 校验
  （`apps/desktop/src/ipc-schemas.ts`）；角色表按类型穷尽，新 channel 不声明角色无法编译
  （`apps/desktop/src/ipc-authorization.ts`）。
- main 处理 invoke 的顺序固定为：发送方检查、应用锁检查、参数校验、handler，见
  `apps/desktop/src/main/ipc/ipc.ts`。默认只允许主窗口；批注窗口只开放所需的少数 channel。
- 流式请求按 `${channel}:${requestId}` 回传事件，取消走 `agent:stream-cancel`，见
  `apps/desktop/src/ipc-stream-channel.ts`。
- 写入结果以 patch 广播给其他窗口，不回发给发起窗口，见
  `apps/desktop/src/main/ipc/renderer-state-event-dispatcher.ts`。IPC 声明与 patch 粒度的规则见
  `apps/desktop/AGENTS.md`。

## 数据与事实来源

- **SQLite 是唯一持久化事实来源。** schema 在 `apps/desktop/src/main/db/schema.ts`，迁移是
  `apps/desktop/src/main/db/migrations.ts` 中手写的有序 SQL。renderer state、pending 评论、
  临时高亮和播放状态都不是事实来源。
- **数据库只升不降。** 旧版本无法读取的迁移必须提升 `minReaderLevel`；数据库要求的级别高于当前
  客户端时拒绝打开，见 `apps/desktop/src/main/db/compatibility.ts`。不通过删除迁移记录或降低
  级别来降级。
- **原始数据与派生数据分开。** 文章、批注、评论、复审历史是原始数据；FTS、检索条目、投影任务、
  向量和语义状态是派生数据，可以清空重建。重建索引不触碰原始数据。
- **密钥不进数据库。** provider 和微信读书 API key 存系统 keyring，数据库只存引用，见
  `apps/desktop/src/main/providers/provider-secrets.ts`。完整备份
  （`apps/desktop/src/main/full-backup.ts`）清除这些引用，不包含 keyring、本地模型和日志。
- **文章写入与阅读记忆镜像不是原子的，这是有意的降级。** 保存文章或批注时，阅读记忆镜像在
  事务外执行，失败只记录警告，不回滚文章（`apps/desktop/src/main/articles/article-row-writes.ts`）；
  删除路径在同一事务内完成（`apps/desktop/src/main/articles/article-repository-lifecycle.ts`）。
  改成原子写入需要单独讨论失败语义。

批注、评论的持久化链路见 [批注、想法与 AI 数据流](annotation-data-flow.md)。

## 阅读器

- Web、EPUB、PDF 三种阅读器共用 `apps/desktop/src/renderer/src/source/bookcase/use-source-reader-app.ts`
  组合的 session 与 workspace。它们只共享“选区产出可恢复锚点”的契约，不共享 DOM、Foliate
  iframe 或 PDFium 几何实现。
- source 差异止于各自的 adapter，不进入共享 session、IPC 或 AI transport。Web 与 EPUB 的定位、
  分页和选区差异是真实差异，不为减少重复合并成一个总控 hook。
- EPUB/Kindle 导入解析在 worker thread 中执行，避免阻塞主进程；PDF 渲染与文本层使用 PDFium WASM。

## AI 链路

- 所有 LLM 调用都在 main 进程，经 `@yomitomo/ai` 发往用户配置的 provider。renderer 只通过 IPC
  stream 发出意图并接收结果。
- main 侧的任务执行和 provider 路由在 `apps/desktop/src/main/agents/agent-task-execution.ts` 和
  `apps/desktop/src/main/agents/agent-runtime-routing.ts`。
- 工具循环任务（thread reply、create thought、沉淀审阅等）在
  `packages/ai/src/assistant/assistant-ai-sdk-runtime.ts` 中执行，每类任务有步数和工具结果预算
  （`packages/ai/src/assistant/assistant-runtime-types.ts`）。
- 发给模型的文章正文按 `packages/ai/src/provider/budget.ts` 截断，并告知模型压缩情况；
  不改变已保存的文章。
- 模型生成的批注候选在 `packages/ai/src/agent/annotation-suggestion-acceptance.ts` 中按确定性规则
  接受或丢弃，并记录丢弃原因。
- 当前 UI 中的 AI 输出都以评论形式写入已有批注。生成新锚定批注的 `agent:annotate:stream`
  链路没有 UI 入口，见 [聚焦共读执行数据流](focus-co-reading-data-flow.md)。

## 阅读记忆

- main 侧在 `apps/desktop/src/main/reading-memory`：投影 worker 把原始资产写成检索证据，
  语义索引把向量存进 SQLite，embedding 在 fork 出的子进程中运行，空闲时释放。
  `packages/core/src/reading-memory` 放排序、合并等纯逻辑，`packages/ai/src/reading-memory` 放模型判断。
- 检索是关键词与语义混合排序；没有模型、索引不完整或没有 provider 时降级，不阻断查询。
- 保存不等待投影、向量或远程 AI。投影任务持久化，重启后继续。
- 总开关在 `apps/desktop/src/reading-memory-release.ts`，同时控制界面入口、IPC handler 和后台任务。
  模型选择、分发和发布门禁见 `docs/reading-memory-model-evaluation.md`、
  `docs/reading-memory-model-distribution.md`、`docs/reading-memory-release.md`。

## 异步与生命周期

- Effect v4 只用于 main 进程编排、`packages/ai` 和 `packages/core`，不进入 renderer、preload、
  `reader-ui` 和 `shared`。对外 API 保持 Promise，内部工作流直接组合 Effect。
  规则与升级流程见 [Effect v4 Runtime Boundary](effect-v4-runtime.md)，由 `pnpm effect:check` 校验。
- 周期任务、投影 worker、语义索引和 embedding 进程归属 main 进程 runtime
  （`apps/desktop/src/main/app/main-process-runtime.ts`），退出时中断并等待它们释放数据库。

## 界面

- 交互 primitive 使用 Base UI 及本地 wrapper，禁止 Radix，见 [UI Primitive Boundary](ui-primitives.md)，
  由 `pnpm ui:check-primitives` 校验。
- 桌面端样式归属见 [Desktop Renderer Style Ownership](desktop-style-ownership.md)。颜色来自主题变量，
  不在组件中写死核心色。

## 分发与外部服务

- 更新：macOS 打包版本使用 Sparkle，Windows 使用 electron-updater，见
  `apps/desktop/src/main/app/app-updater.ts`。安装包和更新 feed 经 `apps/download` 代理 GitHub Release。
- 遥测：`apps/desktop/src/main/telemetry/desktop-telemetry.ts` 发送 heartbeat 和阅读记忆计数，
  默认开启，可在设置中关闭。范围以 [产品方向](product.md) 的隐私边界为准。
- 发布流程见 [版本发布指南](release-guide.md)，官网部署与缓存见 [官网资源加载与缓存](web-performance.md)。

## 已定决策

- **拆分要有独立的变更原因。** 行数和复杂度指标不是拆分理由。持久化边界（SQLite row、
  credential、legacy 迁移和 normalization 的转换）集中在 `apps/desktop/src/main/store` 是有意的。
- **性能改动以测量为前提。** 观测脚本在 `apps/desktop/e2e/performance`，使用隔离数据，
  不设机器相关阈值，不进入默认测试。结论只适用于测量时的数据形态。批注卡片脚本需要先构建桌面端，
  `YOMITOMO_ANNOTATION_PROFILE=1` 或 `font` 额外采集 CPU profile：

  ```bash
  pnpm --filter @yomitomo/desktop exec vitest run --config e2e/performance/vitest.config.ts
  ```
- **批注卡片不做虚拟化。** 1,000 条批注仍全部挂载；当前优化只减少重复渲染。引入按视口挂载前
  需要测量证明，并保留卡片高度缓存、活动卡片和退出动画的挂载、跳转到未挂载批注的定位，
  分别验证 EPUB 翻页与 PDF 缩放。
- **书库目录查询保留候选集物化。** 取消物化在 50,000 条数据下更慢。大书库优化先用真实形态的
  数据测量计数、筛选和排序，不直接加索引。
- **PDF 双语翻译尚未提供。** 当前只支持 Web 和 EPUB
  （`apps/desktop/src/main/articles/article-translation-identity.ts`）。
  `apps/desktop/src/renderer/src/source/pdfium/pdfium-translation-blocks.ts` 已验证 block identity。
  实现时首版限定单栏文本型 PDF，双栏和跨页段落作为已知限制在界面说明；译文 overlay 必须在
  真实文档上验证缩放、resize 和页面虚拟化后才能发布；无文本层的扫描件给出提示，不进入翻译。
