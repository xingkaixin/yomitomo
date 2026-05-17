---
Author: "Codex"
Updated: 2026-05-17
Status: Draft
Origin: 2026-05-17 complexity-optimizer codebase performance report
---

# klip-16-runtime-performance-hotspots

## 背景

- 本 KLIP 记录 2026-05-17 对 `yomitomo` workspace 的性能复杂度审计结果，作为后续持续优化的跟踪文档。
- 审计范围覆盖 `packages/**`、`apps/desktop/src/main/**` 和 `apps/desktop/src/renderer/src/**`；扫描器初次命中 `.temp`、agent skill 和测试文件，已在人工复核时降权。
- 当前主要性能风险不是单个 `find()` 或 `filter()`，而是高频路径里重复做全量工作：翻页保存触发全 store 读取、每条批注重复构建 DOM 文本索引、AI 批注锚定在已知范围内仍扫全文。
- 本文不立即修改代码，只把问题、优先级、验证方式和实施 task checklist 固化，避免后续优化时脱离已核实的代码事实。

## 现状结论（代码校准）

- EPUB 翻页进度在 `apps/desktop/src/renderer/src/use-ebook-foliate-view.ts:203` 的 `handleRelocate` 中触发，随后调用 `onSaveArticleReadingProgressRef.current`；主进程处理入口在 `apps/desktop/src/main/index.ts:163`，实际持久化在 `apps/desktop/src/main/store.ts:452`。
- `saveArticleReadingProgress` 只更新 `articles.readingProgress` 一列，但随后返回 `readStore()`，而 `readStoreRows` 在 `apps/desktop/src/main/store.ts:516` 到 `apps/desktop/src/main/store.ts:548` 会读取 providers、agents、articles、annotations、comments 并重建完整 `DesktopStore`。
- EPUB 高亮盒更新在 `apps/desktop/src/renderer/src/use-ebook-reader-boxes.ts:126` 到 `apps/desktop/src/renderer/src/use-ebook-reader-boxes.ts:270`；每条 `searchableAnnotations` 都调用 `rangeForEbookAnchorInDocument`。
- `rangeForEbookAnchorInDocument` 在 `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts:529`，内部 `ebookAnchorMatchInDocument` 每次都会在 `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts:560` 调用 `buildNormalizedDomTextIndex`，后者在 `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts:578` 到 `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts:610` 遍历当前 document body。
- AI 创建批注走 `packages/core/src/annotations.ts:165` 的 `createAgentAnnotation`，锚定匹配在 `packages/core/src/annotations.ts:225` 的 `findAgentAnnotationMatch`；范围限制参数由 `packages/ai/src/segment-annotation-context.ts:93` 到 `packages/ai/src/segment-annotation-context.ts:99` 提供。
- `findAgentAnnotationCandidate` 在 `packages/core/src/annotations.ts:272` 到 `packages/core/src/annotations.ts:317` 先对全文做 exact / whitespace-insensitive / whitespace-agnostic 搜索，再通过 `allowedAgentAnnotationMatches` 过滤允许范围。
- 阅读器高亮分段由 `packages/core/src/reader-dom.ts:273` 的 `buildHighlightSegments` 生成，分行逻辑在 `packages/core/src/reader-dom.ts:374` 的 `groupHighlightBoxesByLine`。
- 批注 rail 布局由 `packages/reader-ui/src/reader-utils.ts:349` 的 `buildAnnotationRailItems` 生成，当前分组在 `packages/reader-ui/src/reader-utils.ts:379` 到 `packages/reader-ui/src/reader-utils.ts:386` 通过扫描已有 groups 判断 overlap。
- 网页图片内联由 `packages/core/src/article-images.ts:13` 到 `packages/core/src/article-images.ts:23` 入口触发，`inlineHtmlImages` 在 `packages/core/src/article-images.ts:34` 到 `packages/core/src/article-images.ts:46` 串行等待每张图片。
- EPUB 导入在 `apps/desktop/src/main/ebook-import.ts:319` 的 `readEpubChapters` 中逐 spine 处理；章节 sanitize 后又在 `apps/desktop/src/main/ebook-import.ts:575` 的 `chapterParagraphs` 中重新创建 JSDOM 解析 sanitized HTML。

## 状态更新（2026-05-17）

