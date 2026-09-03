# AGENTS.md

面向本仓库内开发代理的工作说明。默认作用域为整个 `yomitomo` workspace。

## 技术与事实来源

- 包管理器使用 `pnpm@11`，workspace 由 `pnpm-workspace.yaml` 定义，构建由 Turbo 编排。
- 依赖版本和 package scripts 以根目录及各 workspace 的 `package.json` 为准，工具链版本以 `mise.toml` 为准。
- 项目使用 TypeScript 和 ESM。除 `@yomitomo/web` 外统一使用 TypeScript 7；`apps/web` 保持 TypeScript 6，供 Astro 与 `@astrojs/check` 使用。不要在没有明确迁移任务时统一这两个版本。
- 桌面端使用 Electron、electron-vite、React、Vite 和 Tailwind CSS；官网使用 Astro、React、Vite 和 Tailwind CSS；下载与匿名遥测服务使用 Cloudflare Workers 和 Wrangler。
- 测试使用 Vitest，lint 使用 oxlint，format 使用 oxfmt。

## Workspace 结构

- `apps/desktop`：Electron 桌面端，包含 main、preload、renderer。修改该目录前同时遵循 `apps/desktop/AGENTS.md`。
- `apps/web`：Astro 产品官网，包含 landing page、下载入口、SEO 和产品静态图。
- `apps/download`：Cloudflare Worker 下载服务，处理安装包下载入口和跳转。
- `apps/telemetry`：Cloudflare Worker 匿名遥测服务，接收桌面端 daily heartbeat 并写入 Analytics Engine。
- `packages/shared`：共享类型、ID/哈希工具、文本锚定逻辑、PDF 和微信读书协议类型。
- `packages/core`：业务核心逻辑，包括批注、评论、阅读统计、EPUB/PDF 索引和阅读器 DOM 纯逻辑。
- `packages/ai`：LLM provider 调用、AI SDK 运行时、模型输入预算、AI 批注和 EPUB/PDF 阅读上下文。
- `packages/reader-ui`：桌面阅读器 React UI、样式、工具和助手批注队列。
- `dist/**`：各应用构建产物。

Workspace 包使用 `@yomitomo/*` 命名。跨包引用基础类型和底层纯函数时使用 `@yomitomo/shared`，业务逻辑使用 `@yomitomo/core`，AI provider 和生成链路使用 `@yomitomo/ai`，阅读器界面复用使用 `@yomitomo/reader-ui`。库 package 从自己的 `src/index.ts` 或 `package.json#exports` 暴露公共 API。

## 命令与门禁

- 从根目录运行 workspace 级任务；需要缩小范围时使用 `pnpm --filter <package> <script>`。
- 根目录和各 package 的可用命令以对应 `package.json` 为准。
- 本地快速循环使用 `mise run check:fast`；提交前优先运行 `mise run check`。

`mise run check` 是 canonical 门禁，CI 调用同一顺序。`pnpm gate:check` 会校验下面的命令块与 `mise.toml`、CI 是否一致。

如果本机未安装 mise，可直接运行等价命令：

<!-- gate:check -->
```bash
pnpm lint
pnpm gate:check
pnpm effect:check
pnpm docs:check-paths
pnpm ui:check-primitives
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:app:e2e:from-dist
```

无图形环境的 Linux 通过 `xvfb-run -a mise run check` 运行完整门禁；macOS 和已有图形会话的 Linux 可直接运行 `mise run check`。

推送 PR 分支前至少运行 `pnpm format:check`。会触发完整 CI 的改动优先在推送前运行 `mise run check` 或上述等价命令。

## 仓库约束

- `.issues/` 是本地 issue 跟踪数据，不得加入 Git。即使任务要求创建或更新 issue，也不要使用 `git add -f .issues/...`；提交前确认 staged files 不包含 `.issues/`。
- 官网页面、产品图、SEO 和下载链接放在 `apps/web/src` 与 `apps/web/public`。下载链接从 `apps/desktop/package.json` 的版本号生成。
- `pnpm dev` 通过 workspace 源码消费 `@yomitomo/shared`、`@yomitomo/core`、`@yomitomo/ai` 和 `@yomitomo/reader-ui`；改动这些包后，桌面端 Vite watch 链路会重新构建相关代码。
- 修改 workspace 包名或依赖后更新 `pnpm-lock.yaml`；需要只更新 lockfile 时运行 `pnpm install --lockfile-only`。
