---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
Origin: 2026-05-16 codebase review（SourceBookcase runtime 状态拆分）
---

# klip-11-source-bookcase-runtime-state

## 背景

- `klip-2-source-bookcase-split.md` 已把原始阅读器拆成 Web/EPUB 两个 runtime，`klip-8-source-bookcase-agent-request-pipeline.md` 已抽出共读请求协议，当前 PR 又把 EPUB 批注播放移到 `app-source-ebook-agent-playback.ts`。
- 剩余问题不再是单个播放函数，而是 Web/EPUB runtime 组件各自仍持有大量批注集合、选区浮层、DOM box、阅读进度和助手播放状态。
- `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx` 约 1300+ 行，`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx` 约 2200+ 行。两者不能简单合并，因为 Web DOM 与 Foliate/iframe 的定位、分页、selection 和 playback 差异是真实差异。
- 本 KLIP 只处理 runtime state boundary，不再重复处理已经完成的 request payload、mention planning 和 reader-ui 组件拆分。

## 现状结论（代码校准）

- Web runtime `WebSourceBookcase` 定义在 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:213`，组件开头持有 article/canvas/rail refs、annotations、highlight boxes、temporary boxes、connection、selection、composer、浮层开关、reader settings、status message 和 toc。
- EPUB runtime `EbookBookcase` 定义在 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:285`，组件开头除 Web 类似状态外，还持有 Foliate view refs、measure host、ebook file、pageInfo、section page counts、pagination layout、readerState、box schedule、document listener cleanup 和 ebook virtual reading refs。
- Web/EPUB 的 `saveAnnotations` / `applyAnnotations` 形状接近，分别位于 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:556`、`:567` 和 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1308`、`:1332`。差异只在 EPUB 保存前后要比较 `ebookHighlightAnnotationsSignature` 并按需 `scheduleEbookBoxUpdate`。
- Web/EPUB 的 selection/composer 状态同构，分别位于 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:239` 到 `:243` 和 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:317` 到 `:321`。差异在选区 anchor 与 temporary box 的生成方式：Web 用宿主 DOM Range，EPUB 用 Foliate iframe document。
- Web 高亮盒计算位于 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:318` 起，依赖 `articleRef.current.textContent`、`resolveTextAnchor`、`rangeFromOffsets` 和 `ResizeObserver`。
- EPUB 高亮盒计算位于 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:545` 起，依赖 `currentFoliateContent(viewRef.current)?.doc`、section/pageInfo、chapter filter、pagination layout、reader settings 和 `rangeForEbookAnchorInDocument`；调度入口 `scheduleEbookBoxUpdate` 位于 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:989`。
- EPUB virtual reading 生命周期位于 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1139` 到 `:1305`，而单条播放已拆到 `apps/desktop/src/renderer/src/app-source-ebook-agent-playback.ts:34`。因此下一步应抽生命周期 hook，而不是把播放函数再塞回组件。

## 最终建议

- KLIP-11 的拆分方向合理，但边界必须比“通用 bookcase 容器”更窄。
- 可以共享的是业务状态 mutation 与无运行时依赖的 UI 状态机：annotation collection、selection action、composer、highlight choice、temporary boxes 的清理规则。
- 不应共享的是渲染定位状态机：Web DOM boxes、EPUB Foliate boxes、EPUB pagination/document listener、EPUB virtual reading。它们最多分别拆成 runtime-specific hook。
- 不建议新增 `useSourceBookcase` 这类总控 hook。它会把 Web/EPUB 的真实差异重新集中到一个参数巨大的抽象里，抵消 `klip-2` 的 runtime split。

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
  - EPUB 还需要在保存前后比较 `ebookHighlightAnnotationsSignature`，只有高亮输入变化时才触发 `scheduleEbookBoxUpdate('annotations_saved')` 或 `scheduleEbookBoxUpdate('annotations_applied')`；Web 则直接依赖 DOM effect 重算。
  - 如果未来新增 annotation 字段或 comment 状态，很容易只改其中一个 runtime。