- P0-1 已完成：reading progress IPC 已改为返回 `ArticleReadingProgressPatch`，主进程保存阅读进度后不再 `readStore()`，也不再广播完整 `store:updated`。
- P0-1 的 debounce/coalesce 未做：本次根因是全量 store 读取和完整 store apply；debounce 只降频，不是必要根因修复，保留为后续观察项。
- P0-2 已完成：EPUB 高亮盒更新改为通过 `createEbookAnchorResolver` 在单次 box update 内懒构建并复用 normalized DOM text index，避免按批注数重复遍历 iframe document body。
- 相关 EPUB 页内批注问题已修复：
  - Foliate paginator 会把 iframe 扩成整章多页宽度，当前页 box 裁剪已改为 Foliate 可视 viewport，避免后一页批注误进入当前页 rail。
  - 当前页右侧批注卡片点击已改为只选中可见批注，不再重复 `goToAnnotation`，避免 Foliate 重新定位造成页面跳动。
- 已验证：
  - `pnpm --filter @yomitomo/desktop test -- store app-article-store-actions use-ebook-foliate-view`
  - `pnpm --filter @yomitomo/desktop test -- app-ebook-reader-utils use-ebook-reader-boxes app-source-ebook-agent-playback`
  - `pnpm --filter @yomitomo/desktop test -- app-source-bookcase-ebook app-ebook-reader-utils use-ebook-reader-boxes`
  - `pnpm --filter @yomitomo/desktop typecheck`
  - `pnpm --filter @yomitomo/shared typecheck`
  - `pnpm --filter @yomitomo/desktop lint`
  - `pnpm --filter @yomitomo/shared lint`
  - `pnpm --filter @yomitomo/desktop format:check`
  - `pnpm --filter @yomitomo/shared format:check`
  - `git diff --check`

## 目标

- 明确 P0/P1/P2 性能问题的落地顺序，优先解决高频路径的全量重建。
- 每个优化任务都保留复杂度前后估计、风险和必须跑的测试。
- 保持现有 UI、IPC contract、SQLite schema、AI 输出语义和批注锚定语义不变。
- 给后续实现阶段提供 task checklist，便于逐项推进、复核和关闭。

## 非目标

- 不在本文中直接实施优化。
- 不为了降低静态扫描告警而改冷路径或小数组配置代码。
- 不引入全局状态库、repository abstraction、虚拟列表库或新的数据库层。
- 不改变 `window.yomitomoDesktop` preload API 的外部语义，除非后续 P0 任务明确需要新增轻量 patch 返回值。
- 不重写 Foliate 集成、EPUB anchor 语义或阅读器视觉。

## 发现与方案

### P0（高频路径全量重建）

#### 1. 翻页进度保存触发全量 store 读取

- 位置：
  - `apps/desktop/src/renderer/src/use-ebook-foliate-view.ts:203`
  - `apps/desktop/src/main/index.ts:163`
  - `apps/desktop/src/main/store.ts:452`
  - `apps/desktop/src/main/store.ts:516`
- 当前模式：
  - Foliate `relocate` 事件里更新本地 state、调度 box update，并立即保存 reading progress。
  - 主进程只更新一篇文章的进度，但返回完整 `DesktopStore`。
  - 渲染端 `saveArticleReadingProgress` 先做乐观更新，再 `applyStore(await desktop.saveArticleReadingProgress(...))`。
- 估算当前复杂度：
  - 单次翻页持久化约 `O(A + N + C)`，其中 `A` 是文章数、`N` 是批注数、`C` 是评论数。
  - 高频翻页时，复杂度会乘以 relocate 次数，并产生 IPC payload、SQLite read 和 React store 更新成本。
- 建议方案：
  - 主进程新增轻量进度保存路径：只返回 `{ articleId, readingProgress, updatedAt }` 或局部 article patch。
  - 渲染端保留当前乐观更新，收到 patch 后只更新目标 article。
  - 对 relocate 保存做 debounce 或 coalesce，避免连续页面切换每次落库。
- 估算优化后复杂度：
  - DB 写入仍是 `O(1)`。
  - 返回和前端合并为 `O(A)` 或进一步通过 article map 降到目标 article 局部更新；关键是移除主进程 `O(A + N + C)` 全量重建。
