---
Author: "Codex"
Updated: 2026-05-16
Status: Draft
---

# klip-2-source-bookcase-split

## 背景

- 2026-05-16 代码审查已把 `apps/desktop/src/renderer/src/app-reading-library.tsx` 从阅读库单体中拆出 `SourceBookcase`，但新的 `apps/desktop/src/renderer/src/app-source-bookcase.tsx` 仍有约 3900 行。
- `SourceBookcase` 当前同时承载 Web 原文阅读、EPUB/Foliate 阅读、批注状态、助手批注触发、选区浮层、右侧批注栏联动、性能记录等职责。
- EPUB 相关的 DOM 定位和 Foliate 工具已先拆到 `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts`，说明继续拆分有明确边界。
- 本 KLIP 只记录后续拆分方案，不直接改变现有行为。

## 现状

- 入口组件 `SourceBookcase` 在 `apps/desktop/src/renderer/src/app-source-bookcase.tsx:580`，只负责空态和 Web/EPUB 分流。
- Web 阅读器主体 `WebSourceBookcase` 在 `apps/desktop/src/renderer/src/app-source-bookcase.tsx:596`，覆盖普通网页正文渲染、DOM Range 高亮、选区批注、助手批注和右侧批注栏。
- EPUB 阅读器主体 `EbookBookcase` 在 `apps/desktop/src/renderer/src/app-source-bookcase.tsx:1773`，覆盖 Foliate view 生命周期、分页进度、iframe 选区、高亮映射、批注定位和助手批注。
- EPUB/Foliate 纯工具已在 `apps/desktop/src/renderer/src/app-ebook-reader-utils.ts:1`，但 `EbookBookcase` 仍直接持有大量 UI 状态与异步流程。
- Web/EPUB 共用的小工具仍留在文件尾部，例如 `publicAnnotationAgents`、`targetAnchorReadingPlan`、`agentInstructionFromNote`、`sourceArticleBodyHtml`，位置在 `apps/desktop/src/renderer/src/app-source-bookcase.tsx:3806` 到 `apps/desktop/src/renderer/src/app-source-bookcase.tsx:3908`。

## 目标

- 把 Web 阅读器、EPUB 阅读器和共用阅读器辅助逻辑拆成独立文件。
- 保持 `SourceBookcase` 对外 props 和 `app-reading-library.tsx` 调用方式不变。
- 降低后续修复 EPUB 定位、Web 高亮、助手批注时的单文件冲突面。
- 为 Web 与 EPUB 分别补最小测试入口，覆盖关键纯逻辑和组件 smoke path。

## 非目标

- 不改变 ReaderAppView 的公共 API。
- 不重写 Foliate 集成。
- 不改变批注存储、AI 调用协议或 TextAnchor 算法。
- 不引入新的状态管理库。

## 发现与方案

### P1（模块边界）

#### 1. WebSourceBookcase 和 EbookBookcase 仍共享同一个实现文件

- 位置：
  - `apps/desktop/src/renderer/src/app-source-bookcase.tsx:596`
  - `apps/desktop/src/renderer/src/app-source-bookcase.tsx:1773`
- 现象 / 风险：
  - Web 与 EPUB 是两个渲染运行时：Web 使用宿主 DOM，EPUB 使用 Foliate iframe 和分页 API。
  - 两者在同一文件中维护，会让任何 EPUB 定位修复都需要加载完整 Web 阅读器上下文。
  - 文件级认知负担仍然偏高，后续 review 很难判断改动是否跨运行时泄漏。
- 建议方案：
  - 新增 `app-source-bookcase-web.tsx`，移动 `WebSourceBookcase` 及 Web-only helpers。
  - 新增 `app-source-bookcase-ebook.tsx`，移动 `EbookBookcase` 及 EPUB-only UI helpers。
  - 保留 `app-source-bookcase.tsx` 为薄入口，只导出 `SourceBookcase` 与 `isEbookArticle`。
- 验收标准：
  - [ ] `app-source-bookcase.tsx` 控制在 150 行以内。
  - [ ] Web-only 文件不 import `app-ebook-reader-utils.ts`。
  - [ ] EPUB-only 文件不持有 Web 正文 HTML sanitizer。

#### 2. 共用阅读器辅助逻辑仍散落在组件文件尾部

- 位置：
  - `apps/desktop/src/renderer/src/app-source-bookcase.tsx:3806`
  - `apps/desktop/src/renderer/src/app-source-bookcase.tsx:3837`
  - `apps/desktop/src/renderer/src/app-source-bookcase.tsx:3853`
- 现象 / 风险：
  - `publicAnnotationAgents`、`targetAnchorReadingPlan`、`agentInstructionFromNote` 同时被 Web/EPUB 批注流程使用。
  - 这些逻辑是纯函数，不依赖 React 生命周期，留在组件文件会继续放大组件文件体积。
- 建议方案：
  - 新增 `app-source-bookcase-utils.ts`，移动共用纯函数。
  - 对 `agentInstructionFromNote` 和 `targetAnchorReadingPlan` 加单元测试，防止拆分后 @ 提及清理和选区 readingPlan 退化。
- 验收标准：
  - [ ] 共用纯函数从组件文件移出。
  - [ ] `agentInstructionFromNote("@lin 解释这里", [lin])` 类场景有测试覆盖。
  - [ ] `targetAnchorReadingPlan(undefined, ...)` 返回空数组的边界有测试覆盖。

### P2（测试与回归面）

#### 3. Web/EPUB 阅读器缺少拆分后的 smoke test

- 位置：
  - `apps/desktop/src/renderer/src/__tests__/app-reading-library.test.ts`
  - `apps/desktop/src/renderer/src/__tests__/app-reading-library-home.test.tsx`
- 现象 / 风险：
  - 现有测试主要覆盖阅读库列表和 reader utility，拆分 SourceBookcase 后缺少直接验证入口。
  - 组件拆分本身不应改行为，但没有 smoke test 会让文件移动回归依赖全量手测。
- 建议方案：
  - 新增 `app-source-bookcase.test.tsx`，至少覆盖空态、Web article 进入 WebSourceBookcase、ebook article 进入 EbookBookcase 的分流。
  - EPUB smoke test 可以 mock Foliate view，不在本 KLIP 中要求真实 EPUB 渲染。
- 验收标准：
  - [ ] `SourceBookcase` 空态可渲染。
  - [ ] Web article 不加载 EPUB utility mock。
  - [ ] ebook article 走 EPUB 分支。

## 建议落地顺序

1. 先移动共用纯函数到 `app-source-bookcase-utils.ts` 并补测试。
2. 再移动 `WebSourceBookcase` 到 Web 文件，保持 props 原样。
3. 最后移动 `EbookBookcase` 到 EPUB 文件，并用 smoke test 锁住分流。

## 验收标准

- [ ] `pnpm --filter @yomitomo/desktop typecheck` 通过。
- [ ] `pnpm --filter @yomitomo/desktop test -- app-source-bookcase` 通过。
- [ ] `pnpm --filter @yomitomo/desktop lint` 通过。
- [ ] `app-source-bookcase.tsx` 只保留入口分流和 public exports。
