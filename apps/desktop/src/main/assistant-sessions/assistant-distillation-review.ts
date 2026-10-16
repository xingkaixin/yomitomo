import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
  defineExtension,
  defineTool,
  type ConversationId,
  type Harness,
} from '@earendil-works/pi-durable';
import {
  buildDistillationReviewInput,
  buildDistillationReviewInstructions,
  DISTILLATION_REVIEW_TOOL,
  distillationReviewContentFromItems,
  distillationReviewItemParameters,
  distillationReviewProposalsFromItems,
  parseDistillationReviewItem,
} from '@yomitomo/ai';
import type {
  AgentMessagePayload,
  AnnotationDistillationReviewItem,
  ArticleTextSnapshot,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { AgentConversationsDoc } from './assistant-channel-docs';
import {
  agentChange,
  anchorBlockId,
  visibleRanges,
  type AssistantChannelPorts,
  type ResolvedChannelAgent,
} from './assistant-channel-runtime';
import { RunContextDoc } from './assistant-reading-extension';

const context = BACKGROUND_CONTEXT;

export type DistillationReviewRequest = {
  articleId: string;
  resolved: ResolvedChannelAgent;
  payload: AgentMessagePayload;
  onItem: (item: AnnotationDistillationReviewItem) => void;
  signal?: AbortSignal;
};

type ItemListener = (value: unknown) => string | undefined;

// Each review runs in a fork of the reviewer's own conversation in the article, so it shares what
// the reviewer already discussed there; items arrive one tool call at a time.
export function createDistillationReview(
  ports: Pick<AssistantChannelPorts, 'store' | 'articleText' | 'articleMeta'> & {
    registerProvider: (resolved: ResolvedChannelAgent) => Promise<void>;
  },
) {
  const listeners = new Map<ConversationId, ItemListener>();

  const extension = defineExtension({
    name: 'yomitomo-distillation-review',
    tools: [
      defineTool({
        name: DISTILLATION_REVIEW_TOOL,
        description: '提交一条沉淀审阅 item：overview、finding 或 proposal。每次调用提交一条。',
        parameters: distillationReviewItemParameters,
        replay: 'safe',
        execute: async (args, api) => {
          const error = listeners.get(api.conversationId)?.(args) ?? undefined;
          return {
            output: [{ type: 'text', text: error ?? '已记录。' }],
            isError: Boolean(error),
          };
        },
      }),
    ],
  });

  async function run(request: DistillationReviewRequest) {
    await ports.registerProvider(request.resolved);
    const text = await ports.articleText(request.articleId);
    return ports.store.use(request.articleId, async (harness) => {
      const fork = await openReview(harness, request, text);
      const items: AnnotationDistillationReviewItem[] = [];
      listeners.set(fork.id, (value) => {
        const parsed = parseDistillationReviewItem(value);
        if ('error' in parsed) return parsed.error;
        items.push(parsed.item);
        request.onItem(parsed.item);
        return undefined;
      });
      const abort = () => void fork.abort(context);
      request.signal?.addEventListener('abort', abort, { once: true });
      try {
        const anchor = request.payload.annotation.anchor;
        const submission = await fork.submit(
          {
            type: 'input',
            content: buildDistillationReviewInput(
              request.payload,
              text ? anchorBlockId(text, anchor) : undefined,
            ),
            requestId: makeId('distillation_review'),
          },
          context,
        );
        const settled = await submission.wait(context);
        if (request.signal?.aborted) throw new Error('AGENT_TASK_CANCELLED');
        if (settled.status !== 'done') throw new Error(settled.reason ?? 'review_unanswered');
        if (items.length === 0) throw new Error('Provider returned no distillation review items');
        return {
          items,
          content: distillationReviewContentFromItems(items),
          proposals: distillationReviewProposalsFromItems(items),
        };
      } finally {
        listeners.delete(fork.id);
        request.signal?.removeEventListener('abort', abort);
      }
    });
  }

  async function openReview(
    harness: Harness,
    request: DistillationReviewRequest,
    text: ArticleTextSnapshot | undefined,
  ) {
    const { agent } = request.resolved;
    const mainId = await harness.commit(async (tx) => {
      const agents = await tx.doc(AgentConversationsDoc);
      agents.conversations[agent.id] ??= (
        await tx.createConversation({ ownership: { kind: 'ownerless' } })
      ).id;
      return agents.conversations[agent.id];
    }, context);
    const main = await harness.conversation(mainId as ConversationId, context);
    const latest = main && (await main.entries({}, 1, undefined, context)).items[0];
    const anchor = request.payload.annotation.anchor;
    const meta = ports.articleMeta(request.articleId);
    const options = {
      ownership: { kind: 'ownerless' as const },
      agent: {
        ...agentChange(request.resolved),
        instructions: buildDistillationReviewInstructions(agent, request.payload),
        extensions: { add: [extension] },
      },
      init: async (
        tx: Parameters<NonNullable<Parameters<Harness['createConversation']>[0]['init']>>[0],
        id: ConversationId,
      ) => {
        Object.assign(await tx.doc(RunContextDoc, id), {
          articleId: request.articleId,
          articleTitle: meta?.title ?? '',
          agentId: agent.id,
          channelId: `distillation:${request.payload.annotation.id}`,
          visibleRanges: visibleRanges(text, anchor, meta),
          toolCalls: 0,
        });
      },
    };
    return main && latest
      ? main.fork(latest.id, options, context)
      : harness.createConversation(options, context);
  }

  return { extension, run };
}