- 风险：
  - 中等。需要确认其他调用方是否依赖保存进度后拿到完整 store。
  - 需要保持 `store:updated` 广播语义，避免其他页面看不到进度变更。
- 验证：
  - `pnpm --filter @yomitomo/desktop test -- use-ebook-foliate-view`
  - `pnpm --filter @yomitomo/desktop test -- app-source-bookcase-ebook`
  - `pnpm --filter @yomitomo/desktop test -- app-reading-library-home`
  - 手动验证：快速翻页、关闭再打开电子书后进度恢复正确。
- 实施记录（2026-05-17）：
  - `article:reading-progress` 已改为返回 `ArticleReadingProgressPatch`，不再返回完整 `DesktopStore`。
  - 主进程保存阅读进度后不再调用 `readStore()`，也不再发送完整 `store:updated` 广播。
  - 渲染端继续乐观更新，但 IPC 返回后只合并目标 article 的 progress patch。

#### 2. EPUB 高亮盒更新对每条批注重复构建 DOM 文本索引

- 状态：已完成（2026-05-17）。
- 位置：
  - `apps/desktop/src/renderer/src/use-ebook-reader-boxes.ts:246`
  - `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts:529`
  - `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts:551`
  - `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts:578`
- 当前模式：
  - 每次 box update 已有 `inputFingerprint` 避免相同输入重复计算。
  - 但在一次真实更新内，每个 annotation 都调用 `rangeForEbookAnchorInDocument`。
  - 每次 lookup 都重新遍历 document body，生成 normalized text 和 positions。
- 估算当前复杂度：
  - `O(N * T)`，其中 `N` 是当前章节可搜索批注数，`T` 是当前 Foliate document 文本长度。
- 建议方案：
  - 在一次 update 内构建一次 normalized DOM text index。
  - 将 index 传入每个 anchor lookup，或新增 `createEbookAnchorResolver(doc, timing)`。
  - index 生命周期与当前 `inputFingerprint` 对齐，document/page/layout 变更时失效。
- 估算优化后复杂度：
  - `O(T + N * M)`，其中 `M` 是查询匹配成本；至少移除 `N` 次 DOM tree walk。
- 风险：
  - 中等。`positions` 中 virtual whitespace 的 offset 映射必须保持一致。
  - 不能跨 iframe document 或页面切换复用过期 index。
- 验证：
  - `pnpm --filter @yomitomo/desktop test -- use-ebook-reader-boxes`
  - `pnpm --filter @yomitomo/desktop test -- app-source-ebook-agent-playback`
  - 增加多批注长章节用例，断言 `domTextIndexBuildCount` 从多次降为一次。
- 实施记录（2026-05-17）：
  - 新增 `createEbookAnchorResolver(doc, timing)`，把 DOM 文本索引绑定到当前 document resolver，并保持 `rangeForEbookAnchorInDocument` 兼容旧调用方。
  - `useEbookReaderBoxes` 在一次真实 update 内创建一个 resolver，所有 `searchableAnnotations` 共享同一个 normalized DOM text index。
  - `use-ebook-reader-boxes` 测试新增多批注用例，断言 `anchorLookupCount: 2` 时 `domTextIndexBuildCount: 1`。

### P1（批注/阅读器核心算法）

#### 3. AI 批注锚定在已知允许范围内仍先扫全文

- 位置：
  - `packages/core/src/annotations.ts:225`
  - `packages/core/src/annotations.ts:272`
  - `packages/core/src/annotations.ts:353`
  - `packages/ai/src/segment-annotation-context.ts:93`
- 当前模式：
  - segment annotation 已经提供 `allowedTextStart`、`allowedTextEnd`、`allowedSegmentIds`、`allowedParagraphIds`。
  - `findAgentAnnotationCandidate` 仍先对完整 `articleText` 搜索，再过滤 match 是否落在允许范围内。
- 估算当前复杂度：
  - `O(S * K * T)`，其中 `S` 是 AI 输出建议数，`K` 是从 exact 拆出的候选片段数，`T` 是全文长度。
- 建议方案：
  - 当 `allowedTextStart/allowedTextEnd` 存在时，优先只在切片文本内搜索，再把结果 offset 映射回全文。
  - whitespace-insensitive / whitespace-agnostic 的 normalized map 也只基于切片构建。
  - 如果无允许范围，保留当前全文 fallback。
