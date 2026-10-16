import { createHash } from 'node:crypto';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { createModels } from '@earendil-works/pi-ai/models';
import {
  LiveDoc,
  type AgentChange,
  type ConversationId,
  type EntryId,
  type Harness,
} from '@earendil-works/pi-durable';
import {
  buildChannelAgentInstructions,
  piModelRef,
  piProviderFor,
  piThinkingLevel,
} from '@yomitomo/ai';
import {
  annotationAgentAuthorRef,
  buildEpubReadingContextScope,
  createArticleTextIndex,
  prepareEpubBookIndex,
  selectionThreadSpoilerPolicy,
} from '@yomitomo/core';
import type {
  Agent,
  AgentReadingIntent,
  ArticleReadingProgress,
  ArticleTextSnapshot,
  AssistantChannel,
  AssistantDeliveryRequest,
  AssistantRunEvent,
  EpubBookIndex,
  LlmProvider,
  ReaderProgress,
  TextAnchor,
  UiLanguage,
} from '@yomitomo/shared';
import { resolveAgentPublicIdentity } from '@yomitomo/shared';
import {
  AgentConversationsDoc,
  ChannelCursorsDoc,
  ChannelRunsDoc,
  channelKey,
  cursorKey,
  type AssistantRunRecord,
} from './assistant-channel-docs';
import { formatDelivery, formatRetraction } from './assistant-channel-delivery';
import type { ChannelReply, ChannelSnapshot } from './assistant-channel-sources';
import { RunContextDoc } from './assistant-reading-extension';
import { resolveReplyLinks, type ReplyDiscussion } from './assistant-reply-links';
import { joinRunText, messageText, readRunTranscript } from './assistant-run-transcript';
import type { AssistantSessionStore } from './assistant-session-store';

const context = BACKGROUND_CONTEXT;
const PROGRESS_INTERVAL_MS = 150;
const MAIN_COMPACT_CHARS = 200_000;

export type ResolvedChannelAgent = {
  agent: Agent;
  provider: LlmProvider;
  uiLanguage: UiLanguage;
  fake: boolean;
};

type ArticleMeta = {
  title: string;
  ebookIndex?: EpubBookIndex;
  readingProgress?: ArticleReadingProgress;
};

