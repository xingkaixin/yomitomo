---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
---

# klip-3-reader-components-split

## 背景

- `packages/reader-ui/src/reader-components.tsx` 仍有约 2600 行，是 reader-ui 包最大的组件聚合文件。
- 该文件同时包含 selection menu、filter panel、question panel、agent annotate menu、settings panel、composer、annotation card 和一组格式化 / 样式辅助函数。
- reader-ui 是桌面端阅读器复用层，继续让多类组件共享一个文件会放大 UI 调整和阅读逻辑修改的冲突面。

## 现状

- `QuestionPanel` 在 `packages/reader-ui/src/reader-components.tsx:637`，负责问题归集、状态 tab、问题操作。
- `AgentAnnotateMenu` 在 `packages/reader-ui/src/reader-components.tsx:815`，负责共读规划、助手选择、章节计划、留言草稿、规划进度和启动批注。
- `ReaderSettingsPanel` 在 `packages/reader-ui/src/reader-components.tsx:1697`，负责阅读设置 UI。
- `Composer` 在 `packages/reader-ui/src/reader-components.tsx:1780`，负责用户批注输入、批注类型、@ 助手提示。
- `AnnotationCard` 在 `packages/reader-ui/src/reader-components.tsx:1973`，负责批注卡片、评论 thread、@ 助手、删除长按和展开状态。
- `ReaderSettings`、`VirtualCursorState`、`AgentDockItem`、`ReaderReadingSection` 等公共类型也定义在 `packages/reader-ui/src/reader-components.tsx:75` 附近，并被 `reader-utils.ts`、`use-agent-annotation-queue.ts`、`use-agent-reading-dock.ts` 引用。
- `mentionDraftWithAgent` 在 `packages/reader-ui/src/reader-components.tsx:216`，`matchesAgentMentionQuery` 在 `packages/reader-ui/src/reader-components.tsx:2575`，二者被 `AgentAnnotateMenu`、`Composer`、`AnnotationCard` 共同使用。
- `AvatarBadge`、`ReadingIntentLabelContent`、`AnnotationTypeLabelContent`、`SubmitShortcutKeys` 等展示 helper 也被多个组件共享。

## 目标

- 按组件职责拆分 `reader-components.tsx`，让每个文件只承载一个主要交互面。
- 保持 `packages/reader-ui/src/index.ts`、`@yomitomo/reader-ui/reader-components` 与现有消费者的导出兼容。
- 先明确公共类型、共享 mention helper、共享展示 primitive 的归属，再移动大型组件。
- 优先移动代码，不重写交互。
- 给复杂纯逻辑补小测试，避免拆分时只依赖组件快照。

## 非目标

- 不改变 Reader UI 视觉设计。
- 不改 `ReaderAppView` 的 props 合同。
- 不引入 compound component 新 API。
- 不重写 @ mention、共读规划或批注卡片交互。

## 发现与方案

### P1（拆分前置边界）

#### 1. `reader-components.tsx` 现在同时是组件文件、类型出口和共享 helper 容器

- 位置：
  - `packages/reader-ui/src/reader-components.tsx:75`
  - `packages/reader-ui/src/reader-components.tsx:216`
  - `packages/reader-ui/src/reader-components.tsx:507`
  - `packages/reader-ui/src/reader-components.tsx:1762`
  - `packages/reader-ui/src/reader-components.tsx:2575`
- 现象 / 风险：
  - `ReaderSettings`、`VirtualCursorState`、`AgentDockItem`、`ReaderReadingSection` 这些类型不属于任何单一组件，但当前只能从 `reader-components.tsx` 引用。
  - `mentionDraftWithAgent`、`matchesAgentMentionQuery` 是跨 `AgentAnnotateMenu`、`Composer`、`AnnotationCard` 的共享输入逻辑，不应挂到某一个组件文件下。
  - `AvatarBadge`、`ReadingIntentLabelContent`、`AnnotationTypeLabelContent`、`SubmitShortcutKeys` 是跨组件展示 primitive，直接随某个大组件移动会制造反向依赖。
  - 如果跳过这一层直接拆组件，新文件之间会互相 import，或者内部模块继续依赖兼容 barrel，拆分收益会被抵消。
- 建议方案：
  - 新增 `reader-types.ts`，移动 `PendingComposer`、`ActiveConnection`、`ReaderSettings`、`VirtualCursorState`、`AgentDockItem`、`HighlightChoiceAction`、`ReaderReadingSection`。
  - 新增 `reader-mention-utils.ts`，移动 `mentionDraftWithAgent`、`matchesAgentMentionQuery`、`normalizeMentionSearch`、`escapeRegExp` 等不依赖 JSX 的 mention 纯函数。
  - 新增 `reader-component-primitives.tsx`，移动 `AvatarBadge`、`ReadingIntentLabelContent`、`AnnotationTypeLabelContent`、`AnnotationTypeIcon`、`SubmitShortcutKeys` 等内部复用展示片段。
  - `reader-components.tsx` 和 `index.ts` 继续 re-export 公共类型与组件，保持外部导入路径不变。
- 验收标准：
  - [ ] `reader-utils.ts`、`use-agent-annotation-queue.ts`、`use-agent-reading-dock.ts` 不再从 `./reader-components` 导入公共类型。
  - [ ] `AgentAnnotateMenu`、`Composer`、`AnnotationCard` 的 mention 查询和插入逻辑都来自同一个 utils 模块。
  - [ ] 共享 primitive 不从任何大型业务组件文件导出。

### P1（组件职责）

#### 2. `AgentAnnotateMenu` 是独立业务面，应从通用组件聚合文件移出