- 估算优化后复杂度：
  - `O(S * K * R)`，其中 `R` 是允许范围文本长度。segment 任务中通常 `R << T`。
- 风险：
  - 中等。重复文本匹配、prefix/suffix 打分和全局 offset 必须保持语义。
  - 若 allowed range 与 paragraph/segment 过滤同时存在，不能错误放宽范围。
- 验证：
  - `pnpm --filter @yomitomo/core test -- annotations`
  - 增加 allowed range + whitespace normalized + 重复 exact 的测试。
  - `pnpm --filter @yomitomo/ai test -- segment-annotation-context segment-annotation-runner`

#### 4. 高亮分段在重叠批注多时可能退化为二次扫描

- 位置：
  - `packages/core/src/reader-dom.ts:273`
  - `packages/core/src/reader-dom.ts:288`
  - `packages/core/src/reader-dom.ts:374`
- 当前模式：
  - `groupHighlightBoxesByLine` 对每个 box 用 `groups.find` 查已有行，并在 predicate 中对 group 做 `reduce`。
  - `buildHighlightSegments` 对每条 line 的每个 edge 用 `line.filter` 找 contributors。
- 估算当前复杂度：
  - 分行最坏接近 `O(B^2)`。
  - 分段在重叠密集时也接近 `O(E * B)`，`E` 是 line edge 数。
- 建议方案：
  - 分行阶段利用按 `top/left` 排序后的顺序，只与最后几个候选 line 比较，或维护 line 平均值。
  - 分段阶段改为 sweep-line：按 left/right edge 更新 active boxes，生成连续 segment。
- 估算优化后复杂度：
  - `O(B log B)` 或接近 `O(B)`，取决于实现是否需要排序。
- 风险：
  - 中等偏高。高亮视觉、颜色顺序、annotationIds 合并规则都可见。
- 验证：
  - `pnpm --filter @yomitomo/core test -- reader-dom`
  - 增加多行、多 contributor、完全重叠、部分重叠的 snapshot 或结构断言。

#### 5. 批注 rail 分组按已有 groups 反复扫描

- 位置：
  - `packages/reader-ui/src/reader-utils.ts:349`
  - `packages/reader-ui/src/reader-utils.ts:379`
  - `packages/reader-ui/src/use-reader-annotation-rail.ts:93`
- 当前模式：
  - `buildAnnotationRailItems` 先构建 `boxesByAnnotation`，这部分是合理的。
  - 后续每个 positioned item 通过 `groups.find(...items.some(...))` 找 overlap group。
  - `useReaderAnnotationRail` 会在 `boxes`、`activeId`、`noteHeights`、`railAnnotations` 变化时重新计算。
- 估算当前复杂度：
  - 最坏 `O(N^2)`，`N` 是 rail 里参与布局的批注数。
- 建议方案：
  - 按 `anchor.start` 排序后维护当前 active overlap group。
  - 如果业务需要非传递 overlap 分组，显式写出规则并加测试。
- 估算优化后复杂度：
  - `O(N log N)`；若输入已按 anchor 排序，可接近 `O(N)`。
- 风险：
  - 中等。stack 顺序、active note 置顶、退出动画必须保持。
- 验证：
  - `pnpm --filter @yomitomo/reader-ui test -- reader-utils use-reader-annotation-rail`
  - `pnpm --filter @yomitomo/desktop test -- app-reading-library`

### P2（导入与常数因子优化）

#### 6. 网页和 EPUB 图片内联串行等待

- 位置：
  - `packages/core/src/article-images.ts:34`
  - `packages/core/src/article-images.ts:51`
  - `apps/desktop/src/main/ebook-import.ts:473`
- 当前模式：
  - 网页导入时，content images 逐张 `await inliner.inlineUrl(sourceUrl)`。
  - EPUB 导入时，每章 HTML image 和 SVG image 也逐张读取 zip/base64。
- 估算当前复杂度：
  - 算法是 `O(I)`，但 wall time 接近串行请求或串行 base64 转换总和。
- 建议方案：
  - 使用小并发池，例如 4。
  - 保留现有 `MAX_INLINE_IMAGES`、`MAX_INLINE_IMAGE_DATA_CHARS` 和 cache 约束。
  - EPUB 的 `mediaTypeByPath` 可提升到章节循环外，避免每章重建。
