# AGENTS.md

面向本仓库内开发代理的工作说明。默认作用域为整个 `yomitomo` workspace。


## 技术栈

- 包管理器：`pnpm@11.0.3`
- Workspace：`pnpm-workspace.yaml`
- 构建编排：Turbo
- 语言：TypeScript，ESM
- 桌面端：Electron 41、electron-vite、React 19、Vite 8、Tailwind CSS
- 浏览器扩展：WXT、React 19、Tailwind CSS、Chrome MV3
- 共享包：`@yomitomo/shared`、`@yomitomo/core`
- 测试：Vitest
- Lint：oxlint
- Format：oxfmt

## Workspace 结构

- `apps/desktop`：Electron 桌面端，包含 main、preload、renderer。
- `apps/extension`：WXT 浏览器扩展，包含 content script 和 popup。
- `packages/shared`：共享类型、ID/哈希工具、文本锚定逻辑、跨端协议类型。
- `packages/core`：跨端业务核心逻辑，包括批注、评论、@ 提及、阅读统计和阅读卡片生成。
- `dist/**`：各应用构建产物。

Workspace 包使用 `@yomitomo/*` 命名。跨包引用基础类型和底层纯函数时使用 `@yomitomo/shared`，跨端业务逻辑使用 `@yomitomo/core`。

## 常用命令

从仓库根目录运行：

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm format
```

按 workspace 运行单包命令：

```bash
pnpm --filter @yomitomo/desktop dev
pnpm --filter @yomitomo/desktop build
pnpm --filter @yomitomo/desktop test

pnpm --filter @yomitomo/extension dev
pnpm --filter @yomitomo/extension build
pnpm --filter @yomitomo/extension test

pnpm --filter @yomitomo/shared build
pnpm --filter @yomitomo/shared test

pnpm --filter @yomitomo/core build
pnpm --filter @yomitomo/core test
```

## Lint、Format、Test

- Lint：`pnpm lint`，底层为 `oxlint .`。
- Format：`pnpm format`，底层为 `oxfmt --write .`。
- Test：`pnpm test`，底层为 `turbo test`。
- Build：`pnpm build`，底层为 `turbo build`，会按依赖顺序构建 `shared`、`core` 和应用。
- 包内测试脚本统一使用 `vitest run --passWithNoTests`。
- `@yomitomo/shared` 和 `@yomitomo/core` 的 build 使用 `tsc -p tsconfig.json --noEmit` 做类型检查。

提交前优先运行：

```bash
pnpm lint
pnpm test
pnpm build
```

## 开发注意事项

- 新共享类型、ID/哈希工具、文本锚定和协议类型放在 `packages/shared/src/index.ts`。
- 桌面端和扩展端都要使用的业务逻辑放在 `packages/core/src`，按领域拆分模块，再从 `packages/core/src/index.ts` 导出。
- 扩展阅读器的文章抽取、DOM 范围、高亮绘制、组件和工具逻辑放在 `apps/extension/src/reader-*` 或明确命名的相邻模块。
- 桌面端 renderer 的设置业务和通用展示工具放在 `apps/desktop/src/renderer/src/app-*` 模块。
- 桌面端持久化路径基于 Electron `app.getPath("userData")`。
- 浏览器扩展的页面数据存入 `browser.storage.local`。
- 扩展 content script 和 popup 通过 WXT 入口组织。
- 扩展阅读器入口链路是 popup -> 当前 tab content script -> `yomitomo:toggle` listener。`Could not establish connection. Receiving end does not exist.` 表示当前 tab 没有可用接收端，优先检查目标网页的 content script 控制台初始化错误，再检查 popup 控制台。
- 修改 `apps/extension/entrypoints/content.tsx`、`apps/extension/src/content-runtime.ts`、`apps/extension/src/popup-actions.ts`、`apps/extension/wxt.config.ts` 时，必须保持 content script 接收端稳定注册。浏览器 API 方法依赖宿主对象上下文，传递 `browser.runtime.onMessage.addListener` 这类方法时使用闭包：`(listener) => browser.runtime.onMessage.addListener(listener)`。
- content script 的 ready flag 必须在 listener 注册成功后写入。注册失败时保留重试机会，popup 补注入才能重新建立接收端。
- popup 打开阅读器时要覆盖“页面早于扩展加载”的场景：首次 `tabs.sendMessage` 遇到接收端缺失后，通过 `browser.scripting.executeScript` 注入 `content-scripts/content.js`，再重发 toggle 消息；manifest 需要保留 `scripting` 权限。
- 扩展阅读器入口相关改动后至少运行 `pnpm --filter @yomitomo/extension test` 和 `pnpm --filter @yomitomo/extension build`，并手动验证：重新加载扩展、刷新目标网页、点击“进入阅读器模式”。
- 桌面端和扩展通过本地 WebSocket `127.0.0.1:43891` 通信。
- `pnpm dev` 通过 workspace 源码消费 `@yomitomo/core` 和 `@yomitomo/shared`；改动 core/shared 后，桌面端和扩展端的 Vite/WXT watch 链路会重新构建相关代码。
- UI 图标优先使用 `lucide-react`。
- 样式优先沿用现有 Tailwind、组件和 CSS 变量。
- 修改 workspace 包名或依赖后运行 `pnpm install --lockfile-only` 更新 lockfile。
