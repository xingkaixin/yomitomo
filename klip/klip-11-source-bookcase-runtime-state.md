---
Author: "Codex"
Updated: 2026-05-16
Status: Draft
Origin: 2026-05-16 codebase review（SourceBookcase runtime 状态拆分）
---

# klip-11-source-bookcase-runtime-state

## 背景

- `klip-2-source-bookcase-split.md` 已把原始阅读器拆成 Web/EPUB 两个 runtime，`klip-8-source-bookcase-agent-request-pipeline.md` 已抽出共读请求协议，当前 PR 又把 EPUB 批注播放移到 `app-source-ebook-agent-playback.ts`。
- 剩余问题不再是单个播放函数，而是 Web/EPUB runtime 组件各自仍持有大量 UI、DOM、批注、选区、阅读进度和助手播放状态。
- `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx` 约 1300+ 行，`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx` 约 2200+ 行。两者不能简单合并，因为 Web DOM 与 Foliate/iframe 的定位、分页、selection 和 playback 差异是真实差异。
- 本 KLIP 只处理 runtime state boundary，不再重复处理已经完成的 request payload、mention planning 和 reader-ui 组件拆分。

## 现状

- Web runtime `WebSourceBookcase` 定义在 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:213`，组件开头持有 article/canvas/rail refs、annotations、highlight boxes、temporary boxes、connection、selection、composer、浮层开关、reader settings、status message 和 toc。
- Web 高亮盒计算位于 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:318` 起，同一 effect 同时处理 DOM text、toc extraction、anchor resolve、range boxes 和 performance logging。
- Web 批注写入与交互位于 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:556` 到 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:837`，包括 `saveAnnotations`、`applyAnnotations`、`createAnnotation`、`addComment`、问题状态更新和删除。
- Web 共读请求入口位于 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:1062`，目前已经复用 `app-source-agent-request.ts`，但 runtime 仍负责 status、virtual reading、stream annotation playback 和 readingMemory 保存。
- EPUB runtime `EbookBookcase` 定义在 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:285`，组件开头除 Web 类似状态外，还持有 Foliate view refs、measure host、ebook file、pageInfo、section page counts、pagination layout、readerState、box schedule、document listener cleanup 和 ebook virtual reading refs。
- EPUB box scheduler 位于 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:545` 和 `:989`，这是 Foliate runtime 的核心差异，不应强行搬进 Web 共享模块。

## 目标

- 让 Web/EPUB runtime 组件从“全状态容器”收敛为 runtime shell + hooks 组合。
- 抽出 Web 与 EPUB 都需要的批注集合写入 hook，统一 `saveAnnotations`、`applyAnnotations`、comment 更新、question status 和 delete 路径。
- 保留 Web DOM highlight 与 EPUB Foliate highlight 的 runtime-specific 实现，但将各自的 box scheduler 从组件主体中移出。
- 抽出 selection/composer/highlight choice 这组 UI 状态，避免创建批注、复制选区、关闭浮层逻辑散在两个 runtime 中。
- 保持 `ReaderAppView` props、`window.yomitomoDesktop.requestAgentAnnotationsStream` 和现有 article persistence 行为不变。

## 非目标

- 不合并 `WebSourceBookcase` 和 `EbookBookcase`。
- 不重写 Foliate 集成、iframe document listener、pagination 或 EPUB CFI 逻辑。
- 不改变 `app-source-agent-request.ts` 的请求协议边界。
- 不改变 `@yomitomo/reader-ui` 的 public API。
- 不在本 KLIP 中重做阅读器视觉或交互文案。

## 发现与方案

### P1（runtime 状态边界）

#### 1. 批注集合写入路径在 Web/EPUB 中仍重复

- 位置：
  - Web：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:556`
  - EPUB：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1308`
- 现象 / 风险：
  - 两个 runtime 都维护 `latestArticleRef`、`annotationsRef`、`setLocalAnnotations`，并通过 `articleWithAnnotations`、`sortAnnotations`、`onSaveArticle` 回写。
  - EPUB 还需要在保存后触发 `scheduleEbookBoxUpdate('annotations_saved')`，Web 则直接依赖 DOM effect 重算。
  - 如果未来新增 annotation 字段或 comment 状态，很容易只改其中一个 runtime。
- 建议方案：
  - 新增 `use-source-annotations.ts`，承接 annotation list、refs、`saveAnnotations`、`applyAnnotations` 和通用 mutation helpers。
  - hook 允许注入 `afterAnnotationsSaved` / `afterAnnotationsApplied` callback，EPUB 用来调 `scheduleEbookBoxUpdate`，Web 可以为空。
  - 保持 runtime-specific anchor creation 和 playback 调度在各自文件。
- 验收标准：
  - [ ] `saveAnnotations` / `applyAnnotations` 只在共享 hook 中实现一次。
  - [ ] Web/EPUB 创建批注、添加评论、删除批注、问题状态更新均继续通过现有测试。
  - [ ] EPUB 保存批注后仍触发 box update。

#### 2. Selection、composer、highlight choice 属于共享 UI 状态

- 位置：
  - Web：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:240` 到 `:243`
  - EPUB：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:318` 到 `:321`
  - Web 创建批注：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:655`
  - EPUB 创建批注：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1376`
- 现象 / 风险：
  - 两个 runtime 都有 `selectionAction`、`composer`、`highlightChoice`、`temporaryBoxes`，但打开/关闭、复制选区、创建用户批注的流程由各自实现。
  - anchor creation 必须保持 runtime-specific；但 UI 状态机和关闭规则可以共享。
- 建议方案：
  - 新增 `use-source-selection-composer.ts`，管理 `selectionAction`、`composer`、`highlightChoice`、`temporaryBoxes`、`openComposer`、`cancelComposer`、`closeHighlightChoice`。
  - hook 不创建 `TextAnchor`，只接受 runtime 已生成的 `SourceSelectionAction`。
- 验收标准：
  - [ ] Web/EPUB 不再各自手写 composer/highlight choice 关闭状态清理。
  - [ ] Web DOM selection 与 EPUB iframe selection 的 anchor 构造仍保留在 runtime 文件。
  - [ ] 复制选区和创建批注行为不变。

#### 3. Highlight box scheduler 应按 runtime 拆 hook，而不是跨 runtime 合并

- 位置：
  - Web：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:318`
  - EPUB：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:545`
  - EPUB schedule wrapper：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:989`
