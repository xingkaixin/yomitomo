import type { IpcMainEvent } from 'electron';
import type {
  AssistantRuntimeProgressEvent,
  AssistantRuntimeProgressSummary,
} from '@yomitomo/shared';
import type { AssistantRuntimeStreamEvent, AssistantToolName } from '@yomitomo/ai';
import type {
  DesktopIpcStreamChannel,
  DesktopIpcStreamErrorEvent,
  DesktopIpcStreamEvent,
  DesktopIpcStreamRequest,
  DesktopIpcStreamResponseChannel,
} from '../../ipc-contract';
import { desktopIpcErrorCodes, serializeDesktopIpcError } from '../../ipc-errors';
import { desktopIpcStreamResponseChannel } from '../../ipc-stream-channel';
import { onDesktopIpcStreamRequest, sendDesktopIpcStreamEvent } from './ipc-events';

export type AgentStreamSender<Channel extends DesktopIpcStreamChannel> = {
  channel: DesktopIpcStreamResponseChannel<Channel>;
  send: (message: DesktopIpcStreamEvent<Channel>) => void;
};

export type AgentStreamGuard<Channel extends DesktopIpcStreamChannel> = (
  input: DesktopIpcStreamRequest<Channel>,
  event: IpcMainEvent,
) => Promise<void>;

type AgentTextStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent };

type AgentTextStreamSender = {
  send: (message: AgentTextStreamEvent) => void;
};

export function runAgentStreamIpc<Channel extends DesktopIpcStreamChannel>(
  requestChannel: Channel,
  fallbackMessage: string,
  handler: (
    input: DesktopIpcStreamRequest<Channel>,
    sender: AgentStreamSender<Channel>,
    event: IpcMainEvent,
  ) => Promise<void>,
  guard?: AgentStreamGuard<Channel>,
) {
  onDesktopIpcStreamRequest(requestChannel, async (event, input) => {
    const sender = createAgentStreamSender(
      event,
      desktopIpcStreamResponseChannel(requestChannel, input.requestId),
    );
    try {
      await guard?.(input, event);
      await handler(input, sender, event);
    } catch (error) {
      sender.send(agentStreamError(error, fallbackMessage));
    }
  });
}

export function createAgentTextStream(
  sender: AgentTextStreamSender,
  target: { content: string; assistantProgress?: AssistantRuntimeProgressSummary },
) {
  return {
    textDelta(delta: string) {
      target.content += delta;
      sender.send({ type: 'delta', delta });
    },
    runtimeEvent(runtimeEvent: AssistantRuntimeStreamEvent) {
      if (runtimeEvent.type === 'text_delta') {
        this.textDelta(runtimeEvent.delta);
        return;
      }
      const progressEvent = runtimeProgressEvent(runtimeEvent);
      if (!progressEvent) return;
      applyRuntimeProgress(target, progressEvent);
      sender.send({ type: 'progress', progress: progressEvent });
    },
  };
}

function createAgentStreamSender<Channel extends DesktopIpcStreamChannel>(
  event: IpcMainEvent,
  channel: DesktopIpcStreamResponseChannel<Channel>,
): AgentStreamSender<Channel> {
  return {
    channel,
    send: (message) => sendDesktopIpcStreamEvent(event.sender, channel, message),
  };
}

function agentStreamError(error: unknown, fallbackMessage: string): DesktopIpcStreamErrorEvent {
  const serialized = serializeDesktopIpcError(error);
  return {
    type: 'error',
    message:
      serialized.code === desktopIpcErrorCodes.handlerFailed ? fallbackMessage : serialized.message,
    error: serialized,
  };
}

function runtimeProgressEvent(
  event: AssistantRuntimeStreamEvent,
): AssistantRuntimeProgressEvent | null {
  if (event.type === 'tool_call') {
    return {
      type: 'step',
      step: {
        id: event.toolName,
        label: runtimeToolProgressLabel(event.toolName),
        status: 'active',
      },
    };
  }
  if (event.type === 'tool_result') {
    return {
      type: 'step',
      step: {
        id: event.toolName,
        label: runtimeToolProgressLabel(event.toolName),
        status: event.ok ? 'done' : 'failed',
      },
    };
  }
  if (event.type === 'fallback') {
    return { type: 'fallback', message: 'ASSISTANT_RUNTIME_FALLBACK_FAST_RESPONSE' };
  }
  return null;
}

function applyRuntimeProgress(
  target: { assistantProgress?: AssistantRuntimeProgressSummary },
  event: AssistantRuntimeProgressEvent,
) {
  const current = target.assistantProgress || { steps: [] };
  if (event.type === 'fallback') {
    target.assistantProgress = { ...current, fallbackMessage: event.message };
    return;
  }
  const steps = current.steps.filter((step) => step.id !== event.step.id);
  target.assistantProgress = {
    ...current,
    steps: [...steps, event.step],
  };
}

function runtimeToolProgressLabel(toolName: AssistantToolName) {
  switch (toolName) {
    case 'get_current_thread':
      return 'get_current_thread';
    case 'get_anchor_context':
      return 'get_anchor_context';
    case 'search_article_passages':
      return 'search_article_passages';
    case 'search_article_memory':
      return 'search_article_memory';
    case 'search_own_memory':
      return 'search_own_memory';
    case 'search_other_agents_memory':
      return 'search_other_agents_memory';
    case 'check_duplicate_thought':
      return 'check_duplicate_thought';
  }
}
