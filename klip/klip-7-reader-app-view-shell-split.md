---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
Origin: 2026-05-16 codebase review（ReaderAppView 单体组件拆分）
---

# klip-7-reader-app-view-shell-split

## 背景

- `packages/reader-ui/src/reader-components.tsx` 已经收敛为兼容 barrel，但 `packages/reader-ui/src/reader-app-view.tsx` 仍有约 1079 行。
- `ReaderAppView` 在 `packages/reader-ui/src/reader-app-view.tsx:235` 定义，当前同时承载 toolbar、目录、正文 surface、高亮层、批注 rail、筛选面板、阅读设置、选区菜单、评论 composer、问题抽屉、助手阅读 dock 和虚拟光标。
- 顶层组件还直接维护批注筛选、rail 退出动画、批注卡片高度测量、ResizeObserver、选区快捷键、浮层关闭和响应式侧栏关闭逻辑，集中在 `packages/reader-ui/src/reader-app-view.tsx:314` 到 `packages/reader-ui/src/reader-app-view.tsx:686`。
- 这类文件不是单纯“行数大”，而是把 state 派生、DOM 测量和 JSX 分区拼装放在同一个组件里，后续修改任一 UI 区域都必须理解完整阅读器 shell。

## 现状

- `ReaderAppViewProps` 位于 `packages/reader-ui/src/reader-app-view.tsx:128` 到 `packages/reader-ui/src/reader-app-view.tsx:212`，是阅读器 shell 的 public contract，不应在拆分时顺手改掉。
- 批注筛选与 rail 状态派生包含：
  - `annotationFilter`、`railAnimation`、`noteHeights`、`expandedPrimaryCommentIds`，位置在 `packages/reader-ui/src/reader-app-view.tsx:314` 到 `packages/reader-ui/src/reader-app-view.tsx:334`。
  - `visibleAnnotations`、`annotationFilterFacets`、`annotationRailItems`、`annotationNavigation`，位置在 `packages/reader-ui/src/reader-app-view.tsx:336` 到 `packages/reader-ui/src/reader-app-view.tsx:379`。
  - ResizeObserver 注册和高度回收，位置在 `packages/reader-ui/src/reader-app-view.tsx:395` 到 `packages/reader-ui/src/reader-app-view.tsx:467`。
- 页面 JSX 分区包含：
  - toolbar：`packages/reader-ui/src/reader-app-view.tsx:707` 到 `packages/reader-ui/src/reader-app-view.tsx:820`。
  - floating panels：`packages/reader-ui/src/reader-app-view.tsx:822` 到 `packages/reader-ui/src/reader-app-view.tsx:866`。
  - toc：`packages/reader-ui/src/reader-app-view.tsx:875` 到 `packages/reader-ui/src/reader-app-view.tsx:911`。
  - reader surface / highlight layer / annotation rail / composer：`packages/reader-ui/src/reader-app-view.tsx:913` 到 `packages/reader-ui/src/reader-app-view.tsx:1051`。
  - question drawer / dock / virtual cursors：`packages/reader-ui/src/reader-app-view.tsx:1053` 到 `packages/reader-ui/src/reader-app-view.tsx:1076`。

## 目标

- 把 `ReaderAppView` 从大型组件拆成 shell + 若干明确展示区组件。
- 把批注 rail 的筛选、动画、高度测量和 ref 注册抽成 hook，降低顶层组件圈复杂度。
- 保持 `ReaderAppViewProps` 对外 API、DOM className 和现有交互不变。
- 给被抽出的纯逻辑或 hook 行为增加最小测试，覆盖筛选裁剪、rail 退出动画和新增批注展开规则。

## 非目标

- 不重做阅读器视觉设计。
- 不改变 `ReaderAppView` 的 public props。
- 不改变 `reader-utils.ts` 里的批注筛选、rail positioning、highlight segment 算法。
- 不修改 `AnnotationCard`、`Composer`、`AgentAnnotateMenu` 等已有子组件内部行为。

## 发现与方案

### P1（组件边界）

#### 1. `ReaderAppView` 同时承担 shell 编排和批注 rail 状态管理

- 位置：
  - `packages/reader-ui/src/reader-app-view.tsx:314`
  - `packages/reader-ui/src/reader-app-view.tsx:336`
  - `packages/reader-ui/src/reader-app-view.tsx:395`
  - `packages/reader-ui/src/reader-app-view.tsx:512`
- 现象 / 风险：
  - 批注筛选、rail 动画、卡片高度测量和新增批注默认展开都依赖同一组本地 state。
  - JSX 区域改动容易误触这些状态规则，尤其是过滤、评论关闭、批注新增三类交互。
