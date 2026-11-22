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
  type Tx,
} from '@earendil-works/pi-durable';
import {
  buildChannelAgentInstructions,
  piModelRef,
  piProviderFor,
  piThinkingLevel,
  type PiModelRef,
} from '@yomitomo/ai';
import { annotationAgentAuthorRef, createArticleTextIndex } from '@yomitomo/core';
import type {
  Agent,
  ArticleReadingProgress,
  ArticleTextSnapshot,
  AssistantCancelRequest,
  AssistantChannel,
  AssistantDeliveryRequest,
  AssistantRunEvent,
  EpubBookIndex,
  LlmProvider,
  TextAnchor,
  UiLanguage,
} from '@yomitomo/shared';
import { isChatGptOAuthProvider, resolveAgentPublicIdentity } from '@yomitomo/shared';
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
import { visibleRanges } from './assistant-readable-ranges';
import { RunContextDoc } from './assistant-reading-extension';
import { resolveReplyLinksAsync, type ReplyDiscussion } from './assistant-reply-links';
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

export type ChannelAgentIdentity = Pick<ResolvedChannelAgent, 'agent' | 'uiLanguage'> & {
  provider?: LlmProvider;
};

type ArticleMeta = {
  title: string;
  ebookIndex?: EpubBookIndex;
  readingProgress?: ArticleReadingProgress;
};

type MaybePromise<T> = T | Promise<T>;

