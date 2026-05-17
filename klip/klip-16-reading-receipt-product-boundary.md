---
Author: "Codex"
Updated: 2026-05-17
Status: Almost Complete
Origin: 2026-05-17 读后回执节点 2 / 节点 3 产品边界讨论
---

# klip-16-reading-receipt-product-boundary

## 现状结论（代码校准）

- `ReadingCard` 仍是读后回执三节点的前端总入口，负责材料拣选、阅读所得确认、回执生成、审阅助手选择和节点回退。证据：`apps/desktop/src/renderer/src/app-reading-card-panel.tsx` 中 `ReadingCard`、`returnToReceiptTriage()`、`returnToReceiptConfirmation()`。
- 节点 2 当前由 `ReadingDeliberationPanel` 展示 AI 生成的「阅读所得」，再要求用户填写 `receiptUserJudgment` 后才能继续。证据：`apps/desktop/src/renderer/src/app-reading-card-display.tsx` 中 `ReadingDeliberationPanel`，以及 `apps/desktop/src/renderer/src/app-reading-card-panel.tsx` 中 `confirmAndGenerateAiCard()`。
- 节点 2 的按钮现在直接触发 `generateReadingCard`，产物是最终 Markdown 形态的 `ReadingCardRecord`，不是独立的结构化「回执计划」。证据：`apps/desktop/src/renderer/src/app-reading-card-workflow.ts` 中 `generateAiCard()`。
- 节点 3 当前由 `ReadingCardReviewAgentStrip` 选择审阅助手，并调用 `reviewReadingCard` 审阅已生成的回执。证据：`apps/desktop/src/renderer/src/app-reading-card-panel.tsx` 中 `ReadingCardReviewAgentStrip`，以及 `apps/desktop/src/renderer/src/app-reading-card-workflow.ts` 中 `reviewAiCard()` / `retryReviewAgent()`。
- AI prompt 已经区分阅读所得、回执生成和审阅三类任务，但「确认所得」与「生成最终回执」仍耦合在同一次用户动作里。证据：`packages/ai/src/reading-card.ts` 中 `buildReadingDeliberationPrompt()`、`buildReadingCardPrompt()`、`buildReviewReadingCardPrompt()`。

## 背景

- 当前问题不是单个按钮文案或卡片布局，而是「读后回执」三节点的产物边界不清。
- 节点 1 后，AI 已经根据用户拣选的材料生成了「阅读所得」。节点 2 再让用户补一句自己的判断，如果下一步仍只是让 AI 重新包装成一篇笔记，用户很难理解这个节点新增了什么价值。
- 节点 3 的审阅助手如果只审一篇脱离上下文的 Markdown，就会变成普通文本审稿；它无法判断回执是否忠于用户主轴、是否尊重材料去向、是否把助手观点冒充成用户观点。
- 最终产品价值不应该是「更漂亮的 AI 读书笔记」，而应该是把一次阅读留下的个人判断、证据、未决问题和可复用行动固化成一个可回访的认知记录。

## 目标

- 明确读后回执的最终价值：**可回访的个人认知记录**，而不是文章总结。
- 明确三节点各自产物，避免节点 2 和节点 3 都在做「让 AI 再写一遍」。
- 让节点 2 的用户补充真正成为后续回执的主轴，而不是附加展示字段。
- 让节点 3 的审阅助手审「主轴、证据、归因、材料去向和回看价值」，而不是泛泛审文风。
- 规定节点回退和失效规则，保证用户可以从节点 3 回到节点 2、从节点 2 回到节点 1。

## 非目标

- 不在本文决定最终视觉样式。
- 不把读后回执做成通用笔记编辑器。
- 不引入自由聊天式审阅助手。
- 不改变文章导入、批注、评论和助手批注的底层数据模型。
- 不要求每篇文章都生成长文成稿；短卡、问题清单、行动清单和思考备忘都可以是合法产物。

## 术语表

- 读后回执：用户读完一篇文章后留下的个人判断、证据链、未决问题和后续行动入口。
- 材料边界：本次回执允许使用哪些批注、评论、助手观点和问题状态。
- 阅读所得：AI 基于已拣选材料做的第一轮整理，用于帮助用户看见材料之间的关系和缺口。
- 主轴：用户在节点 2 确认的「这次阅读真正留下的一句话」。
- 回执计划：节点 2 结束时形成的结构化中间产物，规定最终回执要写什么、用哪些证据、保留哪些不确定性。
- 审阅工作台：节点 3 中审阅助手对最终回执进行结构化检查的交互界面。

## 设计概览

1. 节点 1 是「拣选材料」：产物是材料边界，不是笔记。
2. 节点 2 是「确认主轴」：用户把这次阅读留下的判断钉住，AI 只辅助组织证据和暴露缺口。
3. 节点 2 的核心产物应是结构化 `ReadingReceiptPlan`，不是最终 Markdown。
4. 节点 3 是「生成并审阅回执」：先按回执计划生成最终回执，再由审阅助手检查它是否忠于计划和证据。
5. 审阅助手不是聊天对象，而是审阅席；它输出结构化 findings，用户决定回到节点 2 调主轴、重生成，或保留当前回执。

