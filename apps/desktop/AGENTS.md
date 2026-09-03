# Desktop AGENTS.md

本文件作用于 `apps/desktop`。同时遵循仓库根目录的 `AGENTS.md`。

## 模块边界

- renderer 的设置业务放在 `apps/desktop/src/renderer/src/settings`，通用应用外壳和展示工具放在 `apps/desktop/src/renderer/src/shell` 等模块。
- 文章导入逻辑放在 `apps/desktop/src/main/articles/article-import.ts`。
- PDF 导入逻辑放在 `apps/desktop/src/main/pdf/pdf-import.ts`。PDF 阅读器 UI 和 PDFium 工具留在 desktop 或 `packages/reader-ui` 边界内，不要把 Electron 专用逻辑放进共享包。
- 微信读书同步逻辑放在 `apps/desktop/src/main/weread`，共享包只承载微信读书协议类型。
- 桌面端复用的阅读器 UI、样式、工具和 hooks 放在 `packages/reader-ui/src`。

## 数据与凭据

- 持久化路径基于 Electron `app.getPath("userData")`。
- 新写入的 provider API key 保存在系统 keyring，SQLite 只保存 key 引用。SQLite 中的旧明文列仅用于存量数据迁移兼容；不要为新流程写入明文密钥。

## IPC 与状态更新

- 新增 invoke channel 时，在 `apps/desktop/src/ipc/desktop-ipc-contract-fragments.ts` 或现有领域 descriptor 文件中声明 `desktopIpcInvoke(...)`。`DesktopIpcInvokeMap` 和路由由 `apps/desktop/src/ipc/desktop-ipc-invoke-contract.ts` 派生，再从 `apps/desktop/src/ipc-contract.ts` 导出。
- main 侧通过 `handleDesktopIpc(...)` 注册 invoke handler，preload 侧通过 `invokeDesktopIpc(...)` 调用。不要在两端重复声明裸 channel、参数或返回类型。
- Invoke contract 与 event map 分开维护。事件 channel 在 `apps/desktop/src/ipc-contract.ts` 的事件 map 中声明，不要混入 `DesktopIpcInvokeMap`。
- 高频文章写入返回局部 `ArticleStorePatch`。跨窗口文章同步使用 `article:patched`；`store:updated` 只用于完整 store 替换。
- `store:get`、数据库恢复和 `settings:save` 等全量快照或全量替换场景可以使用完整 `DesktopStore`。`provider:save/delete`、`agent:save/delete`、`user:save` 返回对应设置切片 patch；文章保存、导入、删除和阅读进度更新走局部 patch。
- renderer 通过统一的 article store commit/apply 入口更新受影响文章，避免替换无关 store 数据。

## UI

- UI 图标优先使用 `@hugeicons/react` 与 `@hugeicons/core-free-icons`，按需导入 icon data，不使用 wildcard import；品牌标志和产品自定义 SVG 保持独立。
- 样式优先沿用现有 Tailwind、组件和 CSS 变量。
- 新增 UI 必须接入主题变量。核心 surface、文字、边框、阴影、遮罩、强调色和阅读器相关颜色来自 `AppTheme` 输出的 CSS variables。优先复用现有语义 token；确需新增语义时，先扩展主题契约和默认主题，不在组件或 CSS 中写死核心色。
- 应用内反馈音效通过 `apps/desktop/src/renderer/src/sound/app-sound-effects.ts` 统一注册和播放，不在组件里直接 `new Audio(...)`。新增音效需注册 effect id、音频资源和基准响度，并传入当前 `AppSettings`。只在业务动作成功后播放，取消或失败不播放。