- 估算优化后复杂度：
  - 算法仍是 `O(I)`，但 wall time 约降为 `ceil(I / concurrency)` 个批次。
- 风险：
  - 低到中。网页图片并发可能触发站点限流，默认并发不应过高。
- 验证：
  - `pnpm --filter @yomitomo/core test -- article-images`
  - `pnpm --filter @yomitomo/desktop test -- ebook-import`

#### 7. EPUB 章节 sanitize 后二次 JSDOM 解析

- 位置：
  - `apps/desktop/src/main/ebook-import.ts:369`
  - `apps/desktop/src/main/ebook-import.ts:376`
  - `apps/desktop/src/main/ebook-import.ts:575`
- 当前模式：
  - 章节源 HTML 已经通过 JSDOM 解析。
  - `sanitizeArticleContentHtml` 返回 sanitized HTML string。
  - `chapterParagraphs(html)` 再新建 JSDOM 提取段落。
- 估算当前复杂度：
  - 每章多一次 `O(chapterHtml)` DOM parse。
- 建议方案：
  - 让 sanitize/normalize 阶段提供可复用 container，或新增同 document 内的 sanitized paragraph extraction。
  - 保持 `chaptersToArticleHtml` 的最终 HTML 输出不变。
- 估算优化后复杂度：
  - 移除每章一次额外 parse，仍是 `O(totalHtml)`，但常数下降。
- 风险：
  - 中等。DOMPurify 后的结构和当前 paragraph 提取结果必须一致。
- 验证：
  - `pnpm --filter @yomitomo/desktop test -- ebook-import`
  - 用含嵌套 block、table、blockquote 的 EPUB fixture 回归。

#### 8. 保存文章时逐条写入 annotations/comments

- 位置：
  - `apps/desktop/src/main/store.ts:570`
  - `apps/desktop/src/main/store.ts:620`
  - `apps/desktop/src/main/store.ts:632`
  - `apps/desktop/src/main/store.ts:663`
- 当前模式：
  - 保存 article 时先 delete 该 article 的 annotations，再逐条 insert annotation 和 comments。
  - 已在 transaction 内，正确性边界较清晰。
- 估算当前复杂度：
  - `O(N + C)`，但 SQLite statement 次数也是 `N + C`。
- 建议方案：
  - 在 transaction 内批量 `.values([...])` 插入 annotations 和 comments。
  - 小数据路径保持简单，只有在 row 数大于 0 时批量插入。
- 估算优化后复杂度：
  - 算法仍 `O(N + C)`，statement 数从 `N + C` 降为常数级。
- 风险：
  - 低到中。需要保持 cascade delete、row shape 和 JSON 字段序列化不变。
- 验证：
  - `pnpm --filter @yomitomo/desktop test -- store`
  - 增加一篇文章多批注、多评论保存回读测试。

## Task Checklist

### Phase 0: 基线与测量

- [ ] 在现有 performance logs 中确认 `reader_highlight_boxes`、`epub_import.*`、`agent_annotation_match` 的实际耗时分布。
- [ ] 增加或记录一个长 EPUB、多批注、多评论的本地 fixture，用于优化前后对比。
- [ ] 为 P0 翻页进度路径记录一次快速翻页的 IPC 调用次数和主进程 `readStoreRows` 耗时。

### Phase 1: P0 高频路径

- [x] 设计并实现 reading progress 轻量保存返回值，避免每次翻页返回完整 `DesktopStore`。
- [ ] 为 reading progress 保存增加 debounce/coalesce，确保最后进度不会丢失。
- [x] 修复 Foliate 多页 iframe 裁剪边界，避免当前页误显示后一页批注。
- [x] 修复当前页 EPUB 批注卡片点击重复导航导致的页面跳动。
- [x] 将 EPUB DOM text index 改为单次 box update 内复用。
- [x] 为 EPUB 高亮盒路径增加 `domTextIndexBuildCount` 回归断言。
- [x] 跑完 reading progress 与 EPUB 页内批注相关测试并记录结果。

### Phase 2: P1 核心算法

