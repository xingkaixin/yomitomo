import { describe, expect, it } from 'vitest';
import type { Agent, AgentAnnotatePayload, LlmProvider } from '@yomitomo/shared';
import { buildAgentAnnotationPrompt } from './agent-annotation';

const provider: LlmProvider = {
  id: 'provider-1',
  name: 'Provider',
  type: 'openai-chat',
  baseUrl: 'https://example.test',
  apiKey: 'key',
  modelName: 'model',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const agent: Agent = {
  id: 'agent-1',
  kind: 'annotation',
  providerId: provider.id,
  enabled: true,
  nickname: '林知微',
  username: 'lin',
  avatar: '',
  annotationColor: '#6fa48f',
  annotationDensity: 'medium',
  temperature: 0.35,
  soul: '你是林知微。',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const article = {
  title: '测试文章',
  url: 'https://example.test/article',
  text: '开头。目标观点值得讨论。结尾。',
};

const cases: Array<{
  name: string;
  payload: AgentAnnotatePayload;
  expectedRules: string[];
}> = [
  {
    name: 'reading-plan',
    payload: {
      agentId: agent.id,
      agentUsername: agent.username,
      article,
      readingPlan: [
        {
          sectionId: 'section-1',
          sectionTitle: '第一节',
          sectionStart: 0,
          sectionEnd: article.text.length,
          readingIntent: 'challenge',
          messages: [{ content: '检查论据是否充分' }],
        },
      ],
    },
    expectedRules: [
      'exact：必须是对应 sectionText 中的连续原文，逐字一致',
      'readingIntent：章节 readingIntent 有值时必须等于该值',
      '结合章节内容、读者留言和你的角色判断',
      '跳过已被已有批注或 memory_view 充分覆盖的原文位置',
    ],
  },
  {
    name: 'selection',
    payload: {
      agentId: agent.id,
      agentUsername: agent.username,
      article,
      readingIntent: 'explain',
      annotationType: 'concept',
      instruction: '解释这个概念',
      targetAnchor: {
        start: 3,
        end: 11,
        exact: '目标观点值得讨论',
        prefix: '开头。',
        suffix: '。结尾。',
      },
    },
    expectedRules: [
      'exact：必须等于目标选区原文，逐字一致',
      'type：使用本轮批注类型',
      'readingIntent：必须等于本轮阅读动作的值',
      '按本轮阅读动作和读者指导写给读者的批注评论',
    ],
  },
  {
    name: 'whole-article',
    payload: {
      agentId: agent.id,
      agentUsername: agent.username,
      article,
      readingIntent: 'question',
    },
    expectedRules: [
      'exact：必须是文章中的连续原文片段，逐字一致',
      'prefix：exact 前方 10-40 个字，来自文章原文',
      'type：只允许 key_point、assumption、concept、question、quote',
      '只挑符合本轮阅读动作且有讨论价值的文本',
    ],
  },
];

describe('agent annotation prompts', () => {
  it.each(cases)('shares canonical semantics for $name output', ({ payload, expectedRules }) => {
    const jsonPrompt = buildAgentAnnotationPrompt('json', { provider, payload, agent });
    const ndjsonPrompt = buildAgentAnnotationPrompt('ndjson', { provider, payload, agent });
    const jsonSections = promptSections(jsonPrompt);
    const ndjsonSections = promptSections(ndjsonPrompt);

    expect(jsonSections.canonical).toBe(ndjsonSections.canonical);
    for (const rule of expectedRules) {
      expect(jsonSections.canonical).toContain(rule);
    }

    expect(jsonSections.framing).toContain('JSON 数组');
    expect(jsonSections.framing).not.toContain('NDJSON');
    expect(ndjsonSections.framing).toContain('NDJSON');
    expect(ndjsonSections.framing).not.toContain('JSON 数组');
    expect(jsonSections.framing).not.toContain('key_point');
    expect(ndjsonSections.framing).not.toContain('key_point');
  });
});

function promptSections(prompt: string) {
  const [canonical, framing] = prompt.split('\n\n## 输出格式\n');
  if (!canonical || !framing) throw new Error('annotation prompt sections are incomplete');
  return { canonical, framing };
}
