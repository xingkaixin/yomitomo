# AGENTS.md

面向本仓库内开发代理的工作说明。默认作用域为整个 `yomitomo` workspace。


## 技术栈

- 包管理器：`pnpm@11`
- Workspace：`pnpm-workspace.yaml`
- 构建编排：Turbo
- 语言：TypeScript，ESM
- 桌面端：Electron 41、electron-vite、React 19、Vite 8、Tailwind CSS
- 官网：Astro 6、React 19、Vite 7、Tailwind CSS
- 下载服务：Cloudflare Workers、Wrangler
- Workspace 包：`@yomitomo/desktop`、`@yomitomo/web`、`@yomitomo/shared`、`@yomitomo/core`、`@yomitomo/ai`、`@yomitomo/reader-ui`
- 测试：Vitest
- Lint：Turbo 调度各 workspace package 的 oxlint
- Format：Turbo 调度各 workspace package 的 oxfmt

## Workspace 结构

- `apps/desktop`：Electron 桌面端，包含 main、preload、renderer。
- `apps/web`：Astro 产品官网，包含 landing page、下载入口、SEO 和产品静态图。
- `apps/download`：Cloudflare Worker 下载服务，处理安装包下载入口和跳转。
- `packages/shared`：共享类型、ID/哈希工具、文本锚定逻辑、PDF 和微信读书协议类型。
- `packages/core`：业务核心逻辑，包括批注、评论、阅读统计、EPUB/PDF 索引和阅读器 DOM 纯逻辑。
- `packages/ai`：LLM provider 调用、AI SDK 运行时、模型输入预算、AI 批注和 EPUB/PDF 阅读上下文。
- `packages/reader-ui`：桌面阅读器 React UI、样式、工具和助手批注队列。
- `dist/**`：各应用构建产物。

Workspace 包使用 `@yomitomo/*` 命名。跨包引用基础类型和底层纯函数时使用 `@yomitomo/shared`，业务逻辑使用 `@yomitomo/core`，AI provider 和生成链路使用 `@yomitomo/ai`，阅读器界面复用使用 `@yomitomo/reader-ui`。

## 常用命令

从仓库根目录运行：

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm ui:check-primitives
pnpm make
```

按 workspace 运行单包命令：

```bash
pnpm --filter @yomitomo/desktop dev
pnpm --filter @yomitomo/desktop build
pnpm --filter @yomitomo/desktop test

pnpm --filter @yomitomo/web dev
pnpm --filter @yomitomo/web build
pnpm --filter @yomitomo/web test

pnpm --filter @yomitomo/download dev:worker
pnpm --filter @yomitomo/download deploy:cf
pnpm --filter @yomitomo/download test

pnpm --filter @yomitomo/shared build
pnpm --filter @yomitomo/shared test

pnpm --filter @yomitomo/core build
pnpm --filter @yomitomo/core test

pnpm --filter @yomitomo/ai build
pnpm --filter @yomitomo/ai test

pnpm --filter @yomitomo/reader-ui build
pnpm --filter @yomitomo/reader-ui test
```

## Lint、Format、Test

- Lint：`pnpm lint`，底层为 `turbo run lint` 调度各包的 `oxlint .`。
- Lint Fix：`pnpm lint:fix`，底层为 `turbo run lint:fix` 调度各包的 `oxlint . --fix`。
- Format：`pnpm format`，底层为 `turbo run format` 调度各包的 `oxfmt --write "**/*.{ts,tsx,js,jsx,json,css,html}"`。
- Format Check：`pnpm format:check`，底层为 `turbo run format:check` 调度各包的 `oxfmt --check "**/*.{ts,tsx,js,jsx,json,css,html}"`。
- UI Primitive Check：`pnpm ui:check-primitives`，检查 Radix UI import、依赖和 lockfile 引用是否已退役。
- Typecheck：`pnpm typecheck`，底层为 `turbo run typecheck`。
- Test：`pnpm test`，底层为 `turbo test`。
- Build：`pnpm build`，底层为 `turbo build`，会按依赖顺序构建 `shared`、`core`、`ai`、`reader-ui`、桌面端和官网。
- 包内测试脚本统一使用 `vitest run --passWithNoTests`。
- `@yomitomo/shared`、`@yomitomo/core`、`@yomitomo/ai` 和 `@yomitomo/reader-ui` 的 build 使用 `tsc -p tsconfig.json --noEmit` 做类型检查。
- `@yomitomo/web` 的 build 使用 `astro check && astro build`。

提交前优先运行：

```bash
mise run check
```

`mise run check` 与 CI 门禁顺序一致：`pnpm lint`、`pnpm ui:check-primitives`、
`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm build`。需要更快的本地循环时，
可以先运行 `mise run check:fast`，它只覆盖 lint、format check、typecheck 和 test。

如果本机未安装 mise，可直接运行等价命令：

```bash
pnpm lint
pnpm ui:check-primitives
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

推送 PR 分支前必须至少运行 `pnpm format:check`。如果本次改动会触发完整 CI，
优先在推送前运行 `mise run check` 或上述等价命令，避免把可本地发现的问题推到 CI。