## 交互与工作流

推荐节点命名：

- 方案 A：拣选材料 / 确认主轴 / 生成并审阅回执
- 方案 B：拣选 / 定主轴 / 出回执

目标流程：

```mermaid
flowchart LR
  A["节点 1：拣选材料"] --> B["节点 2：确认主轴"]
  B --> C["节点 3：生成并审阅回执"]
  B --> A
  C --> B
```

### 节点 1：拣选材料

产物是材料边界：

- 哪些批注、评论、助手观点和问题状态纳入本次回执。
- 哪些材料暂放，不参与本次生成。
- 哪些材料需要澄清，但不阻塞进入节点 2。

节点 1 可以触发 AI 生成「阅读所得」，但这份阅读所得只是帮助用户进入节点 2 的材料整理，不是最终笔记。

### 节点 2：确认主轴

节点 2 不应再让 AI 大幅二次创作。它要回答一个问题：**这次阅读最终在我这里留下了什么？**

节点 2 的产物是 `ReadingReceiptPlan`：

```typescript
export interface ReadingReceiptPlan {
  sourceUpdatedAt: string;
  deliberationUpdatedAt: string;
  userJudgment: string;
  axis: string;
  evidenceLinks: ReadingReceiptEvidenceLink[];
  unresolved: ReadingReceiptOpenQuestion[];
  outputTask: ReadingReceiptOutputTask;
  updatedAt: string;
}

export interface ReadingReceiptEvidenceLink {
  evidenceId: string;
  role: 'support' | 'context' | 'tension' | 'open-question';
  note: string;
}

export interface ReadingReceiptOpenQuestion {
  evidenceId?: string;
  question: string;
  reason: string;
}

export interface ReadingReceiptOutputTask {
  format: 'short-card' | 'memo' | 'question-list' | 'action-list';
  instruction: string;
}
```

示例：

```json
{
  "userJudgment": "AI 审代码的价值不在发现更多问题，而在把审核变成可迭代工程实践。",
  "axis": "代码审阅是否有价值，取决于能否定义好代码质量尺度，并把审阅结果接回开发循环。",
  "evidenceLinks": [
    {
      "evidenceId": "annotation-1",
      "role": "support",
      "note": "十轮审阅能暴露重复问题，但问题数量不是最终价值。"
    },
    {
      "evidenceId": "comment-2",
      "role": "tension",
      "note": "测试全部通过不等于质量判断已经完成。"
    }
  ],
  "unresolved": [
    {
      "question": "什么算好代码需要用户自己给出尺度。",
      "reason": "现有材料只能说明反复审阅有用，不能自动定义质量标准。"
    }
  ],
  "outputTask": {
    "format": "memo",
    "instruction": "写成一份短备忘，突出主轴、证据和仍需定义的质量尺度。"
  }
}
```

AI 在节点 2 可以做的事：

- 把用户的一句话展开为可被证据支持的主轴。
- 标出哪些证据支持主轴，哪些只是背景，哪些形成张力。
- 指出证据不足、归因不稳或仍需用户补判断的地方。
- 建议最终回执更适合做短卡、思考备忘、问题清单还是行动清单。

AI 在节点 2 不应该做的事：

- 替用户发明新的主轴。
- 把用户一句话稀释成全文摘要。
- 忽略节点 1 的材料去向。
- 直接产出最终成稿并让用户误以为节点 2 已完成。

### 节点 3：生成并审阅回执

节点 3 的输入必须包含：

- 节点 1 的材料边界。
- 节点 2 的 `ReadingReceiptPlan`。
- 最终生成的 `ReadingCardRecord` 或后续等价回执记录。
- 原始证据单元和必要全文上下文。

审阅助手的职责：

- 检查最终回执有没有忠于用户主轴。
- 检查每个关键判断是否有证据。
- 检查 AI 是否把助手观点、文章观点或评论误写成用户观点。
- 检查不确定内容是否被写得太肯定。
- 检查 include / exclude / clarify 的材料去向是否被尊重。
- 判断这份回执以后回看是否仍有价值。

节点 3 的交互不应是自由聊天，而应是审阅工作台：

- 用户选择审阅席。
- 系统显示待审草稿、主轴、材料去向和审阅范围。
- 用户点击开始审阅。
- 审阅结果以 findings 展示，每条 finding 说明问题、证据、严重度和可选改写。
- 用户可以「回到确认主轴」修改 `ReadingReceiptPlan`，或基于 findings 重新生成回执。

## 前端设计

