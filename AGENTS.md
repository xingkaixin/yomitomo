# AGENTS.md

Yomitomo 是本地优先的 AI 伴读桌面应用：Electron 桌面端，配套 Astro 官网和下载、遥测两个 Cloudflare Worker。修改 `apps/desktop` 前同时遵循 `apps/desktop/AGENTS.md`。

## 产品红线

下面几条任何改动都可能破坏，CI 不会发现。完整的取舍原则见 `docs/product.md`。

- 新增会让数据离开本机的请求时，先更新 `docs/product.md` 的隐私边界。
- 没有 AI、provider 或本地模型时，阅读、手动批注和关键词检索照常可用；保存不等待 AI、向量或远程调用。
- 用户的划线和想法原样保存和展示，不被 AI 或后处理改写。
- 主动的 AI 输出只由用户的显式动作触发，例如 @助手、问一问；滚动和翻页不算。

## 工程取舍

- 拆分要有独立的变更原因。行数和复杂度指标不是拆分理由。
- 性能改动以测量为前提，用 `apps/desktop/e2e/performance` 的观测脚本做前后对比。结论只适用于测量时的数据形态。
- 只保留证明产品或逻辑假设的测试：能说清"这个假设不成立时，用户会看到什么错误、丢失什么数据或泄露什么信息"。说不清，或只是在复述实现，就不写。
- 可保留的测试范围：核心计算与业务规则、数据一致性与迁移、真实输入格式解析、安全与隐私边界、打包与发布、可复现的真实故障回归。
- 不写实现细节测试：mock 调用、内部状态、接线与清单、组件 DOM 结构、文案、样式、动画、默认值。同一假设只在最贴近用户结果的一层测一次，用能触发边界的最少用例。
- 大规模性能测量放在专项测试或工作流中；阅读记忆的万条向量检索性能由 `reading-memory-model.yml` 中的真实模型 benchmark 验证。

## 技术约束

- 多个 workspace 共用的依赖版本集中在 `pnpm-workspace.yaml` 的 `catalog`，各 `package.json` 使用 `catalog:` 引用；升级共用依赖时修改 catalog。`apps/desktop/electron-native` 保持独立安装配置。
- 除 `@yomitomo/web` 外统一使用 TypeScript 7；`apps/web` 单独声明 TypeScript 6，供 Astro 与 `@astrojs/check` 使用。没有明确迁移任务时不要统一这两个版本。
- Cloudflare Workers 和官网的开发与部署通过系统全局 `cf` CLI 调用，它不在 workspace 依赖中。

## 文档

动手前先读与任务相关的文档。改动目标、边界或流程时，在同一 PR 更新对应文档；文档与代码不一致时，核实后修正文档。

| 任务 | 先读 |
| --- | --- |
| 新需求、改变 AI 行为、新增外发数据 | `docs/product.md` |
| 决定代码放在哪个包或进程、跨包依赖、数据库与密钥 | `docs/architecture.md` |
| 领域术语、中文产品词对应的代码名 | `CONTEXT.md` |
| 批注、想法、讨论和助手回复链路 | `docs/annotation-data-flow.md` |
| main、`packages/ai`、`packages/core` 中的 Effect 代码 | `docs/effect-v4-runtime.md` |
| renderer 的状态、推送订阅和 effect hook | `docs/renderer-state.md` |
| 交互组件与桌面端样式 | `docs/ui-primitives.md`、`docs/desktop-style-ownership.md` |
| 阅读记忆模型的选择、分发与发布门禁 | `docs/reading-memory-model-evaluation.md`、`docs/reading-memory-model-distribution.md`、`docs/reading-memory-release.md` |
| 发版 | `docs/release-guide.md` |
| 官网资源加载、缓存与背景素材 | `docs/web-performance.md`、`docs/web-backgrounds.md` |

`docs/` 只保存仍然有效的目标、约束和流程。一次性的代码审查、拆分计划、spike、性能实验和单次发布清单不进入仓库；结论写进对应文档，过程留在 PR 和 commit history。

## 命令与门禁

本地快速循环使用 `mise run check:fast`。推送 PR 分支前至少运行 `pnpm format:check`；会触发完整 CI 的改动在推送前运行 `mise run check`。

`mise run check` 是 canonical 门禁，CI 把同一组命令拆到并行 job 执行。未安装 mise 时运行下面的等价命令；改动门禁时同步更新 `mise.toml`、CI 和本节：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:app:e2e:from-dist
```

无图形环境的 Linux 通过 `xvfb-run -a mise run check` 运行完整门禁。

CI 用 `Repository checks` job 判断改动范围：只改文档的 PR 跳过构建和测试，Sparkle 烟测只在其输入变化时运行，main 的每个提交都全量运行。分支保护只要求 `CI OK`；不要要求其他 job 或 `Reading Memory Model`，它们被跳过时检查会一直挂起。

## 仓库约束

- `.issues/` 是本地 issue 数据，不进 Git。不要使用 `git add -f .issues/...`；提交前确认 staged files 不包含 `.issues/`。
