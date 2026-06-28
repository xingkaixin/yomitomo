---
Author: "Codex"
Updated: 2026-06-28
Status: Proposed
Origin: RD-774（为沉淀审阅窗口建立拆分边界）
---

# klip-18-annotation-sedimentation-window-boundary

## 背景

`apps/desktop/src/renderer/src/annotation-discussion/app-annotation-sedimentation-window.tsx`
当前约 2195 行。它不是单纯的长 JSX 文件，而是把多个生命周期不同的 module 放在
同一个 React 组件闭包里：

- `AnnotationSedimentationWindowApp` 负责 URL 参数、主题同步、窗口转场、初始数据加载和
  loading/missing/error 状态。
- `SedimentationShell` 同时负责 active reviewer、local draft、publish/unpublish、
  review stream、organize stream、proposal preview、draft anchor hover、proposal 状态回写和
  页面布局组合。
- 文件尾部包含 draft preview、organize card、review timeline、structured review items、
  proposal list、diff preview、empty state 和 prompt/transcript helper。

目录里已经有两个合理的纯逻辑 module：

- `app-annotation-sedimentation-proposals.ts`：负责 proposal 到 draft 的 change planning、
  grouped change set、anchor planning 和 proposal status 更新。
- `app-annotation-sedimentation-state.ts`：负责 distillation article/session/proposal 的纯状态
  转换，以及 review timeline message 派生。

所以后续拆分不应该再创建并行的 proposals/state 抽象。RD-774 的目标是先记录 seam 和
迁移顺序，让后续每个 PR 只移动一个稳定 ownership。

## 目标

- 让沉淀窗口拆分有明确的 module ownership，不按行数或视觉碎片机械拆文件。
- 保留现有 `proposals` 与 `state` module，把 UI view 和 request/session orchestration 从
  `app-annotation-sedimentation-window.tsx` 中分阶段移出。
- 让后续 PR 能独立 review、独立验证，并保持现有沉淀审阅行为不变。

## 非目标

- 不重做沉淀审阅产品流程。
- 不改变 distillation、proposal、draft preview 或 publish/unpublish 的业务语义。
- 不引入 Context、reducer 或状态管理库来隐藏 props 契约。
- 不新增通用 agent stream framework。
- 不把 `FloatingComposer` 再包一层浅 module。当前 review composer 的复杂度主要在父层状态，
  不是输入框自身。

## 现状职责图

### Window app

位置：`AnnotationSedimentationWindowApp`、`SedimentationEmptyState`。

职责：

- 从 query string 读取 `articleId`、`annotationId`。
- 同步主题、窗口转场和 document title。
- 调用 `window.yomitomoDesktop.getArticle` / `getState` 构造 `SedimentationWindowStatus`。
- 渲染 ready shell 或 empty state。

保留原因：这是窗口级 lifecycle，和 review/proposal 语义没有共享状态。

### Orchestration shell

位置：`SedimentationShell`。

职责：

- 持有当前 `article`、`annotation`、`uiLanguage` 和 review agents。
- 持有 draft、review draft、saving/reviewing/organizing、notice、pending preview 和 hover 状态。
- 编排 publish/unpublish、review round、organize discussion、proposal preview 和 proposal
  status 回写。
- 拼装 document area、review panel、organize card 和 composer。

问题：这个 module 的 interface 目前是整个 React closure，调用者和测试无法只跨一个稳定 seam
验证 review request 或 timeline render。

### Proposal planning module

位置：`app-annotation-sedimentation-proposals.ts`。

职责：

- `planDistillationProposalChangeSet`
- `planDistillationProposalDraftAnchor`
- `normalizeDistillationProposalDraftChangeSetEntries`
- `composeDistillationProposalDraftChangeSetEntries`
- proposal status 更新 helper

结论：这是已经成立的深 module。后续只复用，不重建。

### Distillation state module

位置：`app-annotation-sedimentation-state.ts`。

职责：

- pending proposal 派生。
- draft preview decision 到 draft/status 的纯转换。
- article/annotation/session/message 的不可变更新。
- review proposal source 补全。
- review timeline message 派生。

结论：这是已经成立的深 module。后续拆 UI 时可以继续把状态转换留在这里。

## 目标 module