export type AssistantChannelPorts = {
  store: AssistantSessionStore;
  articleText: (articleId: string) => Promise<ArticleTextSnapshot | undefined>;
  models: ReturnType<typeof createModels>;
  resolveAgent: (agentId: string, allowDisabled: boolean) => Promise<ResolvedChannelAgent>;
  readChannel: (articleId: string, channel: AssistantChannel) => ChannelSnapshot | undefined;
  publishReply: (articleId: string, channel: AssistantChannel, reply: ChannelReply) => boolean;
  existingMessageIds: (articleId: string, ids: string[]) => Set<string>;
  findDiscussion: (articleId: string, id: string) => ReplyDiscussion | undefined;
  articleMeta: (articleId: string) => ArticleMeta | undefined;
  publishRun: (event: AssistantRunEvent) => void;
  markPending: (articleId: string, pending: boolean) => Promise<void>;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

export type AssistantChannelRuntime = ReturnType<typeof createAssistantChannelRuntime>;

export function createAssistantChannelRuntime(ports: AssistantChannelPorts) {
  const locks = new Map<string, Promise<unknown>>();
  const active = new Map<string, AssistantRunEvent>();
  const watchers = new Map<string, () => void>();
  const tracked = new Set<string>();

  function serialize<T>(key: string, run: () => Promise<T>) {
    const previous = locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(run);
    locks.set(key, next);
    void next.finally(() => {
      if (locks.get(key) === next) locks.delete(key);
    });
    return next;
  }

  function publish(event: AssistantRunEvent) {
    if (event.status === 'running') active.set(event.runKey, event);
    else active.delete(event.runKey);
    ports.publishRun(event);
  }

  async function deliver(request: AssistantDeliveryRequest) {
    const resolved = await ports.resolveAgent(
      request.agentId,
      Boolean(request.allowDisabledAgentForRule),
    );
    await registerProvider(resolved);
    const text = await ports.articleText(request.articleId);
    const key = channelKey(request.channel);
    const requestId = `deliver:${request.agentId}:${request.triggerId}`;
    const runKey = await serialize(`${request.articleId}|${cursorKey(request.agentId, key)}`, () =>
      ports.store.use(request.articleId, (harness) =>
        startDelivery(harness, request, resolved, requestId, text),
      ),
    );
    if (runKey) {
      await ports.markPending(request.articleId, true);
      void track(request.articleId, requestId);
    }
    return { runKey };
  }

  async function startDelivery(
    harness: Harness,
    request: AssistantDeliveryRequest,
    resolved: ResolvedChannelAgent,
    requestId: string,
    text: ArticleTextSnapshot | undefined,
  ) {
    await reconcileRetractions(harness, request.articleId);
    const snapshot = ports.readChannel(request.articleId, request.channel);
    if (!snapshot) throw new Error('ASSISTANT_CHANNEL_NOT_FOUND');
    const { anchor, messages, quote } = snapshot;
    const cursor = cursorKey(request.agentId, request.channel);
    const state = await harness.commit(async (tx) => {
      const agents = await tx.doc(AgentConversationsDoc);
      let mainId = agents.conversations[request.agentId];
      if (mainId === undefined) {
        mainId = (await tx.createConversation({ ownership: { kind: 'ownerless' } })).id;
        agents.conversations[request.agentId] = mainId;
      }
      const cursors = await tx.doc(ChannelCursorsDoc);
      const delivered = new Set(cursors.delivered[cursor] ?? []);
      const fresh = messages.filter((message) => !delivered.has(message.id));
      cursors.delivered[cursor] = [...delivered, ...fresh.map((message) => message.id)];
      const runs = await tx.doc(ChannelRunsDoc);
      const existing = runs.runs[requestId];
      const live = Object.values(runs.runs).find(
        (run) =>
          run.agentId === request.agentId &&
          channelKey(run.channel) === channelKey(request.channel),
      );
      return { mainId, fresh, existing: existing?.forkId, liveForkId: live?.forkId };
    }, context);
    if (state.existing !== undefined) return runKeyFor(request.articleId, state.existing);
    if (state.fresh.length === 0 && !request.instruction && !request.reviewTargetCommentId) {
      return state.liveForkId === undefined
        ? undefined
        : runKeyFor(request.articleId, state.liveForkId);
    }

    const delivery = formatDelivery({
      agentId: request.agentId,
      channel: request.channel,
      quote,
      messages: state.fresh,
      anchorBlockId: text && anchor ? anchorBlockId(text, anchor) : undefined,
      instruction: request.instruction,
      readingIntent: request.readingIntent,
      reviewTargetCommentId: request.reviewTargetCommentId,
    });
    const record: AssistantRunRecord = {
      agentId: request.agentId,
      channel: request.channel,
      forkId: state.liveForkId ?? -1,
      delivery,
      deliveredIds: state.fresh.map((message) => message.id),
      readingIntent: request.readingIntent ?? null,
    };

    if (state.liveForkId !== undefined) {
      await harness.commit(async (tx) => {
        (await tx.doc(ChannelRunsDoc)).runs[requestId] = record;
      }, context);
      return runKeyFor(request.articleId, state.liveForkId);
    }

    const main = await harness.conversation(state.mainId as ConversationId, context);
    if (!main) throw new Error('ASSISTANT_SESSION_MISSING_AGENT');
    const latest = (await main.entries({}, 1, undefined, context)).items[0];
    const meta = ports.articleMeta(request.articleId);
    const options = {
      ownership: { kind: 'ownerless' as const },
      agent: agentChange(resolved),
      init: async (
        tx: Parameters<NonNullable<Parameters<Harness['createConversation']>[0]['init']>>[0],
        id: ConversationId,
      ) => {
        Object.assign(await tx.doc(RunContextDoc, id), {
          articleId: request.articleId,
          articleTitle: meta?.title ?? '',
          agentId: request.agentId,
          channelId: channelKey(request.channel),
          visibleRanges: visibleRanges(text, anchor, meta),
          toolCalls: 0,
        });
        (await tx.doc(ChannelRunsDoc)).runs[requestId] = { ...record, forkId: id };
      },
    };
    const fork = latest
      ? await main.fork(latest.id, options, context)
      : await harness.createConversation(options, context);
    return runKeyFor(request.articleId, fork.id);
  }

  async function track(articleId: string, requestId: string) {
    const trackKey = `${articleId}|${requestId}`;
    if (tracked.has(trackKey)) return;
    tracked.add(trackKey);
    try {
      await ports.store.use(articleId, async (harness) => {
        const run = (await harness.snapshot(ChannelRunsDoc, context))?.runs[requestId];
        if (!run) return;
        const fork = await harness.conversation(run.forkId as ConversationId, context);
        if (!fork) return dropRun(harness, articleId, requestId, run, 'fork_missing');
        await watchProgress(harness, articleId, run);
        const submission = await fork.submit(
          { type: 'input', content: run.delivery, whenBusy: 'steer', requestId },
          context,
        );
        const settled = await submission.wait(context);
        if (settled.status === 'done' && settled.type === 'input') {
          await serialize(`${articleId}|fork:${run.forkId}`, () =>
            finalizeAnswer(harness, articleId, run.forkId, settled.answer),
          );
        } else {
          await dropRun(harness, articleId, requestId, run, settled.reason ?? 'unanswered');
        }
      });
    } catch (error) {
      ports.logError('assistant_channel.run_failed', error, { articleId, requestId });
    } finally {
      tracked.delete(trackKey);
    }
  }

  async function finalizeAnswer(
    harness: Harness,
    articleId: string,
    forkId: number,
    answerId: EntryId,
  ) {
    const fork = await harness.conversation(forkId as ConversationId, context);
    const runs = (await harness.snapshot(ChannelRunsDoc, context))?.runs ?? {};
    if (!fork) return;
    const answered: Array<[string, AssistantRunRecord]> = [];
    for (const [requestId, run] of Object.entries(runs)) {
      if (run.forkId !== forkId) continue;
      const status = await (
        await fork.submit(
          { type: 'input', content: run.delivery, whenBusy: 'steer', requestId },
          context,
        )
      ).status(context);
      if (status.status === 'done' && status.answer === answerId) answered.push([requestId, run]);
    }
    const first = answered[0]?.[1];
    if (!first) return;

    const entry = (
      await fork.entries({ minEntryId: answerId, maxEntryId: answerId }, 1, undefined, context)
    ).items[0];
    const message = entry?.model?.find(
      (item): item is AssistantMessage => item.role === 'assistant',
    );
    const { text, steps } = await readRunTranscript(fork, answerId);
    const runKey = runKeyFor(articleId, forkId);
    if (!message || !text) {
      for (const [requestId, run] of answered)
        await dropRun(harness, articleId, requestId, run, 'empty_answer');
      return;
    }

    const content = resolveReplyLinks(text, await ports.articleText(articleId), (id) =>
      ports.findDiscussion(articleId, id),
    );
    const resolved = await ports.resolveAgent(first.agentId, true).catch(() => undefined);
    const hash = createHash('sha256').update(`${articleId}:${forkId}:${answerId}`).digest('hex');
    const commentId = `${first.channel.kind === 'chat' ? 'reader_chat_message' : 'comment'}_${hash.slice(0, 24)}`;
    const saved = ports.publishReply(articleId, first.channel, {
      id: commentId,
      author: resolved
        ? annotationAgentAuthorRef(resolveAgentPublicIdentity(resolved.agent, resolved.uiLanguage))
        : { kind: 'agent', agentId: first.agentId, username: first.agentId },
      content,
      createdAt: new Date().toISOString(),
      ...(first.readingIntent ? { readingIntent: first.readingIntent as AgentReadingIntent } : {}),
      ...(steps.length > 0 ? { assistantProgress: { steps } } : {}),
    });

    const mainId = (await harness.snapshot(AgentConversationsDoc, context))?.conversations[
      first.agentId
    ];
    const main =
      mainId === undefined
        ? undefined
        : await harness.conversation(mainId as ConversationId, context);
    if (main) {
      const delivered = answered.map(([, run]) => run.delivery).join('\n\n');
      await (
        await main.submit(
          {
            type: 'write',
            requestId: `exchange:${forkId}:${answerId}`,
            entry: {
              kind: 'yomitomo.exchange',
              data: { channel: channelKey(first.channel), commentId: saved ? commentId : null },
              model: [
                { role: 'user', content: delivered, timestamp: Date.now() },
                { ...message, content: [{ type: 'text', text }] },
              ],
            },
          },
          context,
        )
      ).wait(context);
    }

    const remaining = await harness.commit(async (tx) => {
      const cursors = await tx.doc(ChannelCursorsDoc);
      const cursor = cursorKey(first.agentId, first.channel);
      if (saved) {
        cursors.delivered[cursor] = [...(cursors.delivered[cursor] ?? []), commentId];
        if (first.channel.kind === 'annotation') {
          cursors.delivered[cursorKey(first.agentId, `thread:${commentId}`)] = [commentId];
        }
      }
      const state = await tx.doc(ChannelRunsDoc);
      for (const [requestId] of answered) delete state.runs[requestId];
      return Object.keys(state.runs).length;
    }, context);
    if (remaining === 0) await ports.markPending(articleId, false);
    stopProgress(runKey);
    publish({
      runKey,
      articleId,
      agentId: first.agentId,
      channel: first.channel,
      status: saved ? 'done' : 'failed',
      text: content,
      steps,
      ...(saved ? { commentId } : { error: 'channel_deleted' }),
    });
    if (main && resolved) await compactWhenLarge(main, resolved);
  }

  async function dropRun(
    harness: Harness,
    articleId: string,
    requestId: string,
    run: AssistantRunRecord,
    reason: string,
  ) {
    const remaining = await harness.commit(async (tx) => {
      const cursors = await tx.doc(ChannelCursorsDoc);
      const cursor = cursorKey(run.agentId, run.channel);
      const failed = new Set(run.deliveredIds);
      cursors.delivered[cursor] = (cursors.delivered[cursor] ?? []).filter((id) => !failed.has(id));
      const state = await tx.doc(ChannelRunsDoc);
      delete state.runs[requestId];
      return Object.keys(state.runs).length;
    }, context);
    if (remaining === 0) await ports.markPending(articleId, false);
    const runKey = runKeyFor(articleId, run.forkId);
    stopProgress(runKey);
    publish({
      runKey,
      articleId,
      agentId: run.agentId,
      channel: run.channel,
      status: 'failed',
      text: active.get(runKey)?.text ?? '',
      steps: active.get(runKey)?.steps ?? [],
      error: reason,
    });
  }

  async function watchProgress(harness: Harness, articleId: string, run: AssistantRunRecord) {
    const runKey = runKeyFor(articleId, run.forkId);
    if (watchers.has(runKey)) return;
    const fork = await harness.conversation(run.forkId as ConversationId, context);
    if (!fork) return;
    const state = await harness.documentState(LiveDoc, run.forkId as ConversationId, context);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let emitting = false;
    let again = false;
    const publishProgress = async () => {
      const transcript = await readRunTranscript(fork);
      if (!watchers.has(runKey)) return;
      // Read after the entries: a partial committed meanwhile is gone from the live doc, not doubled.
      const partial = state?.value?.generation?.message as AssistantMessage | undefined;
      publish({
        runKey,
        articleId,
        agentId: run.agentId,
        channel: run.channel,
        status: 'running',
        text: joinRunText([transcript.text, partial ? messageText(partial) : '']),
        steps: transcript.steps,
      });
    };
    // Reads are async, so overlapping emits collapse into one follow-up read.
    const emit = () => {
      timer = undefined;
      if (emitting) {
        again = true;
        return;
      }
      emitting = true;
      void (async () => {
        do {
          again = false;
          await publishProgress().catch((error: unknown) => {
            ports.logError('assistant_channel.progress_failed', error, { articleId, runKey });
          });
        } while (again);
        emitting = false;
      })();
    };
    const unsubscribe = state?.subscribe(() => {
      timer ??= setTimeout(emit, PROGRESS_INTERVAL_MS);
    });
    watchers.set(runKey, () => {
      clearTimeout(timer);
      unsubscribe?.();
      state?.dispose();
    });
    emit();
  }

  function stopProgress(runKey: string) {
    watchers.get(runKey)?.();
    watchers.delete(runKey);
  }

  async function reconcileRetractions(harness: Harness, articleId: string) {
    const cursors = (await harness.snapshot(ChannelCursorsDoc, context))?.delivered ?? {};
    const deliveredIds = [...new Set(Object.values(cursors).flat())];
    if (deliveredIds.length === 0) return;
    const existing = ports.existingMessageIds(articleId, deliveredIds);
    const removedByAgent = new Map<string, string[]>();
    for (const [key, ids] of Object.entries(cursors)) {
      const removed = ids.filter((id) => !existing.has(id));
      if (removed.length === 0) continue;
      const agentId = key.slice(0, key.indexOf('|'));
      removedByAgent.set(agentId, [...(removedByAgent.get(agentId) ?? []), ...removed]);
    }
    if (removedByAgent.size === 0) return;
    const conversations =
      (await harness.snapshot(AgentConversationsDoc, context))?.conversations ?? {};
    for (const [agentId, removed] of removedByAgent) {
      const mainId = conversations[agentId];
      const main =
        mainId === undefined
          ? undefined
          : await harness.conversation(mainId as ConversationId, context);
      await main?.submit(
        {
          type: 'write',
          entry: {
            kind: 'yomitomo.retraction',
            data: { messageIds: removed },
            model: [{ role: 'user', content: formatRetraction(removed), timestamp: Date.now() }],
          },
        },
        context,
      );
    }
    await harness.commit(async (tx) => {
      const doc = await tx.doc(ChannelCursorsDoc);
      for (const [key, ids] of Object.entries(doc.delivered)) {
        doc.delivered[key] = ids.filter((id) => existing.has(id));
      }
    }, context);
  }

  async function resume(articleId: string, harness: Harness) {
    const runs = (await harness.snapshot(ChannelRunsDoc, context))?.runs ?? {};
    for (const [requestId, run] of Object.entries(runs)) {
      const resolved = await ports.resolveAgent(run.agentId, true).catch((error: unknown) => {
        ports.logError('assistant_channel.resume_agent_failed', error, { articleId, requestId });
        return undefined;
      });
      if (resolved) await registerProvider(resolved);
      void track(articleId, requestId);
    }
  }

  async function registerProvider(resolved: ResolvedChannelAgent) {
    if (resolved.fake) {
      ports.models.setProvider(await e2eFakeProvider(resolved));
      return;
    }
    ports.models.setProvider(piProviderFor(resolved.provider, resolved.agent));
  }

  async function compactWhenLarge(
    main: NonNullable<Awaited<ReturnType<Harness['conversation']>>>,
    resolved: ResolvedChannelAgent,
  ) {
    const view = await main.context(context);
    if (JSON.stringify(view.messages).length < MAIN_COMPACT_CHARS) return;
    await main.configure({ model: piModelRef(resolved.provider, resolved.agent) }, context);
    await main.compact(undefined, context).catch((error: unknown) => {
      ports.logError('assistant_channel.compact_failed', error);
    });
  }

  return {
    deliver,
    resume,
    activeRuns: (articleId: string) =>
      [...active.values()].filter((event) => event.articleId === articleId),
  };
}

function agentChange(resolved: ResolvedChannelAgent): AgentChange {
  const thinkingLevel = piThinkingLevel(resolved.provider.reasoningEffort);
  return {
    model: piModelRef(resolved.provider, resolved.agent),
    ...(thinkingLevel ? { thinkingLevel } : {}),
    instructions: buildChannelAgentInstructions(resolved.agent, resolved.uiLanguage),
  };
}

function runKeyFor(articleId: string, forkId: number) {
  return `${articleId}:${forkId}`;
}

function anchorOffset(text: string, anchor: TextAnchor) {
  const start = anchor.textStartInBook ?? anchor.start;
  if (text.slice(start, start + anchor.exact.length) === anchor.exact) return start;
  const found = text.indexOf(anchor.exact);
  return found >= 0 ? found : undefined;
}

function anchorBlockId(snapshot: ArticleTextSnapshot, anchor: TextAnchor) {
  const offset = anchorOffset(snapshot.text, anchor);
  return offset === undefined ? undefined : createArticleTextIndex(snapshot).blockAt(offset)?.id;
}

function visibleRanges(
  text: ArticleTextSnapshot | undefined,
  anchor: TextAnchor | undefined,
  meta: ArticleMeta | undefined,
) {
  if (!meta?.ebookIndex || !text) return null;
  const prepared = prepareEpubBookIndex(meta.ebookIndex);
  return buildEpubReadingContextScope(prepared, {
    articleText: text.text,
    targetAnchor: anchor,
    readerProgress: anchor ? undefined : readerProgress(prepared, meta.readingProgress),
    spoilerPolicy: selectionThreadSpoilerPolicy,
  }).textRanges;
}

// A question without a selection is scoped by how far the reader has read the book.
function readerProgress(
  prepared: ReturnType<typeof prepareEpubBookIndex>,
  progress: ArticleReadingProgress | undefined,
): ReaderProgress | undefined {
  if (progress?.kind !== 'chapter') return undefined;
  const chapter = prepared.chapters().find((item) => item.indexInBook === progress.chapterIndex);
  if (!chapter) return undefined;
  const readUntil = chapter.textStart + Math.round(progress.chapterProgress * chapter.textLength);
  return {
    currentChapterId: chapter.id,
    currentSegmentId: prepared.locateOffset(readUntil)?.segment.id,
    readChapterIds: prepared.chaptersBefore(chapter),
    readUntilTextOffset: readUntil,
  };
}

async function e2eFakeProvider(resolved: ResolvedChannelAgent) {
  const { fauxAssistantMessage, fauxProvider } =
    await import('@earendil-works/pi-ai/providers/faux');
  const ref = piModelRef(resolved.provider, resolved.agent);
  const faux = fauxProvider({ provider: ref.provider, models: [{ id: ref.modelId }] });
  const reply = (input: { messages: readonly { role: string; content: unknown }[] }) => {
    const last = input.messages.findLast((message) => message.role === 'user');
    const text = typeof last?.content === 'string' ? last.content : '';
    return fauxAssistantMessage(`RD-795 fake AI response.\n${text}`);
  };
  faux.setResponses(Array.from({ length: 64 }, () => reply));
  return faux.provider;
}
