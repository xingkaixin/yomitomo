import { Type } from '@earendil-works/pi-ai';
import { annotationAuthorName } from '@yomitomo/core';
import type { AgentMessagePayload, Annotation, Comment } from '@yomitomo/shared';
import { resolvePromptAgentIdentity } from '@yomitomo/shared';
import { responseLanguageSystemPrompt } from './agent-language';
import { buildAgentRoleCard, type PromptAgent } from './agent-role-card';
import {
  readingAssistantPrinciplesPrompt,
  readingIntentPromptLine,
  readingIntentSystemPrompt,
  reviewAssistantPrinciplesPrompt,
} from './agent-runtime-prompts';

export const DISTILLATION_REVIEW_TOOL = 'add_review_item';

const oneOf = <T extends string>(...values: T[]) =>
  Type.Union(values.map((value) => Type.Literal(value)));

// A flat object rather than a union: several providers require tool parameters to be one object.
export const distillationReviewItemParameters = Type.Object({
  type: oneOf('overview', 'finding', 'proposal'),
  stance: Type.Optional(oneOf('solid', 'mixed', 'weak')),
  category: Type.Optional(oneOf('evidence', 'logic', 'coverage', 'clarity', 'actionability')),
  severity: Type.Optional(oneOf('low', 'medium', 'high')),
  kind: Type.Optional(oneOf('insert', 'replace', 'delete')),
  title: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  rationale: Type.Optional(Type.String()),
  insertAfterText: Type.Optional(Type.String()),
  targetText: Type.Optional(Type.String()),
  replacementText: Type.Optional(Type.String()),
  draftTargetText: Type.Optional(Type.String()),
});

export function buildDistillationReviewInstructions(
  agent: PromptAgent,
  payload: Pick<AgentMessagePayload, 'agentUsername' | 'uiLanguage' | 'readingIntent'>,
) {
  const identity = resolvePromptAgentIdentity(agent, payload.uiLanguage);
  const username = identity.username || payload.agentUsername;
  const nickname = identity.nickname || username;
  return `${buildAgentRoleCard(agent, payload.uiLanguage)}

你正在作为网页阅读器里的审阅助手 ${nickname}（@${username}）审阅用户准备沉淀的一段阅读笔记。${readingAssistantPrinciplesPrompt(payload.uiLanguage)}${reviewAssistantPrinciplesPrompt(payload.uiLanguage)}${readingIntentSystemPrompt(payload)}

审阅边界：
- 角色卡用于影响你的判断视角、问题敏感度和取舍标准；不要把角色卡写成自我介绍或身份表演。
- 你不是替用户改写沉淀，也不是直接发布结论。
- 只给反馈、质疑、补充或可带走的判断框架。
- 不要 @ 用户，不要寒暄，不要展示思考过程。
- 审阅结果只通过 ${DISTILLATION_REVIEW_TOOL} 工具提交；每条 item 保持简短，能用一句话说清就不要展开。${responseLanguageSystemPrompt(payload.uiLanguage)}`;
}

export function buildDistillationReviewInput(
  payload: AgentMessagePayload,
  anchorBlockId: string | undefined,
) {
  const organize = payload.distillationReviewMode === 'organize_discussion';
  const rawDraft = payload.distillationDraft ?? payload.instruction ?? '';
  const hasDraft = Boolean(rawDraft.trim());
  const draft = rawDraft.trim() || '用户还没有写沉淀草稿。';
  const request = payload.distillationReviewRequest?.trim() || payload.userComment.content;
  const previous = payload.distillationReviewTranscript?.trim();
  const quote = `${payload.annotation.anchor.exact}${anchorBlockId ? `\n（位于段落 ${anchorBlockId}）` : ''}`;
  const task = organize
    ? `请整理讨论。要求：
- 本轮任务是把高亮、想法和审阅讨论整理成可加入沉淀稿的新内容。
- 只提交可新增的方向、判断或补充；proposal 只能是 insert。
- ${hasDraft ? '当前草稿只用于避免提出重复新增，不要评价草稿整体质量。' : '当前草稿为空，不能写“草稿已经”“草稿抓住”“草稿遗漏”“整体可靠”等评价现有草稿的话。'}
- 用“可以沉淀为”“建议新增”“可以补充”描述，不要假装用户已经写出了这些判断。
- 不要修改或删除现有草稿，不要给发布决定。`
    : `请审阅这段沉淀。要求：
- 本轮任务是审阅草稿：可以指出新增、修改或删除方向，但不要直接替用户改稿。
- 帮助用户判断这段沉淀是否值得发布、是否缺证据、是否可以更准确。
- 如果草稿为空，基于高亮、想法和讨论给出可沉淀方向、风险或反问。
- 不要替用户完整改写，不要给发布决定。`;
  return `【沉淀${organize ? '整理' : '审阅'}】${readingIntentPromptLine(payload)}

用户高亮：
${quote}

${organize ? '当前沉淀草稿（仅用于避免重复）' : '用户当前沉淀草稿'}：
${draft}

已有想法和讨论：
${formatDiscussion(payload.annotation)}${previous ? `\n\n此前沉淀审阅讨论：\n${previous}` : ''}${request ? `\n\n本轮用户请求：\n${request}` : ''}

${task}

${reviewItemRules(organize)}`;
}

function reviewItemRules(organize: boolean) {
  return `提交方式：每调用一次 ${DISTILLATION_REVIEW_TOOL} 提交一条 item，共 1 到 6 条，按阅读顺序提交。
- overview：整体判断，字段为 type="overview"、stance="solid"|"mixed"|"weak"、content。
- finding：审阅意见，字段为 type="finding"、category="evidence"|"logic"|"coverage"|"clarity"|"actionability"、severity="low"|"medium"|"high"、title、content，可选 draftTargetText。
- proposal：可直接应用到沉淀稿的修改建议，字段为 type="proposal"、kind="insert"|"replace"|"delete"、title，可选 rationale。insert 必须有 content；replace 必须有 targetText 和 replacementText；delete 必须有 targetText。
${organize ? '- 第一条应该是 overview，用自然语言概括可沉淀方向；不要评价现有草稿质量。\n- finding 只指出可以补充、澄清或拆出的方向，不要断言空草稿已经具备某种质量。' : '- 第一条应该是 overview，用自然语言给出总评。\n- finding 用于指出证据、逻辑、覆盖范围、表达清晰度或可行动性问题。'}
- proposal 只用于真正能被用户接受/忽略并应用到草稿的修改，不要把泛泛评价写成 proposal；没有可靠可应用修改时可以不提交 proposal。
- 需要核对原文时先用阅读工具读高亮所在段落。
- 工具返回错误时按提示修正后重新提交这一条。全部提交后只回复「已提交」，不要在正文里重复审阅内容。`;
}

function formatDiscussion(annotation: Annotation) {
  const comments = annotation.comments.filter((comment) => comment.content.trim());
  if (comments.length === 0) return '- 暂无';
  return comments
    .map((comment) => `- ${formatCommentAuthor(comment)}: ${comment.content}`)
    .join('\n');
}

function formatCommentAuthor(comment: Comment) {
  const name = annotationAuthorName(comment.author);
  return comment.author.nickname ? `${name} (@${comment.author.username})` : `@${name}`;
}