- 现象 / 风险：
  - Web 基于单一 article DOM、`resolveTextAnchor`、`rangeFromOffsets` 和 `ResizeObserver`。
  - EPUB 基于 Foliate iframe document、mapped rect、pagination layout、reader settings、pageInfo 和 deferred retry schedule。
  - 这两个 scheduler 的底层约束不同，强行抽一个通用 scheduler 会增加参数和条件分支。
- 建议方案：
  - 新增 `use-web-reader-boxes.ts`，只处理 Web DOM toc/box extraction/performance logging。
  - 新增 `use-ebook-reader-boxes.ts`，承接 EPUB box schedule state、doc listener cleanup 和 `scheduleEbookBoxUpdate`。
  - 两个 hook 可以共享小型 pure helper，但不共享主状态机。
- 验收标准：
  - [ ] Web hook 不 import Foliate utils。
  - [ ] EPUB hook 不依赖 Web DOM article body selector。
  - [ ] box update performance log 的 event 名称和 payload 字段保持兼容。

#### 4. EPUB virtual reading / dock 状态仍在大组件中

- 位置：
  - `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:405`
  - `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1231`
  - `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1251`
- 现象 / 风险：
  - Web 已使用 `@yomitomo/reader-ui` 的 `useAgentAnnotationQueue` / virtual reading 组合。
  - EPUB 因 Foliate anchor 和 iframe 约束保留了独立 virtual cursor/timer/dock 状态。
  - 当前状态散在 `EbookBookcase` 中，后续修改分页或播放路径容易误触 dock completion。
- 建议方案：
  - 新增 `use-ebook-agent-virtual-reading.ts`，承接 ebook virtual cursor map、timer map、step map、dock active ids 和 finish/cleanup。
  - `app-source-ebook-agent-playback.ts` 继续只处理单条 annotation playback；virtual reading hook 负责生命周期。
- 验收标准：
  - [ ] `EbookBookcase` 不直接持有 `ebookVirtualCursorRef`、`ebookVirtualReadingTimersRef`、`activeEbookDockAgentIdsRef`。
  - [ ] target anchor 没有生成批注时仍调用 `finishEbookVirtualReading(agent.id, '没有批注')`。
  - [ ] EPUB playback tests 覆盖 finish/cleanup 行为。

## 建议落地顺序

1. 先抽 `use-source-annotations.ts`，因为它是 Web/EPUB 最大的共享正确性边界。
2. 再抽 `use-source-selection-composer.ts`，降低创建批注和浮层关闭的重复 UI 状态。
3. 再分别抽 `use-web-reader-boxes.ts` 与 `use-ebook-reader-boxes.ts`，不要强行统一两个 scheduler。
4. 最后抽 `use-ebook-agent-virtual-reading.ts`，与当前 `app-source-ebook-agent-playback.ts` 接口对齐。

## 验收标准

- [ ] `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx` 控制在 900 行以内。
- [ ] `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx` 控制在 1500 行以内。
- [ ] Web/EPUB 的 annotation mutation 共享同一 hook，但 anchor creation 和 box scheduling 保持 runtime-specific。
- [ ] `pnpm --filter @yomitomo/desktop test -- app-source-bookcase app-source-ebook-agent-playback app-source-agent-request` 通过。
- [ ] `pnpm --filter @yomitomo/desktop typecheck` 通过。
- [ ] `pnpm --filter @yomitomo/desktop lint` 通过。
- [ ] `pnpm test`、`pnpm build` 在最终 PR 中通过。

## 关键参考位置

- `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx`
- `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx`
- `apps/desktop/src/renderer/src/app-source-bookcase-shared.ts`
- `apps/desktop/src/renderer/src/app-source-agent-request.ts`
- `apps/desktop/src/renderer/src/app-source-ebook-agent-playback.ts`
- `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts`
- `packages/reader-ui/src/use-agent-annotation-queue.ts`