- 建议方案：
  - 新增 `reader-annotation-rail-state.ts` 或 `use-reader-annotation-rail.ts`。
  - 移动 `annotationFilter`、`railAnimation`、`noteHeights`、`expandedPrimaryCommentIds`、`noteRefForAnnotation`、`setPrimaryCommentExpanded` 和相关 effects。
  - hook 返回 `annotationFilterFacets`、`annotationRailItems`、`visibleAnnotations`、`visibleAnnotationIds`、`visibleRailAnnotations`、`exitingAnnotationIds`、`noteRefForAnnotation`、`clearAnnotationFilter`、`toggleAnnotationFilterValueForGroup`。
- 验收标准：
- [x] `ReaderAppView` 不直接持有 `noteHeights`、`railAnimation`、`noteElementsRef`。
- [x] 新 hook 覆盖 article 切换、批注新增、筛选后退出动画和高度清理。
- [x] `AnnotationCard` 渲染路径的 DOM className 不变。

#### 2. Toolbar、floating panels、toc、surface 混在一个 return 中

- 位置：
  - `packages/reader-ui/src/reader-app-view.tsx:707`
  - `packages/reader-ui/src/reader-app-view.tsx:822`
  - `packages/reader-ui/src/reader-app-view.tsx:875`
  - `packages/reader-ui/src/reader-app-view.tsx:913`
- 现象 / 风险：
  - return 里同时存在控制区、弹层、正文、高亮、批注 rail 和辅助抽屉。
  - 这会让小的 toolbar 或 toc 改动必须加载完整 surface 上下文。
- 建议方案：
  - 新增 `reader-toolbar.tsx`，承接标题、目录切换、问题计数、批注导航、筛选、共读、设置和关闭按钮。
  - 新增 `reader-floating-panels.tsx`，承接 `AgentAnnotateMenu`、`AnnotationFilterPanel` 和 `ReaderSettingsPanel` 的显隐。
  - 新增 `reader-toc-panel.tsx`，承接目录列表和目录批注统计展示。
  - 新增 `reader-surface-view.tsx`，承接正文 article、highlight layer、annotation rail、selection menu、highlight choice 和 composer。
- 验收标准：
- [x] `ReaderAppView` return 只保留 shell 布局和子组件拼装。
- [x] 子组件只接收真实展示依赖，不通过一个巨大 `viewModel` 透传所有 props。
- [x] `reader-toolbar.tsx` 不 import rail state hook。
- [x] `reader-surface-view.tsx` 不 import `AgentAnnotateMenu` 或 `ReaderSettingsPanel`。

#### 3. 浮层关闭和 selection shortcut 属于 shell 行为，应该集中命名

- 位置：
  - `packages/reader-ui/src/reader-app-view.tsx:590`
  - `packages/reader-ui/src/reader-app-view.tsx:640`
  - `packages/reader-ui/src/reader-app-view.tsx:662`
- 现象 / 风险：
  - `handleReaderPointerDownCapture` 同时关闭 settings/agent/filter、composer、highlight choice 和 active annotation。
  - selection shortcut effect 与 composer/selectionAction 的关系正确，但目前埋在大型组件中。
- 建议方案：
  - 保留在 `ReaderAppView` 或抽为 `useReaderShellInteractions`，但不要混入 surface 展示组件。
  - 若抽 hook，只传入最小 callback 集合，不让 hook 读取 annotation rail 内部状态。
- 验收标准：
- [x] Escape、点击外部、selection shortcut 交互由现有测试或新增 smoke test 覆盖。
- [x] 外部点击关闭规则仍使用现有 `activeAnnotationPreserveSelector` 语义。

## 建议落地顺序

1. 先抽 `use-reader-annotation-rail.ts`，不移动 JSX，只把 state 和 derived data 从 `ReaderAppView` 中拿出去。
2. 再抽 `reader-toolbar.tsx` 和 `reader-floating-panels.tsx`，因为它们不依赖 DOM 测量。
3. 再抽 `reader-toc-panel.tsx`。
4. 最后抽 `reader-surface-view.tsx`，这是 props 最多、回归面最大的部分。

## 验收标准

- [x] `packages/reader-ui/src/reader-app-view.tsx` 控制在 350 行以内。
- [x] `ReaderAppViewProps` 不出现破坏性变更。
- [x] `pnpm --filter @yomitomo/reader-ui test -- reader-components reader-utils` 通过。
- [x] `pnpm --filter @yomitomo/reader-ui typecheck` 通过。
- [x] `pnpm --filter @yomitomo/reader-ui lint` 通过。
- [x] `pnpm --filter @yomitomo/desktop typecheck` 通过。
