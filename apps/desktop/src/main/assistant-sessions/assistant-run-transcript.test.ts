import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, type Conversation } from '@earendil-works/pi-durable';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunContextDoc, createAssistantReadingExtension } from './assistant-reading-extension';
import { readRunTranscript } from './assistant-run-transcript';
import { createAssistantSessionStore } from './assistant-session-store';

let directory = '';

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function runTurns(responses: ReturnType<typeof fauxAssistantMessage>[], inputs: string[]) {
  directory = await mkdtemp(join(tmpdir(), 'assistant-run-transcript-'));
  const models = createModels();
  const registry = createRegistry();
  registry.install(
    createAssistantReadingExtension({
      articleText: async () => ({ text: '第一段。\n\n第二段讲选择压力。', sections: [] }),
      searchMemory: () => [],
      annotations: () => [],
      agentName: () => undefined,
    }),
  );
  const faux = fauxProvider({ provider: 'faux', models: [{ id: 'model' }] });
  models.setProvider(faux.provider);
  faux.setResponses(responses);
  const store = createAssistantSessionStore({
    directory,
    harnessOptions: () => ({ models, registry }),
    logError: vi.fn(),
  });
  const transcripts = await store.use('article_1', async (harness) => {
    const conversation: Conversation = await harness.createConversation(
      {
        ownership: { kind: 'ownerless' },
        agent: { model: { provider: 'faux', modelId: 'model' } },
        init: async (tx, id) => {
          Object.assign(await tx.doc(RunContextDoc, id), {
            articleId: 'article_1',
            visibleRanges: [{ textStart: 0, textEnd: 100 }],
          });
        },
      },
      BACKGROUND_CONTEXT,
    );
    const results = [];
    for (const content of inputs) {
      const submission = await conversation.submit({ type: 'input', content }, BACKGROUND_CONTEXT);
      const settled = await submission.wait(BACKGROUND_CONTEXT);
      if (settled.status !== 'done' || settled.type !== 'input') throw new Error('unanswered');
      results.push(await readRunTranscript(conversation, settled.answer));
    }
    return results;
  });
  await store.dispose();
  return transcripts;
}

describe('readRunTranscript', () => {
  it('keeps text written before a tool call and records the call as a step', async () => {
    const [transcript] = await runTurns(
      [
        fauxAssistantMessage(
          [fauxText('我先读一下原文。'), fauxToolCall('read_article', { aroundBlockId: 'b2' })],
          { stopReason: 'toolUse' },
        ),
        fauxAssistantMessage('第二段在讲选择压力。'),
      ],
      ['这段在讲什么？'],
    );

    expect(transcript).toEqual({
      text: '我先读一下原文。\n\n第二段在讲选择压力。',
      steps: [{ id: expect.any(String), label: 'read_article', status: 'done' }],
    });
  });

  it('starts after the previous answer of the same conversation', async () => {
    const [, second] = await runTurns(
      [fauxAssistantMessage('第一次回答。'), fauxAssistantMessage('第二次回答。')],
      ['第一个问题', '第二个问题'],
    );

    expect(second).toEqual({ text: '第二次回答。', steps: [] });
  });
});