- 位置：
  - `packages/reader-ui/src/reader-components.tsx:815`
- 现象 / 风险：
  - 组件内部同时维护 selected agents、draft plan、section plans、message drafts、caret indexes、planning progress、add menu 状态。
  - 共读规划的纯函数已经跟组件在同一文件中相邻存在，例如 `normalizeFocusSectionPlans`、`focusMessageFromDraft`、`focusSectionToReadingPlanItem`。
  - 这块逻辑变化频繁，继续放在聚合文件会影响其他基础组件 review。
- 建议方案：
  - 新增 `reader-agent-annotate-menu.tsx`，移动 `AgentAnnotateMenu` 与 focus plan helpers。
  - 将 `normalizeFocusSectionPlans`、`focusMessageFromDraft`、`filterFocusMessageTargetsForAgents`、`focusSectionToReadingPlanItem` 等不依赖 JSX 的逻辑放到 `reader-agent-annotate-utils.ts`。
  - `reader-agent-annotate-menu.tsx` 从 `reader-types.ts`、`reader-mention-utils.ts`、`reader-component-primitives.tsx` 引用共享能力，不从 `AnnotationCard` 或其他业务组件文件引用。
  - 保持 `reader-components.tsx` re-export 或从 `index.ts` 直接导出，避免消费者迁移成本。
- 验收标准：
  - [ ] `AgentAnnotateMenu` 不再定义在 `reader-components.tsx`。
  - [ ] focus plan helpers 有单元测试覆盖 section normalize、message target filter 和 reading plan item 生成。
  - [ ] 现有 `reader-components.test.tsx` 仍通过。

#### 3. `AnnotationCard` 同时处理卡片显示、评论 thread 和 @ mention 输入

- 位置：
  - `packages/reader-ui/src/reader-components.tsx:1973`
- 现象 / 风险：
  - 一个组件内包含 primary comment 展示、thread comments、textarea、mention search、agent tray、删除 hold timer、展开状态同步。
  - 批注卡片的 UI 修改容易误伤评论输入和 @ mention 逻辑。
- 建议方案：
  - 新增 `reader-annotation-card.tsx`，移动 `AnnotationCard`。
  - 从中再抽 `AnnotationCommentComposer` 和 `AnnotationThread`，但只在拆分后确实减少复杂度时做。
  - `annotationMentionAgents` 可以留在 `reader-annotation-card.tsx`，因为它只服务批注卡片的作者优先排序。
  - `matchesAgentMentionQuery`、`mentionDraftWithAgent` 等跨组件 mention helper 应来自 `reader-mention-utils.ts`，不放入 `reader-annotation-card.tsx`。
- 验收标准：
  - [ ] `AnnotationCard` 单文件入口清晰。
  - [ ] 评论 composer 可以独立测试 @ mention filter 和键盘行为。
  - [ ] 删除长按逻辑仍有 cleanup，组件卸载不会留下 timer。

### P2（基础组件出口）

#### 4. `reader-components.tsx` 应退化成轻量 barrel 或小组件文件

- 位置：
  - `packages/reader-ui/src/reader-components.tsx:237`
  - `packages/reader-ui/src/reader-components.tsx:526`
  - `packages/reader-ui/src/reader-components.tsx:1697`
- 现象 / 风险：
  - SelectionMenu、HighlightChoiceMenu、AnnotationConnection、VirtualCursor、AgentReadingDock、FilterPanel、QuestionPanel、SettingsPanel 等组件同处一个文件。
  - 一次 import 会让读者误以为这些组件强耦合，实际很多是独立 UI 片段。
- 建议方案：
  - 最终保留 `reader-components.tsx` 作为兼容导出层，内部只 re-export。
  - 新增按职责命名的文件：`reader-selection-menu.tsx`、`reader-question-panel.tsx`、`reader-settings-panel.tsx`、`reader-filter-panel.tsx`、`reader-annotation-card.tsx`。
  - 不一次性拆完全部小组件，优先拆 `AgentAnnotateMenu` 和 `AnnotationCard`。
- 验收标准：
  - [ ] 最终阶段 `reader-components.tsx` 不再超过 300 行。
  - [ ] `@yomitomo/reader-ui/reader-components` 的现有导入路径仍可用。
  - [ ] 拆分后的内部模块不通过 `reader-components.tsx` 彼此引用。
  - [ ] `pnpm --filter @yomitomo/reader-ui typecheck` 通过。

## 建议落地顺序

1. Phase 0：先抽 `reader-types.ts`、`reader-mention-utils.ts`、`reader-component-primitives.tsx`，只改导入路径，不移动大型组件。
2. Phase 1：拆 `AgentAnnotateMenu` 和 focus plan helpers，补纯函数测试。
3. Phase 2：拆 `AnnotationCard`，必要时在文件内部拆 `AnnotationCommentComposer` 和 `AnnotationThread`。
4. Phase 3：拆 `QuestionPanel`、`ReaderSettingsPanel`、filter panel、selection menu 等中小组件。
5. Phase 4：将 `reader-components.tsx` 收敛为兼容 re-export，并确认子路径导出仍可用。

## 验收标准

- [ ] `pnpm --filter @yomitomo/reader-ui typecheck` 通过。
- [ ] `pnpm --filter @yomitomo/reader-ui test` 通过。
- [ ] `pnpm --filter @yomitomo/reader-ui lint` 通过。
- [ ] 拆分后公共导出路径不破坏 desktop 编译。
- [ ] Phase 0 后内部非组件模块不再依赖 `./reader-components` 获取类型。
- [ ] Phase 4 后 `reader-components.tsx` 只保留兼容 re-export。