- 建议方案：
  - 新增 `use-source-annotations.ts`，承接 annotation list、refs、`saveAnnotations`、`applyAnnotations` 和通用 mutation helpers。
  - hook 允许注入 `onAnnotationsSaved` / `onAnnotationsApplied` callback，EPUB 用 callback 比较 highlight signature 并调度 box update，Web 可以为空。
  - `ignoreStaleArticleUpdates` 作为 EPUB-only 配置保留，因为 EPUB 当前会用 `timestampValue` 阻止较旧 article props 覆盖本地流式更新。
  - 保持 runtime-specific anchor creation 和 playback 调度在各自文件。
- 验收标准：
  - [x] `saveAnnotations` / `applyAnnotations` 只在共享 hook 中实现一次。
  - [x] Web/EPUB 创建批注、添加评论、删除批注、问题状态更新均继续通过现有测试。
  - [x] EPUB 保存批注后仅在 highlight signature 变化时触发 box update。
  - [x] EPUB 不会被旧 `article.updatedAt` props 覆盖流式追加后的本地批注。

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
  - hook 不创建 `TextAnchor`，只接受 runtime 已生成的 `SourceSelectionAction` 与 `HighlightBox[]`。
  - `handleArticleMouseUp` 和 `handleFoliateSelectionRef.current` 留在 runtime 文件，因为它们分别依赖宿主 DOM selection 与 Foliate iframe selection。
  - `openAnnotation`、article 切换和 pointer down 只调用 hook 的 clear action，不在 hook 内感知 reader settings、agent panel 或 selected annotation。
- 验收标准：
  - [x] Web/EPUB 不再各自手写 composer/highlight choice 关闭状态清理。
  - [x] Web DOM selection 与 EPUB iframe selection 的 anchor 构造仍保留在 runtime 文件。
  - [x] 复制选区和创建批注行为不变。
  - [x] EPUB iframe pointer down 仍关闭 settings / agent annotate panel，并保留 `onOpenAnnotation(null)` 行为。

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
  - 新增 `use-ebook-reader-boxes.ts`，承接 EPUB box schedule state、`updateEbookBoxes`、doc listener cleanup 和 `scheduleEbookBoxUpdate`。
  - active annotation connection 可在第二步再抽 `use-reader-annotation-connection.ts`；不要为了迁就 connection 一次性做 generic box scheduler。
  - 两个 hook 可以共享小型 pure helper，但不共享主状态机。
- 验收标准：
  - [x] Web hook 不 import Foliate utils。
  - [x] EPUB hook 不依赖 Web DOM article body selector。
  - [x] box update performance log 的 event 名称和 payload 字段保持兼容。
  - [x] EPUB 连续 relocate / annotations_saved / page change 仍合并到单个 animation frame，并保留 schedule count 日志。

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
  - hook 对外提供 `startVirtualReading`、`finishVirtualReading`、`stopVirtualReadingTimer`、`updateVirtualCursor`、`enqueuePlayback` 所需的最小 adapter。
  - `app-source-ebook-agent-playback.ts` 继续只处理单条 annotation playback；virtual reading hook 负责生命周期，`EbookBookcase` 负责请求流和文章持久化。
- 验收标准：
  - [x] `EbookBookcase` 不直接持有 `ebookVirtualCursorRef`、`ebookVirtualReadingTimersRef`、`activeEbookDockAgentIdsRef`。
  - [x] target anchor 没有生成批注时仍调用 `finishEbookVirtualReading(agent.id, '没有批注')`。
  - [x] EPUB playback tests 覆盖 finish 行为，virtual reading hook 保留 cleanup adapter。
  - [x] `cleanupEbookAgentTheater` 等价清理 timer、cursor、dock、theater boxes。

### P2（不建议合并的边界）

#### 5. 不抽通用 bookcase container hook

- 位置：
  - Web：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:213`
  - EPUB：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:285`
- 现象 / 风险：
  - 两个 runtime 的 props 入口相似，但核心副作用来源不同：Web 是 article DOM 与 scroll surface，EPUB 是 Foliate view、iframe document、pagination 和 file lifecycle。
  - 抽一个通用容器会把 `articleRef`、`viewRef`、`pageInfo`、`readerState`、box schedule、virtual reading adapter 都变成可选参数或条件分支。