### 1. `app-annotation-sedimentation-draft-preview.tsx`

Interface：

- `DraftChangePreviewLayer`
- `DraftAnchorHighlightLayer`

输入：

- `DistillationProposalDraftChangeSet`
- `DraftPreviewDecisions`
- `HoveredDraftAnchor`
- draft 文本、scroll offset 和 `onDecision`

own：

- preview layer 的 text slicing、change mark、keep/discard actions。
- anchor highlight layer 的 point/text mark render。

不 own：

- 不决定哪些 proposal 可预览。
- 不更新 proposal 状态。
- 不读写 textarea selection、localStorage 或 article。

迁移价值：这是最低风险 view seam，接口小，行为已由现有 UI 测试覆盖。

### 2. `app-annotation-sedimentation-review-timeline.tsx`

Interface：

- `SedimentationReviewTimeline`

输入：

- review agents、review sessions、user profile、pending proposal ids。
- proposal hover、preview、ignore、restore callbacks。

own：

- empty review state。
- timeline scroll-to-bottom effect。
- user/assistant message bubble。
- markdown rendering、structured review items、review proposal list。
- review/proposal label 和 diff preview。

不 own：

- 不创建 review session。
- 不修改 proposal status。
- 不知道 draft preview 的决策结果。

迁移价值：timeline JSX 和 label/diff presentation 与 shell orchestration 解耦，后续 review
message 视觉改动不再触碰 publish/review stream 逻辑。

### 3. `app-annotation-sedimentation-organize-card.tsx`

Interface：

- `OrganizeDiscussionCard`
- `OrganizeDiscussionConfirmDialog`

输入：

- `OrganizeDiscussionState`
- applied/dismissed/pending proposal ids。
- preview、hover、retry、close、confirm callbacks。

own：

- organize card 的 minimized/running/done/failed 展示。
- organize structured items、markdown fallback、proposal list 和 scroll hint。
- organize confirm dialog。

不 own：

- 不发起 organize stream。
- 不决定 proposal 采用后如何写回 draft。
- 不持久化 review session。organize 结果当前只在 draft 区域展示，不保存为 review timeline。

迁移价值：organize 是 draft area 内的独立视图，和 review timeline 相似但保存语义不同，应该独立
而不是强行合并成通用 proposal list module。

### 4. `app-annotation-sedimentation-review-request.ts`

Interface：

```ts
type RequestSedimentationReviewRoundInput = {
  agent: PublicAgent;
  article: ArticleRecord;
  annotation: Annotation;
  draft: string;
  reviewDraft: string;
  reviewMode: 'review' | 'organize_discussion';
  sessions: AnnotationDistillationReviewSession[];
  uiLanguage?: UiLanguage;
  userMessage?: AnnotationDistillationReviewMessage;
  requestReviewStream: typeof window.yomitomoDesktop.requestAgentDistillationReviewStream;
  onOptimisticSession: (session: AnnotationDistillationReviewSession) => void;
};
```

own：

- review request payload。
- transcript 和 default request comment。
- progress/item/delta stream callback。
- optimistic session 更新。
- final message source 补全和 failed message 标记。

不 own：

- 不遍历 active agents。
- 不调用 `saveArticle`。
- 不更新 shell notice。
- 不自动预览 proposal。

迁移价值：review stream 是高风险逻辑。抽出后可以通过 fake `requestReviewStream` 直接测试成功、
progress、item、delta 和失败路径，而不必完整渲染窗口。

### 5. 保留 `app-annotation-sedimentation-window.tsx` 作为 shell

最终职责：

- window app 和 `SedimentationShell`。
- 外部 IPC/persistence 接入：`saveAndRefresh`、publish/unpublish、commit sedimentation。
- active agent、draft、review draft、pending preview 等跨 module orchestration state。
- 子 module 组合。

保留原因：当前只有一个 production adapter `window.yomitomoDesktop`。在没有第二个真实 adapter
前，不新增 repository/port layer。测试可继续 mock preload API。

## 数据流

1. Window app 从 query string 加载 article、store 和 annotation，进入 ready status。
2. Shell 初始化 draft：优先 localStorage，其次 annotation distillation content。
3. Publish/unpublish 通过 `publishedDistillationArticle` / `unpublishedDistillationArticle`
   生成 next article，`saveAndRefresh` 后再调用 `commitAnnotationSedimentation`。