- 节点 2 的主按钮文案应从「确认并打磨成回执」调整为表达结构化确认的动作，例如「确认主轴」或「生成回执计划」。
- 节点 2 页面应显式展示回执计划，而不是只展示一段可编辑文本和一个进入下一步按钮。
- 节点 3 的审阅区域应以「审阅工作台」呈现，而不是横向助手选择条。当前 `ReadingCardReviewAgentStrip` 可以继续作为工作台入口，但职责应扩展为展示主轴、待审草稿和审阅范围。
- `ReadingCardDeck` 应继续展示用户主轴，但未来应优先从 `ReadingReceiptPlan.axis` 读取，而不是只从 `receiptUserJudgment` 读取。
- 回退规则：
  - 节点 2 回到节点 1：清除阅读所得之后的产物，包括回执计划、最终回执和审阅结果。
  - 节点 3 回到节点 2：清除最终回执和审阅结果，保留材料边界、阅读所得和用户主轴。
  - 节点 1 材料边界改变：节点 2 / 节点 3 产物失效。
  - 节点 2 主轴或回执计划改变：节点 3 产物失效。

## AI 任务边界

- `buildReadingDeliberationPrompt()` 负责从已拣选材料整理「阅读所得」。
- 新增或改造的节点 2 prompt 应负责生成 `ReadingReceiptPlan`，约束 AI 只能整理证据关系、暴露缺口和建议输出形式。
- `buildReadingCardPrompt()` 应从 `ReadingReceiptPlan` 生成最终回执，而不是直接从用户一句话和阅读所得自由生成。
- `buildReviewReadingCardPrompt()` 应审最终回执和 `ReadingReceiptPlan` 的一致性，发现不一致时必须输出 finding。

## 实施阶段建议

### Phase 1：产品边界落地

- 重命名节点 2 / 节点 3 的 UI 文案，先让用户理解工作流。
- 在节点 2 显示「主轴、证据、缺口、输出任务」四块结构，即使底层暂时仍复用现有记录。
- 保留已实现的节点 3 回到节点 2 能力。

### Phase 2：结构化中间产物

- 引入 `ReadingReceiptPlan` 类型和持久化位置。
- 将节点 2 的确认动作从直接生成最终 Markdown 调整为生成或更新 `ReadingReceiptPlan`。
- 让最终回执生成只消费 `ReadingReceiptPlan`、材料边界和证据单元。

### Phase 3：审阅工作台

- 将节点 3 审阅输入改为 `ReadingReceiptPlan + ReadingCardRecord + evidenceUnits`。
- 审阅结果按主轴、证据、归因、材料去向、回看价值分组。
- 支持从审阅 finding 回到节点 2 调整主轴或重新生成回执。

## 测试矩阵

| 场景 | 测试类型 | 覆盖要求 |
| --- | --- | --- |
| 节点 2 未填写用户主轴 | 组件测试 | 不允许进入节点 3 |
| 节点 2 确认后生成 `ReadingReceiptPlan` | hook / 组件测试 | 主轴、证据链接、未决问题进入请求和展示 |
| 节点 3 审阅请求 | hook 测试 | 请求包含材料边界、回执计划、最终回执和审阅助手 id |
| 节点 3 回到节点 2 | 组件测试 | 清除最终回执和审阅结果，保留用户主轴和阅读所得 |
| 节点 2 回到节点 1 | 组件测试 | 清除阅读所得之后的产物 |
| 材料边界变化 | workflow 测试 | 节点 2 / 节点 3 产物标记为失效或被清除 |
| 用户主轴变化 | workflow 测试 | 节点 3 审阅结果失效 |

## 验收标准

- 用户能说清节点 1、节点 2、节点 3 各自产物分别是什么。
- 节点 2 的用户补充不只是被展示，而是进入结构化回执计划并影响最终回执。
- 节点 2 的按钮不会直接让用户误以为 AI 又生成了一篇普通笔记。
- 节点 3 审阅助手能指出「未体现用户主轴」「证据不足」「归因错误」「材料去向错误」四类问题。
- 用户可以从节点 3 回到节点 2，且不会丢失已确认的主轴。
- 节点 2 / 节点 3 的现有测试或新增测试覆盖回退、失效和审阅请求上下文。

## 待讨论事项

- `ReadingReceiptPlan` 是否作为 `readingReceiptState.confirmation` 的扩展字段持久化，还是作为独立 `article.readingReceiptPlan` 字段持久化。
- 节点 2 的 `ReadingReceiptPlan` 是否必须由 AI 生成，还是先用确定性规则生成草案，再让 AI 补证据关系。
- 审阅 finding 的「采纳后重写」是自动重生成，还是先回到节点 2 让用户确认主轴变化。
- 最终回执的合法形态是否需要用户手动选择，还是由节点 2 的 `outputTask.format` 自动决定。

## 关键参考位置

- `apps/desktop/src/renderer/src/app-reading-card-panel.tsx`
- `apps/desktop/src/renderer/src/app-reading-card-workflow.ts`
- `apps/desktop/src/renderer/src/app-reading-card-display.tsx`
- `apps/desktop/src/renderer/src/app-reading-card-review.tsx`
- `apps/desktop/src/renderer/src/__tests__/app-reading-card-panel.test.tsx`
- `apps/desktop/src/renderer/src/__tests__/app-reading-card-workflow.test.ts`
- `packages/ai/src/reading-card.ts`
