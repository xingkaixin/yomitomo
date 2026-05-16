---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
ClosedDate: 2026-05-16
Origin: 2026-05-16 code health review（EPUB runtime 下一步边界）
---

# klip-14-ebook-runtime-next-boundary

## 背景

- `klip-11-source-bookcase-runtime-state.md` 已完成 Web/EPUB runtime state 的第一轮拆分：annotation mutation、selection/composer、reader boxes、EPUB virtual reading 等已从 `EbookBookcase` 中移出。
- 当前 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx` 仍约 1429 行，是最大 source 文件。
- 继续拆分有价值，但风险也最高，因为该组件是 Foliate view、iframe selection、分页、box scheduler、阅读器 shell 和共读请求的交汇处。

## 目标

- 只拆 EPUB runtime 中真实稳定的边界，不抽通用 bookcase container。
- 降低 Foliate 生命周期、分页状态和 reader shell JSX 对彼此的耦合。
- 保持 Web/EPUB runtime 差异显式存在。

## 非目标

- 不合并 WebSourceBookcase 和 EbookBookcase。
- 不重写 Foliate 集成。
- 不改变 EPUB CFI / anchor 定位算法。
- 不改变共读请求协议和播放 adapter。

## 拆分价值判断

这里值得拆，但必须独立成一轮：

- EPUB runtime 的复杂度来自真实外部系统：Foliate custom element、iframe document、分页布局和 selection。
- 单体组件会让任何 EPUB UI 改动都必须理解 Foliate lifecycle。
- 但如果为了降行数抽一个“通用 runtime hook”，会把真实差异藏进 optional 参数和条件分支，价值为负。

所以本 KLIP 只建议拆 runtime-specific 边界。

## 建议方案

### 1. 抽 `use-ebook-foliate-view`

- 承接 Foliate view ref、book loading、relocate/page info、document listener cleanup。
- 保留与 Foliate API 直接交互的代码在这个 hook 内。

### 2. 抽 `use-ebook-selection`

- 承接 iframe selection 读取、anchor 创建、temporary boxes 生成。
- 输入 Foliate content/document adapter，不直接认识 article persistence。

### 3. 抽 `EbookReaderShell`

- 承接 `ReaderAppView` 需要的 props 拼装和 EPUB-only controls。
- 不持有 Foliate view mutation，只消费 hooks 输出。

### 4. 保持 request / playback adapter 原状

- `app-source-agent-request.ts` 和 `app-source-ebook-agent-playback.ts` 已经是合理边界。
- 下一步不应再把 Web queue 和 EPUB playback 统一。

## 实施记录

- 新增 `apps/desktop/src/renderer/src/use-ebook-foliate-view.ts`，承接 Foliate view ref、book loading、relocate/page info、分页测量和 Foliate cleanup 编排。
- 新增 `apps/desktop/src/renderer/src/use-ebook-selection.ts`，承接 iframe selection 读取、EPUB anchor 创建、temporary boxes 和 selection shortcut。
- 新增 `apps/desktop/src/renderer/src/app-source-ebook-reader-shell.tsx`，承接 `ReaderAppView` props 拼装和 EPUB-only controls。
- `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx` 收敛到约 1051 行；request / playback adapter 保持原状。

## 风险

- Foliate event listener 清理容易回归。
- selection anchor 依赖 iframe document，测试需要 mock。
- 页面切换和 box scheduler 的 timing 不能被 hook 边界破坏。

## 验收标准

- `app-source-bookcase-ebook.tsx` 不再直接持有 Foliate document listener cleanup 细节。
- selection handling 从组件主体移出，但 anchor creation 行为不变。
- `pnpm --filter @yomitomo/desktop test -- app-source-bookcase app-source-ebook-agent-playback` 通过。
- `pnpm --filter @yomitomo/desktop typecheck`、`lint`、`format:check` 通过。