提交代码时不要把 `.issues/` 下的内容加入 Git。`.issues/` 是本地 issue
跟踪数据，即使任务要求创建或更新 issue，也只应保留为本地文件；不要使用
`git add -f .issues/...`，提交前必须确认 staged files 不包含 `.issues/` 路径。

## 开发注意事项

- 新共享类型、provider preset、agent preset、ID/哈希工具、文本锚定、PDF 和微信读书协议类型放在 `packages/shared/src`，再从 `packages/shared/src/index.ts` 导出。
- 业务逻辑放在 `packages/core/src`，按领域拆分模块，再从 `packages/core/src/index.ts` 导出。
- AI provider 调用、AI SDK 运行时、模型输入预算、AI 生成链路和阅读上下文打包放在 `packages/ai/src`，再从 `packages/ai/src/index.ts` 导出。
- 桌面端复用的阅读器 UI、样式、工具和 hooks 放在 `packages/reader-ui/src`。
- 桌面端 renderer 的设置业务放在 `apps/desktop/src/renderer/src/settings`，通用应用外壳和展示工具放在 `apps/desktop/src/renderer/src/shell` 等模块。
- 桌面端持久化路径基于 Electron `app.getPath("userData")`。
- 桌面端文章导入逻辑放在 `apps/desktop/src/main/articles/article-import.ts`。
- 桌面端 PDF 导入逻辑放在 `apps/desktop/src/main/pdf/pdf-import.ts`，PDF 阅读器相关 UI 和 PDFium 工具留在桌面端/reader-ui 边界内，不要把 Electron 专用逻辑放进共享包。
- 桌面端微信读书同步逻辑放在 `apps/desktop/src/main/weread`，共享包只承载微信读书协议类型。
- 桌面端 provider API key 通过系统 keyring 保存，SQLite 只保留 provider 配置和 key 引用。
- 桌面端 invoke 型 IPC 必须先在 `apps/desktop/src/ipc-contract.ts` 的 `DesktopIpcInvokeMap` 中声明 channel、args 和 result，再在 main/preload 中使用；不要在 `ipcMain.handle` 或 `ipcRenderer.invoke` 两端重复手写裸字符串和返回类型断言。
- 桌面端 main 侧注册 invoke handler 时使用 `handleDesktopIpc(...)`，preload 侧调用 invoke 时使用 `invokeDesktopIpc(...)`，确保 channel、payload 和 result 来自同一份 contract。
- `apps/desktop/src/ipc-contract.ts` 是桌面端内部边界协议；不要把 Electron IPC contract 放进 `packages/shared`。`packages/shared` 只承载跨包业务类型，desktop contract 可以通过 type import 复用这些类型。
- 事件型 IPC（`ipcMain.on`、`ipcRenderer.send`、`webContents.send`）暂不混入 `DesktopIpcInvokeMap`；如需收敛事件协议，单独建立 event map，避免和 request/response 型 invoke contract 混用。
- 桌面端高频文章写入路径优先返回局部 article patch；不要为了更新单篇文章、批注、评论或阅读进度而返回或广播完整 `DesktopStore`。
- `store:get`、数据库恢复、设置保存等全量快照或全量替换场景可以使用完整 `DesktopStore`；阅读中的文章保存、导入、删除和阅读进度更新应走局部 patch。
- renderer 应通过统一的 article patch apply 入口更新 `store.articles` 中受影响的 article，避免无关 store 数据替换打断设置草稿、阅读状态或其他 UI 状态。
- `store:updated` 事件只用于完整 store 替换场景；文章级更新不要通过 `store:updated` 广播完整 store。如需跨窗口同步文章更新，应单独设计 article patch event。
- 官网页面、产品图、SEO、下载链接放在 `apps/web/src` 和 `apps/web/public`。下载链接从 `apps/desktop/package.json` 的版本号生成。
- `pnpm dev` 通过 workspace 源码消费 `@yomitomo/shared`、`@yomitomo/core`、`@yomitomo/ai` 和 `@yomitomo/reader-ui`；改动这些包后，桌面端 Vite watch 链路会重新构建相关代码。
- UI 图标优先使用 `lucide-react`。
- 样式优先沿用现有 Tailwind、组件和 CSS 变量。
- 桌面端新增 UI 必须接入主题变量：核心 surface、文字、边框、阴影、遮罩、强调色和阅读器相关颜色应来自 `AppTheme` 输出的 CSS variables，优先复用现有语义 token；确需新增视觉语义时，先扩展主题契约和默认主题，不要在组件或 CSS 中 ad-hoc 写固定核心色，避免主题切换时出现割裂。
- 桌面端应用内反馈音效必须通过 `apps/desktop/src/renderer/src/sound/app-sound-effects.ts` 统一注册和播放；不要在组件里直接 `new Audio(...)`。新增音效应注册 effect id、音频资源和基准响度，并传入当前 `AppSettings`，统一遵守设置/通用中的音效开关和响度。音效只在业务动作成功后播放，取消或失败不播放。
- 修改 workspace 包名或依赖后运行 `pnpm install --lockfile-only` 更新 lockfile。
