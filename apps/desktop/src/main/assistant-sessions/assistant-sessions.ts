import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, type HarnessSettings } from '@earendil-works/pi-durable';
import { logError } from '../app/logger';
import { sessionDirectory } from './assistant-session-lifecycle';
import { createAssistantSessionStore } from './assistant-session-store';

const settings: HarnessSettings = {
  stream: { timeoutMs: 120_000 },
  retry: { maxRetries: 2 },
  toolExecution: 'parallel',
};

let sessions: ReturnType<typeof createAssistantSessions> | undefined;

export function assistantSessions() {
  sessions ??= createAssistantSessions();
  return sessions;
}

export async function disposeAssistantSessions() {
  const current = sessions;
  sessions = undefined;
  await current?.store.dispose();
}

function createAssistantSessions() {
  const models = createModels();
  const registry = createRegistry();
  const store = createAssistantSessionStore({
    directory: sessionDirectory(),
    harnessOptions: () => ({ models, registry, settings, onReport: reportHarnessError }),
    logError,
  });
  return { models, registry, store };
}

function reportHarnessError(error: unknown) {
  logError('assistant_session.report', error);
}
