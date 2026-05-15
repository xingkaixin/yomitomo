---
Author: "Codex"
Updated: 2026-05-16
Status: Draft
---

# klip-5-reading-card-panel-state

## 背景

- `apps/desktop/src/renderer/src/app-reading-card-panel.tsx` 约 1100 行，但主要复杂度集中在 `ReadingCard` 顶层组件。
- `ReadingCard` 当前同时管理阅读审议生成、AI 读后笔记生成、审核、审核助手选择、错误状态、workflow step 派生、草稿展示、证据列表和 review 展示。
- 该组件是读后卡片工作流的核心入口，后续继续叠加审核体验或导出能力前，需要先把工作流状态与展示拆开。

## 现状

- `ReadingCard` 在 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:74`。
- 顶层 state 包含 `deliberation`、`deliberationState`、`aiCard`、`aiState`、`reviewState`、`retryingReviewerId`、`selectedReviewAgentIds` 等，位置在 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:85` 到 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:123`。
- workflow steps 由嵌套条件表达式派生，位置在 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:150` 到 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:237`。
- 三个异步动作 `generateAiCard`、`generateDeliberation`、`reviewAiCard` 和单个 reviewer retry 都定义在组件内，位置在 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:239` 到 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:331`。
- review 展示子组件 `ReadingCardReviewerCard` 在 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:729`，已经比顶层组件更接近展示组件。

## 目标

- 把读后卡片 workflow 状态机从 JSX 展示组件中抽离。
- 降低 `ReadingCard` 顶层圈复杂度和条件表达式嵌套。
- 保持现有 IPC 调用和 persisted record 结构不变。
- 给 workflow 派生逻辑补纯函数测试。

## 非目标

- 不改变读后卡片生成、审议、审核的产品流程。
- 不改 `window.yomitomoDesktop` preload API。
- 不改变 Markdown 渲染或 evidence reference 语法。
- 不重做读后卡片视觉设计。

## 发现与方案

### P1（状态边界）

#### 1. 顶层组件同时管理 workflow 状态和展示

- 位置：
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:85`
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:150`
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:239`
- 现象 / 风险：
  - 状态派生、异步动作和 JSX 混在一个组件中。
  - workflow step 的 `description/state/disabled` 由多层嵌套条件表达式组成，后续增加状态时容易漏改。
  - 异步动作直接读写多个 state，难以单独测试“审议更新后 AI 卡片失效”“卡片更新后 review 失效”等规则。
- 建议方案：
  - 新增 `app-reading-card-workflow.ts`，定义 workflow state type、`deriveReadingCardWorkflow` 和 current card/review freshness 判断。
  - 新增 `useReadingCardWorkflow(article, reviewAgents, onGenerated)` hook，承接 state 初始化、生成、审核、retry、review agent toggle。
  - `ReadingCard` 只消费 hook 返回的 `workflowSteps`、`currentAiCard`、`errors`、`actions`。
- 验收标准：
  - [ ] freshness 判断不再散落在组件 JSX 文件中。
  - [ ] `deriveReadingCardWorkflow` 有单元测试覆盖 idle、generating、error、stale card、stale review。
  - [ ] `ReadingCard` 顶层组件行数和圈复杂度明显下降。

#### 2. Review agent 选择与 review 执行耦合在同一组件

- 位置：
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:142`
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:283`
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:333`
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:362`
- 现象 / 风险：
  - review agent ids 的默认选择、切换、错误清理和 review 执行共用组件局部 state。
  - 未来如果增加“默认审核组”或“按 agent retry 状态显示”，会继续扩大顶层组件。
- 建议方案：
  - 抽 `ReadingCardReviewAgentStrip` 展示组件。
  - hook 暴露 `selectedReviewAgentIds`、`toggleReviewAgent`、`canReview`。
- 验收标准：
  - [ ] 审核助手条可单独组件测试。
  - [ ] 没有审核助手时仍显示原文案“请先在助手设置中创建审核助手。”

### P2（展示层分离）

#### 3. 顶层组件仍直接组装草稿区、证据区和输出区

- 位置：
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:394`
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:417`
  - `apps/desktop/src/renderer/src/app-reading-card-panel.tsx:431`
- 现象 / 风险：
  - 顶层组件 return 里同时包含 workflow、errors、审议 panel、card deck、draft grid、evidence list。
  - 展示组件已经存在一部分，但主布局仍由顶层组件直接拼装。
- 建议方案：
  - 新增 `ReadingCardOutputStack` 和 `ReadingCardEvidencePanel` 小组件。
  - 不改变 DOM className，避免 CSS 回归。
- 验收标准：
  - [ ] 顶层 `ReadingCard` return 只保留布局骨架。
  - [ ] 现有 `app-reading-card-panel.test.tsx` 继续通过。

## 建议落地顺序

1. 先抽纯函数 `deriveReadingCardWorkflow` 并补测试。
2. 再抽 `useReadingCardWorkflow`，保持 `ReadingCard` 行为不变。
3. 最后拆 review agent strip、output stack、evidence panel。

## 验收标准

- [ ] `pnpm --filter @yomitomo/desktop test -- app-reading-card-panel` 通过。
- [ ] `pnpm --filter @yomitomo/desktop typecheck` 通过。
- [ ] `pnpm --filter @yomitomo/desktop lint` 通过。
- [ ] 重新生成审议、AI 提炼、审核、单个 reviewer retry 的手测路径行为不变。