export type AssistantChannelPorts = {
  store: AssistantSessionStore;
  articleText: (articleId: string) => Promise<ArticleTextSnapshot | undefined>;
  models: ReturnType<typeof createModels>;
  resolveAgent: (agentId: string, allowDisabled: boolean) => Promise<ResolvedChannelAgent>;
  resolveAgentIdentity: (agentId: string) => Promise<ChannelAgentIdentity>;
  resolveProviderApiKey?: (provider: LlmProvider) => Promise<string>;
  readChannel: (
    articleId: string,
    channel: AssistantChannel,
  ) => MaybePromise<ChannelSnapshot | undefined>;
  publishReply: (
    articleId: string,
    channel: AssistantChannel,
    reply: ChannelReply,
  ) => MaybePromise<boolean>;
  existingMessageIds: (articleId: string, ids: string[]) => MaybePromise<Set<string>>;
  findDiscussion: (articleId: string, id: string) => MaybePromise<ReplyDiscussion | undefined>;
  articleMeta: (articleId: string) => MaybePromise<ArticleMeta | undefined>;
  publishRun: (event: AssistantRunEvent) => void;
  markPending: (articleId: string, pending: boolean) => Promise<void>;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

type ProgressWatcher = {
  stop: () => void;
  emit: () => void;
};

export function createAssistantChannelRuntime(ports: AssistantChannelPorts) {
  const locks = new Map<string, Promise<unknown>>();
  const active = new Map<string, AssistantRunEvent>();
  const watchers = new Map<string, ProgressWatcher>();
  const tracked = new Set<string>();

  function serialize<T>(key: string, run: () => Promise<T>) {
    const previous = locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(run);
    locks.set(key, next);
    const cleanup = () => {
      if (locks.get(key) === next) locks.delete(key);
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  function channelLockKey(articleId: string, agentId: string, channel: AssistantChannel | string) {
    return `${articleId}|${cursorKey(agentId, channel)}`;
  }

  function syncPendingMarker(harness: Harness, articleId: string) {
    return serialize(`${articleId}|pending`, async () => {
      const runs = (await harness.snapshot(ChannelRunsDoc, context))?.runs ?? {};
      await ports.markPending(articleId, Object.keys(runs).length > 0);
    });
  }

  function syncSettledMarker(harness: Harness, articleId: string) {
    // The committed run already settled; a stale restart marker can be repaired on reopen.
    return syncPendingMarker(harness, articleId).catch((error: unknown) =>
      ports.logError('assistant_channel.pending_marker_failed', error, { articleId }),
    );
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
    const started = await serialize(channelLockKey(request.articleId, request.agentId, key), () =>
      ports.store.use(request.articleId, (harness) =>
        startDelivery(harness, request, resolved, requestId, text),
      ),
    );
    if (started?.shouldTrack) void track(request.articleId, requestId);
    return { runKey: started?.runKey, deliveryId: started?.deliveryId };
  }

  async function startDelivery(
    harness: Harness,
    request: AssistantDeliveryRequest,
    resolved: ResolvedChannelAgent,
    requestId: string,
    text: ArticleTextSnapshot | undefined,
  ): Promise<{ deliveryId: string; runKey: string; shouldTrack: boolean } | undefined> {
    await reconcileRetractions(harness, request.articleId);
    const snapshot = await ports.readChannel(request.articleId, request.channel);
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
      const runs = await tx.doc(ChannelRunsDoc);
      const existing = runs.runs[requestId];
      const live = Object.entries(runs.runs).find(
        ([, run]) =>
          run.agentId === request.agentId &&
          channelKey(run.channel) === channelKey(request.channel),
      );
      return {
        mainId,
        fresh,
        existing: existing?.forkId,
        liveForkId: live?.[1].forkId,
        liveRequestId: live?.[0],
      };
    }, context);
    if (state.existing !== undefined) {
      await syncPendingMarker(harness, request.articleId);
      return {
        runKey: runKeyFor(request.articleId, state.existing),
        deliveryId: requestId,
        shouldTrack: true,
      };
    }
    if (state.fresh.length === 0 && !request.instruction && !request.reviewTargetCommentId) {
      if (state.liveForkId === undefined || !state.liveRequestId) return undefined;
      await syncPendingMarker(harness, request.articleId);
      return {
        runKey: runKeyFor(request.articleId, state.liveForkId),
        deliveryId: state.liveRequestId,
        shouldTrack: false,
      };
    }

    const delivery = formatDelivery({
      agentId: request.agentId,
      channel: request.channel,
      quote,
      messages: state.fresh,
      anchorBlockId: text && anchor ? anchorBlockId(text, anchor) : undefined,
      instruction: request.instruction,
      reviewTargetCommentId: request.reviewTargetCommentId,
    });
    const deliveredIds = state.fresh.map((message) => message.id);
    async function recordDelivery(tx: Tx, forkId: number) {
      const cursors = await tx.doc(ChannelCursorsDoc);
      cursors.delivered[cursor] = [
        ...new Set([...(cursors.delivered[cursor] ?? []), ...deliveredIds]),
      ];
      (await tx.doc(ChannelRunsDoc)).runs[requestId] = {
        agentId: request.agentId,
        channel: request.channel,
        forkId,
        delivery,
        deliveredIds,
      };
    }

    const { liveForkId } = state;
    if (liveForkId !== undefined) {
      await harness.commit((tx) => recordDelivery(tx, liveForkId), context);
      await syncPendingMarker(harness, request.articleId);
      return {
        runKey: runKeyFor(request.articleId, liveForkId),
        deliveryId: requestId,
        shouldTrack: true,
      };
    }

    const main = await harness.conversation(state.mainId as ConversationId, context);
    if (!main) throw new Error('ASSISTANT_SESSION_MISSING_AGENT');
    const latest = (await main.entries({}, 1, undefined, context)).items[0];
    const meta = await ports.articleMeta(request.articleId);
    const options = {
      ownership: { kind: 'ownerless' as const },
      agent: agentChange(resolved),
      init: async (tx: Tx, id: ConversationId) => {
        Object.assign(await tx.doc(RunContextDoc, id), {
          articleId: request.articleId,
          articleTitle: meta?.title ?? '',
          agentId: request.agentId,
          channelId: channelKey(request.channel),
          visibleRanges: visibleRanges(text, anchor, meta),
          toolCalls: 0,
        });
        await recordDelivery(tx, id);
      },
    };
    const fork = latest
      ? await main.fork(latest.id, options, context)
      : await harness.createConversation(options, context);
    await syncPendingMarker(harness, request.articleId);
    return {
      runKey: runKeyFor(request.articleId, fork.id),
      deliveryId: requestId,
      shouldTrack: true,
    };
  }

  async function track(articleId: string, requestId: string) {
    const trackKey = `${articleId}|${requestId}`;
    if (tracked.has(trackKey)) return;
    tracked.add(trackKey);
    let tracking: AssistantRunRecord | undefined;
    try {
      await ports.store.use(articleId, async (harness) => {
        let closed = false;
        void harness.closed.then(() => {
          closed = true;
        });
        try {
          const run = (await harness.snapshot(ChannelRunsDoc, context))?.runs[requestId];
          if (!run) {
            await syncPendingMarker(harness, articleId);
            return;
          }
          tracking = run;
          const fork = await harness.conversation(run.forkId as ConversationId, context);
          if (!fork) {
            await serialize(channelLockKey(articleId, run.agentId, run.channel), () =>
              dropRun(harness, articleId, requestId, run, 'fork_missing'),
            );
            return;
          }
          await watchProgress(harness, articleId, run);
          const submission = await fork.submit(
            { type: 'input', content: run.delivery, whenBusy: 'steer', requestId },
            context,
          );
          const settled = await submission.wait(context);
          if (settled.status === 'done' && settled.type === 'input') {
            const compact = await serialize(
              channelLockKey(articleId, run.agentId, run.channel),
              () => finalizeAnswer(harness, articleId, run.forkId, settled.answer),
            );
            // The run already settled above, so a compaction error must not reach track() and fail it.
            if (compact) {
              await compactWhenLarge(compact.main, compact.model).catch((error: unknown) =>
                ports.logError('assistant_channel.compact_failed', error),
              );
            }
          } else {
            const detail = await readRunFailureDetail(harness, run.forkId, settled.detail);
            await serialize(channelLockKey(articleId, run.agentId, run.channel), () =>
              dropRun(harness, articleId, requestId, run, settled.reason ?? 'unanswered', detail),
            );
          }
        } catch (error) {
          ports.logError('assistant_channel.run_failed', error, { articleId, requestId });
          const detail = error instanceof Error ? error.message : String(error);
          // Clean up stuck ChannelRunsDoc/.pending when the harness is still live; when closing
          // (quit, delete, or DB restore), dropRun rejects or is skipped so restart state stays intact.
          if (tracking && !closed) {
            const run = tracking;
            const dropped = await serialize(
              channelLockKey(articleId, run.agentId, run.channel),
              () => dropRun(harness, articleId, requestId, run, 'run_failed', detail),
            ).then(
              () => true,
              () => false,
            );
            if (!dropped) publishFailed(articleId, requestId, run, 'run_failed', false, detail);
          } else if (tracking) {
            publishFailed(articleId, requestId, tracking, 'run_failed', false, detail);
          }
        }
      });
    } catch (error) {
      ports.logError('assistant_channel.run_failed', error, { articleId, requestId });
      const detail = error instanceof Error ? error.message : String(error);
      // Windows keep a run's placeholder and block chat until a final event, including when
      // removing the session closes the harness under the run.
      if (tracking) publishFailed(articleId, requestId, tracking, 'run_failed', false, detail);
    } finally {
      tracked.delete(trackKey);
    }
  }

  async function finalizeAnswer(
    harness: Harness,
    articleId: string,
    forkId: number,
    answerId: EntryId,
  ): Promise<
    | {
        main: NonNullable<Awaited<ReturnType<Harness['conversation']>>>;
        model: PiModelRef;
      }
    | undefined
  > {
    const fork = await harness.conversation(forkId as ConversationId, context);
    const runs = (await harness.snapshot(ChannelRunsDoc, context))?.runs ?? {};
    if (!fork) return undefined;
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
    if (!first) return undefined;

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
      return undefined;
    }

    const runContext = await harness.snapshot(RunContextDoc, forkId as ConversationId, context);
    const content = await resolveReplyLinksAsync(
      text,
      await ports.articleText(articleId),
      (id) => ports.findDiscussion(articleId, id),
      runContext?.visibleRanges,
    );
    const identity = await ports.resolveAgentIdentity(first.agentId).catch(() => undefined);
    const hash = createHash('sha256').update(`${articleId}:${forkId}:${answerId}`).digest('hex');
    const commentId = `${first.channel.kind === 'chat' ? 'reader_chat_message' : 'comment'}_${hash.slice(0, 24)}`;
    const saved = await ports.publishReply(articleId, first.channel, {
      id: commentId,
      author: identity
        ? annotationAgentAuthorRef(resolveAgentPublicIdentity(identity.agent, identity.uiLanguage))
        : { kind: 'agent', agentId: first.agentId, username: first.agentId },
      content,
      createdAt: new Date().toISOString(),
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

    const { remainingOnFork } = await harness.commit(async (tx) => {
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
      const remainingRuns = Object.values(state.runs);
      return {
        remainingOnFork: remainingRuns.filter((run) => run.forkId === forkId).length,
      };
    }, context);
    await syncSettledMarker(harness, articleId);
    if (remainingOnFork === 0) stopProgress(runKey);
    publish({
      runKey,
      articleId,
      agentId: first.agentId,
      channel: first.channel,
      settledDeliveryIds: answered.map(([id]) => id),
      status: saved ? 'done' : 'failed',
      text: content,
      steps,
      ...(saved ? { commentId } : { error: 'channel_deleted' }),
    });
    if (remainingOnFork > 0) watchers.get(runKey)?.emit();
    return main && identity?.provider
      ? { main, model: piModelRef(identity.provider, identity.agent) }
      : undefined;
  }

  async function dropRun(
    harness: Harness,
    articleId: string,
    requestId: string,
    run: AssistantRunRecord,
    reason: string,
    detail?: string,
  ) {
    const { remainingOnFork } = await harness.commit(async (tx) => {
      const cursors = await tx.doc(ChannelCursorsDoc);
      const cursor = cursorKey(run.agentId, run.channel);
      const failed = new Set(run.deliveredIds);
      cursors.delivered[cursor] = (cursors.delivered[cursor] ?? []).filter((id) => !failed.has(id));
      const state = await tx.doc(ChannelRunsDoc);
      delete state.runs[requestId];
      const remainingRuns = Object.values(state.runs);
      return {
        remainingOnFork: remainingRuns.filter((item) => item.forkId === run.forkId).length,
      };
    }, context);
    await syncSettledMarker(harness, articleId);
    publishFailed(articleId, requestId, run, reason, remainingOnFork > 0, detail);
  }

  function publishFailed(
    articleId: string,
    requestId: string,
    run: AssistantRunRecord,
    reason: string,
    remainingOnFork = false,
    detail?: string,
  ) {
    const runKey = runKeyFor(articleId, run.forkId);
    if (!remainingOnFork) stopProgress(runKey);
    publish({
      settledDeliveryIds: [requestId],
      runKey,
      articleId,
      agentId: run.agentId,
      channel: run.channel,
      status: 'failed',
      text: active.get(runKey)?.text ?? '',
      steps: active.get(runKey)?.steps ?? [],
      error: reason,
      ...(detail ? { errorDetail: detail } : {}),
    });
    if (remainingOnFork) watchers.get(runKey)?.emit();
  }

  async function readRunFailureDetail(harness: Harness, forkId: number, detail: unknown) {
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    const live = await harness
      .snapshot(LiveDoc, forkId as ConversationId, context)
      .catch(() => null);
    const runDetail = live?.runFailure?.detail;
    return typeof runDetail === 'string' && runDetail.trim() ? runDetail.trim() : undefined;
  }

  async function watchProgress(harness: Harness, articleId: string, run: AssistantRunRecord) {
    const runKey = runKeyFor(articleId, run.forkId);
    if (watchers.has(runKey)) return;
    const fork = await harness.conversation(run.forkId as ConversationId, context);
    if (!fork) return;
    const watch = await harness.watchDoc(LiveDoc, run.forkId as ConversationId, context);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let emitting = false;
    let again = false;
    const publishProgress = async () => {
      const transcript = await readRunTranscript(fork);
      if (!watchers.has(runKey)) return;
      // Read after the entries: a partial committed meanwhile is gone from the live doc, not doubled.
      const partial = watch?.value.generation?.message as AssistantMessage | undefined;
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
    watch?.start(async () => {
      timer ??= setTimeout(emit, PROGRESS_INTERVAL_MS);
    });
    watchers.set(runKey, {
      stop: () => {
        clearTimeout(timer);
        void watch?.stop();
      },
      emit,
    });
    emit();
  }

  function stopProgress(runKey: string) {
    watchers.get(runKey)?.stop();
    watchers.delete(runKey);
  }

  async function reconcileRetractions(harness: Harness, articleId: string) {
    const cursors = (await harness.snapshot(ChannelCursorsDoc, context))?.delivered ?? {};
    const deliveredIds = [...new Set(Object.values(cursors).flat())];
    if (deliveredIds.length === 0) return;
    const existing = await ports.existingMessageIds(articleId, deliveredIds);
    const removedByAgent = new Map<string, string[]>();
    for (const [key, ids] of Object.entries(cursors)) {
      const removed = ids.filter((id) => !existing.has(id));
      if (removed.length === 0) continue;
      const agentId = key.slice(0, key.indexOf('|'));
      removedByAgent.set(agentId, [...(removedByAgent.get(agentId) ?? []), ...removed]);
    }
    if (removedByAgent.size === 0) return;
    const removedIds = new Set([...removedByAgent.values()].flat());
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
        doc.delivered[key] = ids.filter((id) => !removedIds.has(id));
      }
    }, context);
  }

  async function resume(articleId: string, harness: Harness) {
    const runs = (await harness.snapshot(ChannelRunsDoc, context))?.runs ?? {};
    const entries = Object.entries(runs);
    if (entries.length === 0) {
      await syncPendingMarker(harness, articleId);
      return;
    }
    for (const [requestId, run] of entries) {
      const resolved = await ports.resolveAgent(run.agentId, true).catch((error: unknown) => {
        ports.logError('assistant_channel.resume_agent_failed', error, { articleId, requestId });
        return undefined;
      });
      if (resolved) await registerProvider(resolved);
      void track(articleId, requestId);
    }
  }

  function dispose() {
    for (const watcher of watchers.values()) watcher.stop();
    watchers.clear();
    active.clear();
  }

  async function registerProvider(resolved: ResolvedChannelAgent) {
    if (resolved.fake) {
      ports.models.setProvider(await e2eFakeProvider(resolved));
      return;
    }
    const resolveProviderApiKey = ports.resolveProviderApiKey;
    ports.models.setProvider(
      piProviderFor(
        resolved.provider,
        resolved.agent,
        isChatGptOAuthProvider(resolved.provider) && resolveProviderApiKey
          ? { resolveApiKey: () => resolveProviderApiKey(resolved.provider) }
          : undefined,
      ),
    );
  }

  async function compactWhenLarge(
    main: NonNullable<Awaited<ReturnType<Harness['conversation']>>>,
    model: PiModelRef,
  ) {
    const view = await main.context(context);
    if (JSON.stringify(view.messages).length < MAIN_COMPACT_CHARS) return;
    await main.configure({ model }, context);
    await main.compact(undefined, context);
  }

  async function cancel(request: AssistantCancelRequest) {
    const targetChannel = channelKey(request.channel);
    return ports.store.use(request.articleId, async (harness) => {
      const runs = (await harness.snapshot(ChannelRunsDoc, context))?.runs ?? {};
      const forkIds = new Set<number>();
      for (const run of Object.values(runs)) {
        if (channelKey(run.channel) !== targetChannel) continue;
        if (request.runKey && runKeyFor(request.articleId, run.forkId) !== request.runKey) continue;
        forkIds.add(run.forkId);
      }
      if (forkIds.size === 0) return false;
      for (const forkId of forkIds) {
        const fork = await harness.conversation(forkId as ConversationId, context);
        if (fork) await fork.abort(context);
      }
      return true;
    });
  }

  return {
    cancel,
    deliver,
    resume,
    registerProvider,
    dispose,
    activeRuns: (articleId: string) =>
      [...active.values()].filter((event) => event.articleId === articleId),
  };
}

export function agentChange(resolved: ResolvedChannelAgent): AgentChange {
  const thinkingLevel = piThinkingLevel(resolved.provider);
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

export function anchorBlockId(snapshot: ArticleTextSnapshot, anchor: TextAnchor) {
  const offset = anchorOffset(snapshot.text, anchor);
  return offset === undefined ? undefined : createArticleTextIndex(snapshot).blockAt(offset)?.id;
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
