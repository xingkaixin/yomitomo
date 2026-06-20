import { jsonSchema, Output, type JSONSchema7 } from 'ai';
import type {
  AnnotationDistillationProposal,
  AnnotationDistillationProposalKind,
  AnnotationDistillationReviewFindingCategory,
  AnnotationDistillationReviewFindingSeverity,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewStance,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { extractJsonObjects } from '../json';

export type GeneratedDistillationReviewItem =
  | {
      type: 'overview';
      stance: AnnotationDistillationReviewStance;
      content: string;
    }
  | {
      type: 'finding';
      category: AnnotationDistillationReviewFindingCategory;
      severity: AnnotationDistillationReviewFindingSeverity;
      title: string;
      content: string;
      draftTargetText?: string;
    }
  | {
      type: 'proposal';
      kind: AnnotationDistillationProposalKind;
      title: string;
      rationale?: string;
      insertAfterText?: string;
      targetText?: string;
      replacementText?: string;
      content?: string;
    };

export const distillationReviewStructuredOutput = Output.array<GeneratedDistillationReviewItem>({
  name: 'distillation_review_items',
  description:
    'A sequence of readable distillation review items: overview, findings, and actionable draft proposals.',
  element: jsonSchema<GeneratedDistillationReviewItem>(distillationReviewItemJsonSchema(), {
    validate: validateGeneratedDistillationReviewItem,
  }),
});

export function distillationReviewStructuredOutputPrompt(input: {
  jsonlFallback: boolean;
  mode?: 'review' | 'organize_discussion';
}) {
  const itemRules = `结构化 item 类型：
- overview：整体判断，字段为 type="overview"、stance="solid"|"mixed"|"weak"、content。
- finding：审阅意见，字段为 type="finding"、category="evidence"|"logic"|"coverage"|"clarity"|"actionability"、severity="low"|"medium"|"high"、title、content，可选 draftTargetText。
- proposal：可直接应用到沉淀稿的修改建议，字段为 type="proposal"、kind="insert"|"replace"|"delete"、title，可选 rationale。insert 必须有 content；replace 必须有 targetText 和 replacementText；delete 必须有 targetText。`;
  const overviewRule =
    input.mode === 'organize_discussion'
      ? '- 第一条应该是 overview，用自然语言概括可沉淀方向；不要评价现有草稿质量。'
      : '- 第一条应该是 overview，用自然语言给出总评。';
  const modeRules =
    input.mode === 'organize_discussion'
      ? `
整理讨论模式约束：
- overview 总结可沉淀方向，不要写成“草稿已经...”这类现有草稿评价。
- finding 只指出可以补充、澄清或拆出的方向，不要断言空草稿已经具备某种质量。
- proposal 只能使用 kind="insert"，用 content 放可直接加入草稿的新文本。`
      : '';

  const outputRule = input.jsonlFallback
    ? '最终只输出 JSONL：每行一个完整 JSON object，不要输出数组、Markdown、代码块或解释性包装。'
    : '最终输出 1 到 6 个结构化 item，不要输出 Markdown、代码块或解释性包装。';

  return `${outputRule}

${itemRules}${modeRules}

输出约束：
${overviewRule}
- finding 用于指出证据、逻辑、覆盖范围、表达清晰度或可行动性问题。
- proposal 只用于真正能被用户接受/忽略并应用到草稿的修改，不要把泛泛评价写成 proposal。
- 没有可靠可应用修改时可以不输出 proposal。`;
}

export async function collectDistillationReviewItemsFromElementStream(input: {
  elementStream: AsyncIterable<GeneratedDistillationReviewItem>;
  onItem?: (item: AnnotationDistillationReviewItem) => void;
  now?: () => string;
}) {
  const items: AnnotationDistillationReviewItem[] = [];
  for await (const generated of input.elementStream) {
    const item = normalizeGeneratedDistillationReviewItem(generated, input.now);
    items.push(item);
    input.onItem?.(item);
  }
  return items;
}

export async function collectDistillationReviewItemsFromJsonTextStream(input: {
  textStream: AsyncIterable<string>;
  onItem?: (item: AnnotationDistillationReviewItem) => void;
  now?: () => string;
}) {
  const items: AnnotationDistillationReviewItem[] = [];
  let buffer = '';
  for await (const delta of input.textStream) {
    buffer += delta;
    const extracted = extractJsonObjects(buffer);
    buffer = extracted.rest;
    for (const objectText of extracted.objects) {
      const generated = parseGeneratedDistillationReviewItem(objectText);
      const item = normalizeGeneratedDistillationReviewItem(generated, input.now);
      items.push(item);
      input.onItem?.(item);
    }
  }
  const extracted = extractJsonObjects(buffer);
  for (const objectText of extracted.objects) {
    const generated = parseGeneratedDistillationReviewItem(objectText);
    const item = normalizeGeneratedDistillationReviewItem(generated, input.now);
    items.push(item);
    input.onItem?.(item);
  }
  return items;
}

export function distillationReviewContentFromItems(items: AnnotationDistillationReviewItem[]) {
  return items
    .flatMap((item) => {
      if (item.type === 'overview') return [item.content];
      if (item.type === 'finding') return [`${item.title}\n${item.content}`];
      const text = [item.proposal.title, item.proposal.rationale].filter(Boolean).join('\n');
      return text ? [text] : [];
    })
    .join('\n\n')
    .trim();
}

export function distillationReviewProposalsFromItems(items: AnnotationDistillationReviewItem[]) {
  return items.flatMap((item) => (item.type === 'proposal' ? [item.proposal] : []));
}

export function normalizeGeneratedDistillationReviewItem(
  item: GeneratedDistillationReviewItem,
  now: () => string = () => new Date().toISOString(),
): AnnotationDistillationReviewItem {
  if (item.type === 'overview') {
    return {
      id: makeId('distillation_review_item'),
      type: 'overview',
      stance: item.stance,
      content: item.content.trim(),
    };
  }
  if (item.type === 'finding') {
    return {
      id: makeId('distillation_review_item'),
      type: 'finding',
      category: item.category,
      severity: item.severity,
      title: item.title.trim(),
      content: item.content.trim(),
      draftTargetText: item.draftTargetText?.trim() || undefined,
    };
  }
  return {
    id: makeId('distillation_review_item'),
    type: 'proposal',
    proposal: generatedProposalToProposal(item, now()),
  };
}

function generatedProposalToProposal(
  item: Extract<GeneratedDistillationReviewItem, { type: 'proposal' }>,
  updatedAt: string,
): AnnotationDistillationProposal {
  const content = item.content?.trim() || '';
  const targetText = item.targetText?.trim() || '';
  const replacementText = item.replacementText?.trim() || '';
  return {
    id: makeId('distillation_proposal'),
    kind: item.kind,
    status: 'pending',
    title: item.title.trim() || proposalTitle(item.kind, content, targetText),
    rationale: item.rationale?.trim() || undefined,
    insertAfterText: item.insertAfterText?.trim() || undefined,
    targetText: targetText || undefined,
    replacementText: item.kind === 'replace' ? replacementText : undefined,
    content: item.kind === 'insert' ? content : undefined,
    updatedAt,
  };
}

function parseGeneratedDistillationReviewItem(value: string) {
  const parsed = JSON.parse(value) as unknown;
  const result = validateGeneratedDistillationReviewItem(parsed);
  if (!result.success) throw result.error;
  return result.value;
}

function validateGeneratedDistillationReviewItem(
  value: unknown,
): { success: true; value: GeneratedDistillationReviewItem } | { success: false; error: Error } {
  if (!isRecord(value)) return invalidGeneratedItem('item must be an object');
  if (value.type === 'overview') {
    const content = stringField(value.content);
    const stance = reviewStance(value.stance);
    if (!content) return invalidGeneratedItem('overview.content is required');
    if (!stance) return invalidGeneratedItem('overview.stance is invalid');
    return { success: true, value: { type: 'overview', stance, content } };
  }
  if (value.type === 'finding') {
    const title = stringField(value.title);
    const content = stringField(value.content);
    const category = reviewFindingCategory(value.category);
    const severity = reviewFindingSeverity(value.severity);
    if (!title) return invalidGeneratedItem('finding.title is required');
    if (!content) return invalidGeneratedItem('finding.content is required');
    if (!category) return invalidGeneratedItem('finding.category is invalid');
    if (!severity) return invalidGeneratedItem('finding.severity is invalid');
    return {
      success: true,
      value: {
        type: 'finding',
        category,
        severity,
        title,
        content,
        draftTargetText: stringField(value.draftTargetText) || undefined,
      },
    };
  }
  if (value.type === 'proposal') {
    const kind = proposalKind(value.kind);
    const title = stringField(value.title);
    const content = stringField(value.content);
    const targetText = stringField(value.targetText);
    const replacementText = stringField(value.replacementText);
    if (!kind) return invalidGeneratedItem('proposal.kind is invalid');
    if (!title) return invalidGeneratedItem('proposal.title is required');
    if (!validProposalFields(kind, content, targetText, replacementText)) {
      return invalidGeneratedItem('proposal fields do not match kind');
    }
    return {
      success: true,
      value: {
        type: 'proposal',
        kind,
        title,
        rationale: stringField(value.rationale) || undefined,
        insertAfterText: stringField(value.insertAfterText) || undefined,
        targetText: targetText || undefined,
        replacementText: kind === 'replace' ? replacementText : undefined,
        content: kind === 'insert' ? content : undefined,
      },
    };
  }
  return invalidGeneratedItem('item.type is invalid');
}

function distillationReviewItemJsonSchema(): JSONSchema7 {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['overview', 'finding', 'proposal'] },
      stance: { type: 'string', enum: ['solid', 'mixed', 'weak'] },
      category: {
        type: 'string',
        enum: ['evidence', 'logic', 'coverage', 'clarity', 'actionability'],
      },
      severity: { type: 'string', enum: ['low', 'medium', 'high'] },
      kind: { type: 'string', enum: ['insert', 'replace', 'delete'] },
      title: { type: 'string' },
      content: { type: 'string' },
      rationale: { type: 'string' },
      insertAfterText: { type: 'string' },
      targetText: { type: 'string' },
      replacementText: { type: 'string' },
      draftTargetText: { type: 'string' },
    },
  };
}

