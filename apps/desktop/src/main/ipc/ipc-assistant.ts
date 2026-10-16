import {
  activeAssistantRuns,
  assistantArticleTexts,
  loadAssistantSessions,
} from '../assistant-sessions/assistant-session-lifecycle';
import { handleDesktopIpc } from './ipc';

export function registerAssistantIpc() {
  handleDesktopIpc('assistant:save-article-text', (_event, input) =>
    assistantArticleTexts.save(input.articleId, input.snapshot),
  );
  handleDesktopIpc('assistant:deliver', async (_event, request) => {
    const { runtime } = await loadAssistantSessions();
    const { runKey } = await runtime.deliver(request);
    return { runKey: runKey ?? null };
  });
  handleDesktopIpc('assistant:runs', (_event, articleId) => activeAssistantRuns(articleId));
}
