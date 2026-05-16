---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
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
- `ReadingCardWorkflowStep` 类型在 `apps/desktop/src/renderer/src/app-types.ts:4` 到 `apps/desktop/src/renderer/src/app-types.ts:12`，当前包含 `onAction` callback；如果纯派生函数直接返回这个类型，会把状态派生和 React 事件绑定混在一起。
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
  - 新增 `app-reading-card-workflow.ts`，定义不包含 React callback 的 workflow view state type、`deriveReadingCardWorkflow` 和 current card/review freshness 判断。
  - `deriveReadingCardWorkflow` 只接收 workflow status、`deliberation`、`aiCard`、`selectedReviewAgentIds` 等纯数据，返回 `workflowSteps` 的展示数据和 `currentAiCard`；UI 层再把 step id 映射到具体 action。
  - 新增 `useReadingCardWorkflow({ article, articleText, evidenceUnits, reviewAgentIds, onGenerated })` hook，承接 state 初始化、生成、审核、retry、review agent toggle。
  - hook 不接收完整 `reviewAgents` 对象；review agent 的昵称、头像、颜色属于展示组件输入，workflow 只需要可用 reviewer id 列表。
  - `ReadingCard` 只消费 hook 返回的 `workflowSteps`、`currentAiCard`、`errors`、`actions`、`retryingReviewerId` 和 reviewer selection state。
- 验收标准：
  - [ ] freshness 判断只出现在 `app-reading-card-workflow.ts` 及其测试中。
  - [ ] `deriveReadingCardWorkflow` 的返回值不包含 `onAction` 或其他 React callback。
  - [ ] `deriveReadingCardWorkflow` 有单元测试覆盖 idle、generating、error、stale card、stale review。
  - [ ] `ReadingCard` 不再内联派生 `workflowSteps`，也不再直接持有 `deliberationState`、`aiState`、`reviewState` 这组 workflow status state。

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
  - hook 暴露 `selectedReviewAgentIds`、`toggleReviewAgent`、`canReview`；组件继续接收完整 `reviewAgents` 用于渲染头像、昵称和颜色。
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
  - 优先抽 `ReadingCardEvidencePanel` 小组件，因为它只依赖 `evidenceUnits`，边界清晰。
  - `ReadingCardOutputStack` 暂不作为必须项；只有在抽出 workflow hook 后，props 列表仍然简洁时再拆。若需要传入大量 errors、draft、review retry、stats 和 callbacks，则保留在顶层更简单。
  - 不改变 DOM className，避免 CSS 回归。
- 验收标准：
  - [ ] 证据区从 `ReadingCard` return 中移出，DOM className 和空态文案不变。
  - [ ] 若拆 `ReadingCardOutputStack`，其 props 必须保持在当前真实依赖内，不能为了减少顶层行数引入透传式组件。
  - [ ] 现有 `app-reading-card-panel.test.tsx` 继续通过。

## 建议落地顺序

1. 先抽纯函数 `deriveReadingCardWorkflow` 并补测试。
2. 再抽 `useReadingCardWorkflow`，用对象参数显式传入 `articleText`、`evidenceUnits` 和 `reviewAgentIds`，保持 `ReadingCard` 行为不变。
3. 再拆 `ReadingCardReviewAgentStrip`，只把展示数据留在组件内。
4. 最后拆 `ReadingCardEvidencePanel`；`ReadingCardOutputStack` 仅在 props 边界清晰时处理。

## 验收标准

- [ ] `pnpm --filter @yomitomo/desktop test -- app-reading-card` 通过。
- [ ] `pnpm --filter @yomitomo/desktop typecheck` 通过。
- [ ] `pnpm --filter @yomitomo/desktop lint` 通过。
- [ ] 重新生成审议、AI 提炼、审核、单个 reviewer retry 的手测路径行为不变。
