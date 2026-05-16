---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
Origin: 2026-05-16 code health review（AI agent 运行链路拆分）
---

# klip-13-ai-agent-runtime-boundary

## 背景

- 本轮已把 `packages/ai/src/index.ts` 中的读后笔记链路抽到 `reading-card.ts`，把批注元数据与 @ 助手任务拆解抽到 `annotation-metadata.ts`。
- `index.ts` 仍约 1090 行，主要剩余职责是 agent message、agent annotate、segment annotate、stream JSON 解析、阅读记忆更新和 prompt 构建。
- 继续拆分的价值取决于近期是否还会改 AI 批注质量、stream 输出或 reading memory。若这些领域会继续迭代，拆分有明确收益；若短期稳定，可以先停。

## 目标

- 把 `index.ts` 从 AI 功能聚合文件收敛为兼容导出入口。
- 分离 agent message、agent annotation 和 segment annotation 三条运行链路。
- 保留 public exports，不破坏 desktop main 的 import。

## 非目标

- 不重写 prompt 内容。
- 不改变 provider client API。
- 不改变流式 NDJSON contract。
- 不重构 `selection-context.ts`、`segment-annotation-context.ts`、`reading-memory.ts` 的内部算法。

## 拆分价值判断

这里不是“必须马上拆”，但具备中等价值：

- agent message 与 agent annotation 的输入、输出和上下文完全不同。
- segment annotation 额外涉及阅读计划、dedup、memory update 和逐段 stream。
- prompt 构建和运行流程混在同一文件里，会让调 prompt 的改动误触 stream / dedup 正确性路径。

如果后续要继续优化批注质量，拆分能把测试和 review 边界变清楚。

## 建议方案

### 1. 抽 `agent-message.ts`

- 移动 `runAgentStream`、`runAgent`、`buildAgentMessageSystemPrompt`、`buildAgentPrompt` 和 message participants / self instruction helper。
- 保留 `buildAgentPrompt` export，因为测试直接覆盖 prompt。

### 2. 抽 `agent-annotation.ts`

- 移动 `runAgentAnnotate`、`runAgentAnnotateWithMemory`、`runAgentAnnotateStream` 和非 segment 的 annotate prompt 构建。
- 保留 `AgentAnnotatePayload` 的现有类型来源。

### 3. 抽 `segment-annotation-runner.ts`

- 移动 `runAgentSegmentAnnotate*`、segment deduper、segment prompt 构建。
- 该文件可以依赖 `segment-annotation-context.ts`，但不反向依赖。

### 4. `index.ts` 只做 re-export 和少量跨域函数

- 保持 `testProvider` 和 public export。
- 不在 `index.ts` 新增业务流程。

### 5. 共享 prompt helper

- 新增 `agent-runtime-prompts.ts`，只承接 `readingIntent*`、`spoilerScopePrompt`、`instructionPromptLine` 这类跨 message / annotation / segment runner 复用的小 helper。
- 不在 helper 中放 provider call、stream 解析、dedup 或 reading memory update，避免重新形成运行时聚合文件。

## 风险

- 流式解析路径有用户可感知行为，必须保留 incomplete JSON 日志和 parse error 日志。
- segment dedup 是正确性路径，不能为了拆文件改算法。
- 现有 `index.test.ts` 较大，迁移后可以先保留测试文件不动，确认 public export 不变。

## 验收标准

- [x] `packages/ai/src/index.ts` 降到兼容 barrel + 少量入口函数。
- [x] `buildAgentPrompt`、`buildAgentMessageSystemPrompt`、`parseAgentMentionInstructions` 等现有测试继续通过。
- [x] `pnpm --filter @yomitomo/ai test -- index` 通过。
- [x] `pnpm --filter @yomitomo/ai test` 通过。
- [x] `pnpm --filter @yomitomo/ai typecheck`、`lint`、`format:check` 通过。

## 实施结果

- `packages/ai/src/index.ts` 收敛到 109 行，只保留 public re-export 和 `testProvider`。
- 新增 `agent-message.ts`、`agent-annotation.ts`、`segment-annotation-runner.ts`，分别承接 agent message、非 segment annotation 和 segment annotation 运行链路。
- `planFocusCoReadingRoute` 移入 `focus-route.ts`，`index.ts` 保持兼容导出。
- 验证通过：AI 包 `typecheck`、`lint`、`format:check`、`test -- index` 和完整 `test`。
