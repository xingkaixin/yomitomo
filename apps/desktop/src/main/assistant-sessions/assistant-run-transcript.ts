import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage, Message } from '@earendil-works/pi-ai';
import type { Conversation, EntryId } from '@earendil-works/pi-durable';
import type { AssistantRuntimeProgressStep } from '@yomitomo/shared';

const PAGE_SIZE = 50;

export type RunTranscript = {
  text: string;
  steps: AssistantRuntimeProgressStep[];
};

// A run's text and tool calls are spread over several assistant messages of its fork. The fork's
// own entries after its previous final answer belong to the run; older ones are inherited from
// the agent's main conversation or answered an earlier delivery.
export async function readRunTranscript(
  fork: Pick<Conversation, 'id' | 'entries'>,
  answerId?: EntryId,
): Promise<RunTranscript> {
  const turn: Message[] = [];
  let cursor: Parameters<Conversation['entries']>[2];
  scan: do {
    const page = await fork.entries(
      answerId === undefined ? {} : { maxEntryId: answerId },
      PAGE_SIZE,
      cursor,
      BACKGROUND_CONTEXT,
    );
    for (const entry of page.items) {
      if (entry.conversationId !== fork.id) break scan;
      for (const message of (entry.model ?? []).toReversed()) {
        if (message.role === 'assistant' && isFinalAnswer(message) && entry.id !== answerId) {
          break scan;
        }
        turn.push(message);
      }
    }
    cursor = page.next;
  } while (cursor);
  return transcriptOf(turn.toReversed());
}

export function messageText(message: AssistantMessage) {
  return message.content
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('')
    .trim();
}

export function joinRunText(parts: string[]) {
  return parts.filter(Boolean).join('\n\n');
}

function transcriptOf(messages: Message[]): RunTranscript {
  const results = new Map<string, boolean>();
  for (const message of messages) {
    if (message.role === 'toolResult') results.set(message.toolCallId, message.isError);
  }
  const texts: string[] = [];
  const steps: AssistantRuntimeProgressStep[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || failedAttempt(message)) continue;
    texts.push(messageText(message));
    for (const part of message.content) {
      if (part.type !== 'toolCall') continue;
      const failed = results.get(part.id);
      steps.push({
        id: part.id,
        label: part.name,
        status: failed === undefined ? 'active' : failed ? 'failed' : 'done',
      });
    }
  }
  return { text: joinRunText(texts), steps };
}

function isFinalAnswer(message: AssistantMessage) {
  return !failedAttempt(message) && !message.content.some((part) => part.type === 'toolCall');
}

// Retried and aborted generations are kept in history but never reached the reader.
function failedAttempt(message: AssistantMessage) {
  return message.stopReason === 'error' || message.stopReason === 'aborted';
}
