import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { removeArticleFiles } from './assistant-session-files';

export function sessionDirectory() {
  return join(app.getPath('userData'), 'assistant-sessions');
}

let loaded: Promise<typeof import('./assistant-sessions')> | undefined;

export async function loadAssistantSessions() {
  loaded ??= import('./assistant-sessions');
  return (await loaded).assistantSessions();
}

export async function removeArticleAssistantSession(articleId: string) {
  if (loaded) return (await loadAssistantSessions()).store.remove(articleId);
  await removeArticleFiles(sessionDirectory(), articleId);
}

export async function removeAllAssistantSessions() {
  if (loaded) return (await loadAssistantSessions()).store.removeAll();
  await rm(sessionDirectory(), { recursive: true, force: true });
}

export async function disposeAssistantSessions() {
  if (!loaded) return;
  await (await loaded).disposeAssistantSessions();
}
