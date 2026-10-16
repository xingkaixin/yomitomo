import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { createArticleTextStore } from './assistant-article-text';
import type { DistillationReviewRequest } from './assistant-distillation-review';
import { pendingArticleId, removeArticleFiles } from './assistant-session-files';
import type { AssistantSessionHost } from './assistant-sessions';

export function sessionDirectory() {
  return join(app.getPath('userData'), 'assistant-sessions');
}

export const assistantArticleTexts = createArticleTextStore(sessionDirectory);

let host: AssistantSessionHost | undefined;
let loaded: Promise<typeof import('./assistant-sessions')> | undefined;

export function configureAssistantSessions(next: AssistantSessionHost) {
  host = next;
}

export async function loadAssistantSessions() {
  if (!host) throw new Error('ASSISTANT_SESSIONS_NOT_CONFIGURED');
  loaded ??= import('./assistant-sessions');
  return (await loaded).assistantSessions(host);
}

// Runs survive app restarts; a marker file names each article that still has one, so startup
// reopens only those sessions instead of loading pi-durable for every launch.
export async function resumePendingAssistantRuns() {
  const names = await readdir(sessionDirectory()).catch(() => []);
  const articleIds = names.flatMap((name) => pendingArticleId(name) ?? []);
  if (articleIds.length === 0) return;
  const { store } = await loadAssistantSessions();
  await Promise.all(articleIds.map((articleId) => store.use(articleId, async () => {})));
}

export async function activeAssistantRuns(articleId: string) {
  if (!loaded) return [];
  return (await loadAssistantSessions()).runtime.activeRuns(articleId);
}

export async function runDistillationReview(request: DistillationReviewRequest) {
  return (await loadAssistantSessions()).distillationReview.run(request);
}

export async function removeArticleAssistantSession(articleId: string) {
  assistantArticleTexts.forget(articleId);
  if (loaded) return (await loadAssistantSessions()).store.remove(articleId);
  await removeArticleFiles(sessionDirectory(), articleId);
}

export async function removeAllAssistantSessions() {
  assistantArticleTexts.clear();
  if (loaded) return (await loadAssistantSessions()).store.removeAll();
  await rm(sessionDirectory(), { recursive: true, force: true });
}

export async function disposeAssistantSessions() {
  if (!loaded) return;
  await (await loaded).disposeAssistantSessions();
}