4. Review round 由 shell 遍历 active agents。单个 agent 的 stream 后续由
   `app-annotation-sedimentation-review-request.ts` 负责，shell 只接收 optimistic session 和最终
   annotation/message。
5. Review proposal preview 使用 `planDistillationProposalChangeSet` 生成 pending draft preview。
   用户决策后，accepted changes 写入 local draft，proposal status 写回 review session。
6. Organize discussion 使用单独的 organize state 展示 stream 结果。organize proposal 采用后只更新
   local draft 和 applied/dismissed ids，不保存为 review timeline。
7. Draft anchor hover 使用 `planDistillationProposalDraftAnchor`，只在没有 pending preview 时展示。

## 迁移顺序

### PR 1：文档

交付物：

- 本 KLIP。
- RD-774 记录本轮实施状态。

验证：

- `git diff --check`

### PR 2：抽 draft preview view

交付物：

- 新增 `app-annotation-sedimentation-draft-preview.tsx`。
- 从主文件移出 `DraftChangePreviewLayer`、`DraftAnchorHighlightLayer`、
  `DraftChangePreviewChange`、`DraftChangePreviewMark`。

验证：

- `pnpm --filter @yomitomo/desktop test -- app-annotation-distillation-ui`
- `pnpm --filter @yomitomo/desktop typecheck`
- `pnpm --filter @yomitomo/desktop lint`
- `pnpm --filter @yomitomo/desktop format:check`

### PR 3：抽 review timeline view

交付物：

- 新增 `app-annotation-sedimentation-review-timeline.tsx`。
- 移出 `ReviewSessions`、`ReviewTimelineMessage`、`StructuredReviewItems`、
  `ReviewProposalList`、review label helper 和 `ProposalDiffPreview`。

验证：

- `pnpm --filter @yomitomo/desktop test -- app-annotation-distillation-ui`
- `pnpm --filter @yomitomo/desktop typecheck`
- `pnpm --filter @yomitomo/desktop lint`
- `pnpm --filter @yomitomo/desktop format:check`

### PR 4：抽 organize view

交付物：

- 新增 `app-annotation-sedimentation-organize-card.tsx`。
- 移出 `OrganizeDiscussionCard`、`OrganizeProposalList`、`OrganizeDiscussionConfirmDialog`。

验证：

- `pnpm --filter @yomitomo/desktop test -- app-annotation-distillation-ui`
- `pnpm --filter @yomitomo/desktop typecheck`
- `pnpm --filter @yomitomo/desktop lint`
- `pnpm --filter @yomitomo/desktop format:check`

### PR 5：抽 review request helper

交付物：

- 新增 `app-annotation-sedimentation-review-request.ts`。
- 移出 `requestAgentReviewRound`、`reviewRequestComment`、
  `distillationReviewPayloadFields`、`distillationReviewTranscript`。
- 新增针对 fake stream 的单元测试。

验证：

- `pnpm --filter @yomitomo/desktop test -- app-annotation-sedimentation-review-request app-annotation-distillation-ui`
- `pnpm --filter @yomitomo/desktop typecheck`
- `pnpm --filter @yomitomo/desktop lint`
- `pnpm --filter @yomitomo/desktop format:check`

## Stop 条件

- 如果一个新 module 的 props 比原实现更难理解，停止拆分，回到 shell 内部。
- 如果抽出的 module 只是导出一层转发，没有隐藏复杂度，撤回该拆分。
- 如果后续需要为了测试而暴露内部状态，说明 seam 放错了，优先调整 module interface。
- 如果 review 和 organize 的 stream 语义继续分化，不抽通用 stream module。

## 验收标准

- `app-annotation-sedimentation-window.tsx` 最终不再包含 timeline、organize card 和 draft preview
  的具体 JSX 实现。
- 主文件保留 orchestration state 和 IPC/persistence 接入，不把所有状态迁入全局 context。
- 后续每个 PR 都能用现有 `app-annotation-distillation-ui` 覆盖行为回归。
- request helper 抽出后，有 fake stream 单元测试覆盖成功和失败路径。
