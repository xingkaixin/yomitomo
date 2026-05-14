# AGENTS.md

面向本仓库内开发代理的工作说明。默认作用域为整个 `yomitomo` workspace。


## 技术栈

- 包管理器：`pnpm@11.0.8`
- Workspace：`pnpm-workspace.yaml`
- 构建编排：Turbo
- 语言：TypeScript，ESM
- 桌面端：Electron 41、electron-vite、React 19、Vite 8、Tailwind CSS
- Workspace 包：`@yomitomo/shared`、`@yomitomo/core`、`@yomitomo/ai`、`@yomitomo/reader-ui`
- 测试：Vitest
- Lint：Turbo 调度各 workspace package 的 oxlint
- Format：Turbo 调度各 workspace package 的 oxfmt

## Workspace 结构

- `apps/desktop`：Electron 桌面端，包含 main、preload、renderer。
- `packages/shared`：共享类型、ID/哈希工具、文本锚定逻辑和基础协议类型。
- `packages/core`：业务核心逻辑，包括批注、评论、阅读统计、阅读卡片和阅读器 DOM 纯逻辑。
- `packages/ai`：LLM provider 调用、模型输入预算、AI 批注、阅读审议、读后卡片和审核生成。
- `packages/reader-ui`：桌面阅读器 React UI、样式、工具和助手批注队列。
- `dist/**`：各应用构建产物。

Workspace 包使用 `@yomitomo/*` 命名。跨包引用基础类型和底层纯函数时使用 `@yomitomo/shared`，业务逻辑使用 `@yomitomo/core`，AI provider 和生成链路使用 `@yomitomo/ai`，阅读器界面复用使用 `@yomitomo/reader-ui`。

## 常用命令

从仓库根目录运行：

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```

按 workspace 运行单包命令：

```bash
pnpm --filter @yomitomo/desktop dev
pnpm --filter @yomitomo/desktop build
pnpm --filter @yomitomo/desktop test

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
- Test：`pnpm test`，底层为 `turbo test`。
- Build：`pnpm build`，底层为 `turbo build`，会按依赖顺序构建 `shared`、`core`、`ai`、`reader-ui` 和应用。
- 包内测试脚本统一使用 `vitest run --passWithNoTests`。
- `@yomitomo/shared`、`@yomitomo/core`、`@yomitomo/ai` 和 `@yomitomo/reader-ui` 的 build 使用 `tsc -p tsconfig.json --noEmit` 做类型检查。

提交前优先运行：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

## 开发注意事项

- 新共享类型、provider preset、agent preset、ID/哈希工具、文本锚定和协议类型放在 `packages/shared/src`，再从 `packages/shared/src/index.ts` 导出。
- 业务逻辑放在 `packages/core/src`，按领域拆分模块，再从 `packages/core/src/index.ts` 导出。
- AI provider 调用、模型输入预算和 AI 生成链路放在 `packages/ai/src`，再从 `packages/ai/src/index.ts` 导出。
- 桌面端复用的阅读器 UI、样式、工具和 hooks 放在 `packages/reader-ui/src`。
- 桌面端 renderer 的设置业务和通用展示工具放在 `apps/desktop/src/renderer/src/app-*` 模块。
- 桌面端持久化路径基于 Electron `app.getPath("userData")`。
- 桌面端文章导入逻辑放在 `apps/desktop/src/main/article-import.ts`。
- `pnpm dev` 通过 workspace 源码消费 `@yomitomo/shared`、`@yomitomo/core`、`@yomitomo/ai` 和 `@yomitomo/reader-ui`；改动这些包后，桌面端 Vite watch 链路会重新构建相关代码。
- UI 图标优先使用 `lucide-react`。
- 样式优先沿用现有 Tailwind、组件和 CSS 变量。
- 修改 workspace 包名或依赖后运行 `pnpm install --lockfile-only` 更新 lockfile。
