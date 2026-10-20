# AGENTS.md

修改 `apps/desktop` 前同时遵循 `apps/desktop/AGENTS.md`。

## 技术约束

- 多个 workspace 共用的依赖版本集中在 `pnpm-workspace.yaml` 的 `catalog`，各 `package.json` 使用 `catalog:` 引用；升级共用依赖时修改 catalog。`apps/desktop/electron-native` 保持独立安装配置。
- 除 `@yomitomo/web` 外统一使用 TypeScript 7；`apps/web` 单独声明 TypeScript 6，供 Astro 与 `@astrojs/check` 使用。没有明确迁移任务时不要统一这两个版本。
- Cloudflare Workers 和官网的开发与部署通过系统全局 `cf` CLI 调用，它不在 workspace 依赖中。

## 文档

动手前先读与任务相关的文档。改动目标、边界或流程时，在同一 PR 更新对应文档；文档与代码不一致时，核实后修正文档。

- 方向与架构：`docs/product.md`（目标、非目标、取舍原则、隐私边界）、`docs/architecture.md`（运行单元、包归属与依赖方向、关键决策）、`CONTEXT.md`（领域术语）。
- 子系统设计：`docs/annotation-data-flow.md`、`docs/effect-v4-runtime.md`、`docs/ui-primitives.md`、`docs/desktop-style-ownership.md`、`docs/reading-memory-model-evaluation.md`。
- 发布与运维：`docs/release-guide.md`、`docs/reading-memory-release.md`、`docs/reading-memory-model-distribution.md`、`docs/web-performance.md`、`docs/web-backgrounds.md`。

`docs/` 只保存仍然有效的目标、约束和流程。一次性的代码审查、拆分计划、spike、性能实验和单次发布清单不进入仓库；结论写进对应文档，过程留在 PR 和 commit history。

## 命令与门禁

本地快速循环使用 `mise run check:fast`。推送 PR 分支前至少运行 `pnpm format:check`；会触发完整 CI 的改动在推送前运行 `mise run check`。

`mise run check` 是 canonical 门禁，CI 按同一顺序执行。未安装 mise 时运行下面的等价命令，`pnpm gate:check` 会校验它与 `mise.toml`、CI 一致：

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

无图形环境的 Linux 通过 `xvfb-run -a mise run check` 运行完整门禁。

## 测试取舍

- 测试优先保护核心计算、业务规则、数据一致性、安全边界和真实故障回归，不以覆盖率或用例数量为目标。
- 新增测试应对应独立的可观察结果。同一行为不在多层重复穷举；不为导出清单、组件引用、文案、CSS 排版或动画参数维护实现快照。涉及可访问性、点击或文本选择的必要约束可以保留。
- 常规测试使用能触发边界的最小数据集。大规模性能测量放在专项测试或工作流中；阅读记忆的万条向量检索性能由 `reading-memory-model.yml` 中的真实模型 benchmark 验证。

## 仓库约束

- `.issues/` 是本地 issue 数据，不进 Git。不要使用 `git add -f .issues/...`；提交前确认 staged files 不包含 `.issues/`。
