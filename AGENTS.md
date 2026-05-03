# AGENTS.md

面向本仓库内开发代理的工作说明。默认作用域为整个 `yomitomo` workspace。


## 技术栈

- 包管理器：`pnpm@11.0.3`
- Workspace：`pnpm-workspace.yaml`
- 构建编排：Turbo
- 语言：TypeScript，ESM
- 桌面端：Electron 39、electron-vite、React 19、Vite 8、Tailwind CSS
- 浏览器扩展：WXT、React 19、Tailwind CSS、Chrome MV3
- 共享包：`@yomitomo/shared`
- 测试：Vitest
- Lint：oxlint
- Format：oxfmt

## Workspace 结构

- `apps/desktop`：Electron 桌面端，包含 main、preload、renderer。
- `apps/extension`：WXT 浏览器扩展，包含 content script 和 popup。
- `packages/shared`：共享类型、工具函数、文本锚定逻辑。
- `dist/**`：各应用构建产物。

Workspace 包使用 `@yomitomo/*` 命名。跨包引用共享代码时使用 `@yomitomo/shared`。

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
```

## Lint、Format、Test

- Lint：`pnpm lint`，底层为 `oxlint .`。
- Format：`pnpm format`，底层为 `oxfmt --write .`。
- Test：`pnpm test`，底层为 `turbo test`。
- Build：`pnpm build`，底层为 `turbo build`，会按依赖顺序构建共享包和应用。
- 包内测试脚本统一使用 `vitest run --passWithNoTests`。
- `@yomitomo/shared` 的 build 使用 `tsc -p tsconfig.json --noEmit` 做类型检查。

提交前优先运行：

```bash
pnpm lint
pnpm test
pnpm build
```

## 开发注意事项

- 新共享类型和纯函数放在 `packages/shared/src/index.ts`。
- 桌面端持久化路径基于 Electron `app.getPath("userData")`。
- 浏览器扩展的页面数据存入 `browser.storage.local`。
- 扩展 content script 和 popup 通过 WXT 入口组织。
- 桌面端和扩展通过本地 WebSocket `127.0.0.1:43891` 通信。
- UI 图标优先使用 `lucide-react`。
- 样式优先沿用现有 Tailwind、组件和 CSS 变量。
- 修改 workspace 包名或依赖后运行 `pnpm install --lockfile-only` 更新 lockfile。
