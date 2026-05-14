# EPUB 长书伴读评估矩阵

本评估用于 RD-347。目标不是给模型打一个笼统分数，而是判断失败根因：第一阶段应修 `prompt/window/trace`，还是必须进入第二阶段 retrieval。

## 样本矩阵

样本定义在 `packages/ai/src/evaluation-fixtures.ts`，使用合成 EPUB index fixture，不提交商业 EPUB 文件。首版覆盖：

| 维度 | 覆盖 |
| --- | --- |
| 书籍类型 | 小说、社科/商业、哲学/理论、技术书 |
| 章节长度 | 短章、中章、超长章 |
| 任务类型 | selection annotation、selection thread reply、chapter route、segment annotation |
| 对照组 | selection-only、全文截断、structured context |

运行评估模型和 fixture 自检：

```bash
pnpm --filter @yomitomo/ai test -- evaluation --pool forks --maxWorkers=1
```

真实模型评估时，每个 case 都应写入同一组 `EpubEvaluationRun`：`caseId`、`controlGroup`、模型输出、人工评分、失败标签、latency 和 token/cost。随后用 `aggregateEpubEvaluation` 与 `evaluateEpubPhaseOne` 汇总。

## 自动指标

| 指标 | 含义 |
| --- | --- |
| `anchor_hit_rate` | 输出批注能否解析回 EPUB index 中的原文锚点 |
| `duplicate_annotation_rate` | 同一位置、同一 exact 或近距离同 moveType 的重复率 |
| `annotations_per_1000_chars` | 评估范围内每千字符批注数 |
| `empty_segment_rate` | segment-level 任务中，没有可展示批注的 segment 比例 |
| `latency` | 单 case 端到端耗时 |
| `cost` | provider 返回 usage 时记录 token 和费用 |

`empty_segment_rate` 按最终可展示、可落锚的批注计算；锚点失败不会把 segment 计为非空。

## 人工评分

每项 1-5 分，高分更好：

| 字段 | 评分问题 |
| --- | --- |
| `contextAwareness` | 是否理解选区/segment 在章节中的位置 |
| `textualGrounding` | 判断是否能回到原文依据 |
| `annotationValue` | 批注是否改变理解、提出好问题或暴露前提 |
| `noiseControl` | 是否克制，避免机械摘要和低价值批注 |
| `personaDistinctiveness` | 不同助手是否体现稳定差异，而不是同质化 |

## 失败标签

| 标签 | 判定 |
| --- | --- |
| `context_insufficient` | 证据本应在 P1 窗口内，但没有进入上下文或被 prompt 忽略 |
| `summary_drift` | summary 改写了原文含义，导致后续判断偏移 |
| `trace_pollution` | trace 把助手观察当成原文事实，污染后续 segment |
| `retrieval_missing` | 所需证据超出 P1 结构化窗口，必须靠 P2 retrieval 找回 |
| `selection_mispoint` | selection annotation 没有围绕目标选区 |
| `persona_homogenization` | 多助手输出风格和判断角度过度同质 |
| `anchor_failure` | exact 无法解析回 EPUB 原文 |

## 第一阶段通过标准

默认 gate 定义在 `epubPhaseOneCriteria`：

| 标准 | 阈值 |
| --- | --- |
| `anchor_hit_rate` | `>= 98%` |
| `duplicate_annotation_rate` | `<= 15%` |
| `annotations_per_1000_chars` | 不超过 case 的 `densityLimitPer1000Chars` |
| `selection_context_score` | structured context 高于 selection-only |
| `thread_grounding_score` | structured context 高于全文截断 |
| `segment_empty_rate` | `20% - 60%` |

## 进入 P2 retrieval 的触发条件

满足以下任一条件，就不要继续只调 prompt：

1. 失败样本稳定标记为 `retrieval_missing`，且所需证据不在当前 selection window、read-so-far、segment trace 或 chapter descriptor 中。
2. 跨章节回响类 case 在 structured context 下仍无法找回远距离证据。
3. thread reply 需要读者已读范围内的远距离概念，但 lexical current-chapter evidence 不够。

反过来，如果证据已经在 structured context 中，却回答漂移，应归为 `context_insufficient`、`summary_drift` 或 `trace_pollution`，继续修 P1。