function invalidGeneratedItem(message: string) {
  return {
    success: false as const,
    error: new Error(`Invalid distillation review item: ${message}`),
  };
}

function reviewStance(value: unknown): AnnotationDistillationReviewStance | null {
  return value === 'solid' || value === 'weak' || value === 'mixed' ? value : null;
}

function reviewFindingCategory(value: unknown): AnnotationDistillationReviewFindingCategory | null {
  if (
    value === 'evidence' ||
    value === 'logic' ||
    value === 'coverage' ||
    value === 'clarity' ||
    value === 'actionability'
  ) {
    return value;
  }
  return null;
}

function reviewFindingSeverity(value: unknown): AnnotationDistillationReviewFindingSeverity | null {
  return value === 'low' || value === 'high' || value === 'medium' ? value : null;
}

function proposalKind(value: unknown): AnnotationDistillationProposalKind | null {
  return value === 'insert' || value === 'replace' || value === 'delete' ? value : null;
}

function validProposalFields(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
  replacementText: string,
) {
  if (kind === 'insert') return Boolean(content);
  if (kind === 'replace') return Boolean(targetText && replacementText);
  return Boolean(targetText);
}

function proposalTitle(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
) {
  const text = kind === 'insert' ? content : targetText;
  const preview = text.length > 18 ? `${text.slice(0, 18)}...` : text;
  if (kind === 'insert') return preview ? `新增：${preview}` : '新增内容';
  if (kind === 'replace') return preview ? `修改：${preview}` : '修改内容';
  return preview ? `删除：${preview}` : '删除内容';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
