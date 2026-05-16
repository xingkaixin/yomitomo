---
Author: "Codex"
Updated: 2026-05-16
Status: Draft
Origin: 2026-05-16 codebase review（SourceBookcase 共读请求流程拆分）
---

# klip-8-source-bookcase-agent-request-pipeline

## 背景

- `klip-2-source-bookcase-split.md` 已把 SourceBookcase 按 Web/EPUB 运行时拆成 `app-source-bookcase-web.tsx` 和 `app-source-bookcase-ebook.tsx`。
- 拆分后，Web 和 EPUB 仍各自持有一套共读请求流程：mention 指令拆解、readingPlan 派生、stream request payload、readingMemory 保存、批注追加/播放、状态提示和失败收尾。
- Web 版本 `requestAgentAnnotations` 位于 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:1096`，EPUB 版本位于 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1904`。
- 这两个运行时的播放方式不同，不能强行合并 UI 逻辑；但请求输入构建、readingPlan 规则、memory 规则和 mention planning 明显是同一业务协议。

## 现状

- Web 创建批注时，如果 note mention 了助手，会调用 `resolveAgentMentionInstructions` 后逐个触发 `requestAgentAnnotations`，位置在 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:652` 到 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:679`。
- EPUB 创建批注的 mention 分支基本同构，位置在 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1455` 到 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1480`。
- Web 的 mention planning 位于 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:687` 到 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:729`；EPUB 版本位于 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1490` 起。
- Web 的请求流程会调用 `startVirtualReading` 并使用 `enqueueAgentAnnotation` 播放批注，核心逻辑在 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:1120` 到 `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:1165`。
- EPUB 的请求流程会调用 `startEbookAgentDock`、`startEbookVirtualReading` 和 `enqueueEbookAgentAnnotationPlayback`，核心逻辑在 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1925` 到 `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1975`。
- 已有共享纯函数在 `apps/desktop/src/renderer/src/app-source-bookcase-shared.ts:184`、`:208`、`:224`，并由 `apps/desktop/src/renderer/src/__tests__/app-source-bookcase-shared.test.ts` 覆盖。

## 目标

- 抽出 Web/EPUB 共用的 agent request payload 构建和 mention planning 流程。
- 保持 Web/EPUB 各自的播放、定位、dock 和 Foliate 行为独立。
- 降低两个 `requestAgentAnnotations` 分支的重复条件判断，避免后续改 readingMemory、readingPlan 或 targetAnchor 时只改一边。
- 给请求构建纯逻辑补测试，覆盖 target anchor、reading plan、annotation context 和 reading memory 的组合。

## 非目标

- 不合并 WebSourceBookcase 和 EbookBookcase。
- 不重写 Foliate 集成、iframe 选区定位或 EPUB 高亮映射。
- 不改变 `window.yomitomoDesktop.requestAgentAnnotationsStream` preload / IPC contract。
- 不改变 `ReaderAppView` 的 public props。
- 不改变现有助手批注展示动画。

## 发现与方案

### P1（请求协议边界）

#### 1. `requestAgentAnnotations` 的输入构建在 Web/EPUB 中重复

- 位置：
  - `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:1096`
  - `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1904`
- 现象 / 风险：
  - `targetAnchorReadingPlan`、`annotations` 注入、`readingMemory` 注入、`readingPlan` 传参条件在两个文件中重复。
  - 这些条件实际属于 AI 请求协议，而不是 Web DOM 或 EPUB Foliate 运行时。
- 建议方案：
  - 新增 `app-source-agent-request.ts`。
  - 定义 `SourceAgentAnnotationRequestOptions`、`SourceAgentAnnotationRuntimeContext` 和 `buildAgentAnnotationRequestInput`。
  - `buildAgentAnnotationRequestInput` 只返回 request payload、resolved readingPlan、playback mode、是否需要保存 readingMemory 等纯数据。
- 验收标准：
  - [ ] Web/EPUB 不再手写 `annotations: options.targetAnchor || readingPlan.length > 0 ? ...` 这类协议判断。
  - [ ] target anchor 请求不会传 whole-plan `readingPlan`。
  - [ ] focus co-reading plan 请求会传 `readingMemory` 并在结果返回后保存。
  - [ ] 纯函数测试覆盖 target、careful、article 三类请求。

#### 2. mention 指令拆解逻辑在 Web/EPUB 中重复

- 位置：
  - `apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:687`
  - `apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1490`
- 现象 / 风险：
  - 两个实现都调用 `agentInstructionFromNote`，再尝试 `desktop.planAgentMentionInstructions`，失败时回退到 base instructions。
  - 状态提示和错误提示文案可能继续分叉。
- 建议方案：
  - 在 `app-source-agent-request.ts` 中新增 `resolveSourceAgentMentionInstructions`。
  - 该函数接收 `desktop`、`article`、`targetAnchor`、`agents`、`note` 和可选 `onStatus`，返回统一的 agent/instruction/readingIntent 列表。
  - Web/EPUB 创建批注路径只负责取消 composer、调用 resolver、触发运行时自己的 request 函数。
- 验收标准：
  - [ ] `agentInstructionFromNote` 的现有测试继续通过。
  - [ ] mention planning 失败时仍回退到通用 instruction，不阻断用户批注流程。
  - [ ] Web/EPUB 的“正在拆解助手任务”状态行为一致。

#### 3. 播放与持久化差异应该保留为 runtime adapter

- 位置：
  - Web：`apps/desktop/src/renderer/src/app-source-bookcase-web.tsx:1127`、`:1161`
  - EPUB：`apps/desktop/src/renderer/src/app-source-bookcase-ebook.tsx:1930`、`:1963`
- 现象 / 风险：
  - Web 使用 `useAgentAnnotationQueue` 做正文 DOM 播放。
  - EPUB 使用 Foliate/iframe 相关逻辑，需要 `enqueueEbookAgentAnnotationPlayback` 和缺失 range reveal。
  - 如果为了去重强行合并播放逻辑，会破坏两个运行时的根本差异。
- 建议方案：
  - 抽请求协议，不抽 UI 播放实现。
  - 在 Web/EPUB 文件中保留 runtime adapter：`startPlayback`、`handleStreamAnnotation`、`finishRequest`。
  - 共享模块只决定“请求什么”和“结果应该保存什么”，不决定“怎么播放”。
- 验收标准：
  - [ ] Web-only 文件不 import EPUB reader utils。
  - [ ] EPUB-only 文件不依赖 Web DOM queue hook。
  - [ ] `requestAgentAnnotations` 在两个文件中都收敛到 45 行以内。

## 建议落地顺序

1. 先抽 `buildAgentAnnotationRequestInput` 和测试，不移动 async request 流程。
2. 再抽 `resolveSourceAgentMentionInstructions`，替换 Web/EPUB 的重复 mention planning。
3. 再把 Web/EPUB 的 `requestAgentAnnotations` 改成 runtime adapter 模式。
4. 最后补 Web/EPUB smoke test，确认 target anchor、focus plan 和后台 articleScopedWrite 路径不退化。

## 验收标准

- [ ] `pnpm --filter @yomitomo/desktop test -- app-source-bookcase` 通过。
- [ ] `pnpm --filter @yomitomo/desktop typecheck` 通过。
- [ ] `pnpm --filter @yomitomo/desktop lint` 通过。
- [ ] `app-source-bookcase-web.tsx` 与 `app-source-bookcase-ebook.tsx` 不再重复 request payload 构造规则。
- [ ] 现有 Web/EPUB 共读入口 `onStartAgentReadingPlan` 行为不变。