- 建议方案：
  - 维持 `WebSourceBookcase` / `EbookBookcase` 两个 shell。
  - 只抽“一个事实只有一个 owner”的局部 hook，避免抽“看起来相似但依赖不同”的总控 hook。
- 验收标准：
  - [x] 没有新增同时 import Web DOM box helper 与 Foliate helper 的模块。
  - [x] 没有新增接受大量 optional runtime adapter 的 `useSourceBookcase*` hook。

## 建议落地顺序

1. 先抽 `use-source-annotations.ts`，因为它是 Web/EPUB 最大的共享正确性边界。
2. 再抽 `use-source-selection-composer.ts`，降低创建批注和浮层关闭的重复 UI 状态。
3. 再分别抽 `use-web-reader-boxes.ts` 与 `use-ebook-reader-boxes.ts`，不要强行统一两个 scheduler。
4. 最后抽 `use-ebook-agent-virtual-reading.ts`，与当前 `app-source-ebook-agent-playback.ts` 接口对齐。

## 测试矩阵

| 场景 | 测试类型 | 覆盖要求 |
|---|---|---|
| `use-source-annotations` 保存、apply、删除、问题状态更新 | unit / hook test | Web/EPUB 共享 mutation 后排序、`updatedAt`、`onSaveArticle` 和 open annotation 行为不变 |
| EPUB highlight signature callback | unit / integration test | annotation 颜色、anchor、contributor 变化触发 box update；纯 comment delta 不触发不必要重算 |
| `use-source-selection-composer` | hook test | open composer 限制 x 坐标、copy 后清理 selection、cancel 后清理 temporary boxes |
| Web boxes hook | jsdom component test | article DOM 更新后生成 toc、boxes、performance payload，ResizeObserver cleanup 生效 |
| EPUB boxes hook | mocked Foliate test | schedule coalescing、same input skip、chapter filter、doc listener cleanup 均保持 |
| EPUB virtual reading hook | hook test | start/tick/finish/cleanup 清理 timer、cursor、dock 状态 |
| EPUB playback adapter | existing unit test extension | missing range、offscreen、visible theater path 均调用新的 virtual reading adapter |

## 验收标准

- [x] `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx` 控制在 900 行以内。
- [x] `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx` 控制在 1500 行以内。
- [x] Web/EPUB 的 annotation mutation 共享同一 hook，但 anchor creation 和 box scheduling 保持 runtime-specific。
- [x] 没有新增通用 `SourceBookcase` runtime container hook。
- [x] `pnpm --filter @yomitomo/desktop test -- app-source-bookcase app-source-ebook-agent-playback app-source-agent-request` 通过。
- [x] `pnpm --filter @yomitomo/desktop typecheck` 通过。
- [x] `pnpm --filter @yomitomo/desktop lint` 通过。
- [x] `pnpm test`、`pnpm build` 在最终 PR 中通过。

## 实施结果

- `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx` 已降至 896 行，`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx` 已降至 1428 行。
- 新增 `use-source-annotations.ts`、`use-source-selection-composer.ts`、`use-web-reader-boxes.ts`、`use-ebook-reader-boxes.ts`、`use-ebook-agent-virtual-reading.ts` 和 `use-source-active-connection.ts`。
- Web/EPUB 共用 annotation mutation 与 comment stream helper；Web DOM box、EPUB Foliate box、EPUB virtual reading 仍保持 runtime-specific。
- 新增 `apps/desktop/src/renderer/src/__tests__/use-source-annotations.test.tsx` 覆盖保存/apply、评论、问题状态、删除和 EPUB stale article guard。
- 验证通过：target desktop tests、desktop `typecheck`、desktop `lint`、desktop `format:check`、workspace `pnpm test`、workspace `pnpm build`。

## 关键参考位置

- `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx`
- `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx`
- `apps/desktop/src/renderer/src/app-source-bookcase-shared.ts`
- `apps/desktop/src/renderer/src/app-source-agent-request.ts`
- `apps/desktop/src/renderer/src/app-source-ebook-agent-playback.ts`
- `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts`
- `packages/reader-ui/src/use-agent-annotation-queue.ts`
