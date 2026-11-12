import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import { createRegistry } from '@earendil-works/pi-durable';
import { piModelRef } from '@yomitomo/ai';
import type {
  Agent,
  AgentMessagePayload,
  AnnotationDistillationReviewItem,
  LlmProvider,
} from '@yomitomo/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { createDistillationReview } from './assistant-distillation-review';
import { createAssistantSessionStore } from './assistant-session-store';

let directory = '';

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('collects review items from tool calls and returns invalid items to the model', async () => {
  directory = await mkdtemp(join(tmpdir(), 'distillation-review-'));
  const models = createModels();
  const registry = createRegistry();
  const store = createAssistantSessionStore({
    directory,
    harnessOptions: () => ({ models, registry, settings: { extensions: [] } }),
    logError: vi.fn(),
  });
  const review = createDistillationReview({
    store,
    articleText: async () => ({ text: '第一段。\n\n第二段证据。', sections: [] }),
    findDiscussion: (articleId, id) =>
      id === 'comment_1' ? { annotationId: 'annotation_1', quote: '原文' } : undefined,
    articleMeta: () => ({ title: 'Article' }),
    registerProvider: async () => models.setProvider(faux.provider),
  });
  registry.install(review.extension);
  const resolved = { agent, provider, uiLanguage: 'zh-CN' as const, fake: false };
  const ref = piModelRef(provider, agent);
  const faux = fauxProvider({ provider: ref.provider, models: [{ id: ref.modelId }] });
  const toolResults: string[] = [];
  faux.setResponses([
    fauxAssistantMessage(
      [
        fauxToolCall('add_review_item', {
          type: 'overview',
          stance: 'mixed',
          content: '证据见 b1-b2。',
        }),
        fauxToolCall('add_review_item', { type: 'proposal', kind: 'replace', title: '改写' }),
      ],
      { stopReason: 'toolUse' },
    ),
    (context) => {
      for (const message of context.messages) {
        if (message.role !== 'toolResult') continue;
        for (const part of message.content) if (part.type === 'text') toolResults.push(part.text);
      }
      return fauxAssistantMessage(
        [
          fauxToolCall('add_review_item', {
            type: 'proposal',
            kind: 'insert',
            title: '补证据',
            content: '补一条证据，见 b2。',
          }),
          fauxToolCall('add_review_item', {
            type: 'proposal',
            kind: 'replace',
            title: '修正判断',
            targetText: '草稿 b2 中的判断。',
            insertAfterText: '草稿 b1。',
            replacementText: '参见[原文证据](#b2)和 comment_1。',
            rationale: 'b2 需要核对。',
          }),
        ],
        { stopReason: 'toolUse' },
      );
    },
    fauxAssistantMessage('已提交'),
  ]);
  const streamed: AnnotationDistillationReviewItem[] = [];
  const onItem = (item: AnnotationDistillationReviewItem) => streamed.push(item);

  const result = await review.run({ articleId: 'article_1', resolved, payload, onItem });

  expect(result.items.map((item) => item.type)).toEqual(['overview', 'proposal', 'proposal']);
  expect(result.items[0]).toMatchObject({ content: '证据见 [「第一段。」](#passage:0-12)。' });
  expect(result.proposals).toEqual([
    expect.objectContaining({
      kind: 'insert',
      content: '补一条证据，见 [「第二段证据。」](#passage:6-12)。',
    }),
    expect.objectContaining({
      kind: 'replace',
      targetText: '草稿 b2 中的判断。',
      insertAfterText: '草稿 b1。',
      replacementText: '参见[原文证据](#passage:6-12)和 [「原文」](#discussion:annotation_1)。',
      rationale: '[「第二段证据。」](#passage:6-12) 需要核对。',
    }),
  ]);
  expect(streamed).toEqual(result.items);
  expect(toolResults).toEqual(['已记录。', expect.stringContaining('proposal fields')]);
  await store.dispose();
});

const agent = {
  id: 'agent_review',
  username: 'reviewer',
  nickname: 'Reviewer',
  temperature: 0.3,
  soul: '',
} as Agent;

const provider: LlmProvider = {
  id: 'provider_1',
  name: 'Provider',
  type: 'openai-chat',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'key',
  modelName: 'model',
  createdAt: '',
  updatedAt: '',
};

const payload = {
  agentUsername: 'reviewer',
  responseMode: 'distillation_review',
  distillationDraft: '草稿',
  article: { id: 'article_1', title: 'Article', url: '', text: '' },
  annotation: { id: 'annotation_1', anchor: { exact: '原文' }, comments: [] },
  userComment: { id: 'comment_1', content: '请审阅', author: { kind: 'user', username: 'reader' } },
} as unknown as AgentMessagePayload;
