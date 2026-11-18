import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry } from '@earendil-works/pi-durable';
import { expect, it } from 'vitest';
import type { Annotation } from '../../../../../packages/shared/src/annotation-types';
import { readingMemoryEntryFromAnnotation } from '../../../../../packages/core/src/reading-memory/reading-memory-entries';
import { createAssistantSessionStore } from '../../../../../apps/desktop/src/main/assistant-sessions/assistant-session-store';
import { createAssistantReadingExtension, RunContextDoc } from '../../../../../apps/desktop/src/main/assistant-sessions/assistant-reading-extension';

const visible = '第一章：这是已经读到的内容。';
const future = '后文章节唯一标记：FUTURE_PLOT_SENTINEL。';
const text = `${visible}\n\n${future}`;
const timestamp = '2026-11-16T00:00:00.000Z';
const annotation: Annotation = {
  id: 'annotation_future',
  anchor: { exact: future, prefix: '', suffix: '', start: visible.length + 2, end: text.length },
  author: { kind: 'user', username: 'synthetic-reader' },
  color: '#888888',
  comments: [{
    id: 'comment_future',
    author: { kind: 'user', username: 'synthetic-reader' },
    content: '这是后文章节的既有讨论：FUTURE_DISCUSSION_SENTINEL。',
    createdAt: timestamp,
  }],
  createdAt: timestamp,
  updatedAt: timestamp,
};

async function invoke(name: string, args: Record<string, string>) {
  const directory = await mkdtemp(join(tmpdir(), 'ryugi-reading-scope-'));
  const models = createModels();
  const registry = createRegistry();
  const memory = readingMemoryEntryFromAnnotation({ articleId: 'synthetic_article', annotation });
  if (!memory) throw new Error('Synthetic fixture did not produce a reading entry');
  const reading = createAssistantReadingExtension({
    articleText: async () => ({
      text,
      sections: [
        { id: 'c1', title: '第一章', start: 0, end: visible.length },
        { id: 'c2', title: '后文章节', start: visible.length + 2, end: text.length },
      ],
    }),
    searchMemory: () => [memory],
    annotations: () => [annotation],
    agentName: () => undefined,
  });
  registry.install(reading);
  const faux = fauxProvider({ provider: 'faux', models: [{ id: 'model' }] });
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: 'toolUse' }),
    fauxAssistantMessage('探针结束。这不是语义质量评测。'),
  ]);
  const store = createAssistantSessionStore({
    directory,
    harnessOptions: () => ({ models, registry, settings: { extensions: [reading] } }),
    logError: (_event, error) => { throw error; },
  });
  try {
    return await store.use('synthetic_article', async (harness) => {
      const conversation = await harness.createConversation({
        ownership: { kind: 'ownerless' },
        agent: { model: { provider: 'faux', modelId: 'model' } },
        init: async (tx, id) => {
          Object.assign(await tx.doc(RunContextDoc, id), {
            articleId: 'synthetic_article',
            articleTitle: '合成两章样本',
            agentId: 'synthetic_agent',
            channelId: 'chat:synthetic',
            visibleRanges: [{ textStart: 0, textEnd: visible.length }],
            toolCalls: 0,
          });
        },
      }, BACKGROUND_CONTEXT);
      const submission = await conversation.submit({ type: 'input', content: '检查当前可读范围。' }, BACKGROUND_CONTEXT);
      const settled = await submission.wait(BACKGROUND_CONTEXT);
      expect(settled.status).toBe('done');
      const entries = await conversation.entries({}, 50, undefined, BACKGROUND_CONTEXT);
      const results = entries.items.flatMap((entry) => entry.model ?? []).filter((message) => message.role === 'toolResult');
      expect(results).toHaveLength(1);
      const result = results[0];
      const output = result.content.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n');
      return {
        tool: name,
        args,
        visibleRanges: [{ textStart: 0, textEnd: visible.length }],
        futureAnchor: { start: annotation.anchor.start, end: annotation.anchor.end },
        isError: result.isError,
        output,
        exposesFuture: output.includes('FUTURE_PLOT_SENTINEL') || output.includes('FUTURE_DISCUSSION_SENTINEL'),
      };
    });
  } finally {
    await store.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}

it('records how each real reading tool applies the same visible range', async () => {
  const observations = [
    await invoke('read_article', { sectionId: 'c2' }),
    await invoke('search_article', { query: '后文章节' }),
    await invoke('search_reading_memory', { query: '后文章节' }),
    await invoke('read_thread', { annotationId: annotation.id }),
  ];
  await writeFile(new URL('./reading-scope-observations.json', import.meta.url), `${JSON.stringify({
    mode: 'Synthetic tool execution through the real pi-durable harness; fixed faux responses, no remote model',
    interpretation: 'Current-behavior investigation, not a production regression specification',
    observations,
  }, null, 2)}\n`);
  expect(observations[0].exposesFuture).toBe(false);
  expect(observations[1].exposesFuture).toBe(false);
  console.log(JSON.stringify(observations.map(({ tool, exposesFuture }) => ({ tool, exposesFuture }))));
});