- [ ] 将 AI 批注锚定的 allowed range 搜索改为先切片再映射全局 offset。
- [ ] 为 `createAgentAnnotation` 增加 allowed range + 重复 exact + whitespace normalized 测试。
- [ ] 评估并优化 `buildHighlightSegments` 的分行与 contributors 计算。
- [ ] 为高亮 segment 增加多重叠结构测试。
- [ ] 评估并优化 `buildAnnotationRailItems` 的 overlap grouping。
- [ ] 为 rail layout 增加 active stack、退出动画、overlap group 顺序回归测试。

### Phase 3: P2 导入与持久化常数优化

- [ ] 为网页图片内联实现小并发池，并保持数量与总 data chars 限制。
- [ ] 为 EPUB 图片内联复用 manifest media type index，并评估是否并发处理章节内图片。
- [ ] 移除 EPUB 章节 paragraph 提取的二次 JSDOM parse，或记录为什么暂不处理。
- [ ] 将 `writeArticleRows` 的 annotations/comments 写入改为批量 insert。
- [ ] 增加多批注、多评论 article 保存回读测试。

### Phase 4: 收尾验证

- [ ] `pnpm --filter @yomitomo/desktop test` 通过。
- [ ] `pnpm --filter @yomitomo/core test` 通过。
- [ ] `pnpm --filter @yomitomo/reader-ui test` 通过。
- [ ] `pnpm --filter @yomitomo/ai test` 通过。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm lint` 通过。
- [ ] `pnpm build` 通过。
- [ ] 在本文更新每个已完成 task 的状态、变更文件和残余风险。

## 建议落地顺序

1. 先做 reading progress 轻量保存，因为它是高频交互路径，且不需要改变阅读器视觉或锚定算法。
2. 再做 EPUB DOM text index 复用，因为现有代码已经有 `inputFingerprint` 和 timing metrics，验证路径明确。
3. 再做 AI 批注 allowed range 搜索，优先覆盖 segment annotation，因为这里范围最明确，收益和正确性边界都更清楚。
4. 再处理高亮 segment 与 rail layout，先加测试再改算法。
5. 最后处理图片内联、EPUB 二次 parse、批量 insert 这类常数因子优化。

## 测试矩阵

| 场景 | 测试类型 | 覆盖要求 |
|---|---|---|
| EPUB 快速翻页保存进度 | unit + manual | 进度不丢失，不触发完整 store 回读，关闭重开能恢复 |
| EPUB 多批注高亮盒 | unit | 同一次 update 只构建一次 DOM text index，boxes 输出不变 |
| AI segment annotation 锚定 | unit | allowed range 内重复 exact 能选中正确全局 offset |
| whitespace-normalized 锚定 | unit | 空白差异仍可匹配，prefix/suffix 打分不回归 |
| 高亮 segment overlap | unit | annotationIds、colors、segment 合并结果稳定 |
| 批注 rail overlap layout | unit / component | stack 顺序、active front、note height 处理不变 |
| 网页图片内联 | unit | cache、数量上限、data chars 上限、picture source 清理不变 |
| EPUB 导入 | unit | 章节数、段落数、cover、contentHtml、index 输出不变 |
| SQLite article 保存 | unit | 多批注、多评论保存后回读结构不变 |

## 验收标准

- [x] 快速翻页不会因为 reading progress 保存触发完整 `DesktopStore` 重建。
- [x] P0 两项完成后，EPUB 高亮盒更新中同一 document 的 normalized DOM text index 不再按批注数重复构建。
- [ ] P1 完成后，segment annotation 的锚定搜索复杂度与 segment 范围长度相关，而不是与全书长度相关。
- [ ] P1 完成后，高亮 segment 和 annotation rail 的多重叠测试覆盖当前视觉语义。
- [ ] P2 完成后，图片内联和 EPUB 导入测试仍证明输出结构不变。
- [ ] 所有完成项都在本文 task checklist 中更新状态，并记录对应 PR 或 commit。

## 关键参考位置

- `apps/desktop/src/renderer/src/use-ebook-foliate-view.ts`
- `apps/desktop/src/renderer/src/use-ebook-reader-boxes.ts`
- `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts`
- `apps/desktop/src/main/store.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/ebook-import.ts`
- `packages/core/src/annotations.ts`
- `packages/core/src/reader-dom.ts`
- `packages/core/src/article-images.ts`
- `packages/reader-ui/src/reader-utils.ts`
- `packages/reader-ui/src/use-reader-annotation-rail.ts`
- `packages/ai/src/segment-annotation-context.ts`
