export type ArticleTranslationSessionSignal = AbortSignal;

type Session = { queue: Promise<unknown>; signals: Set<AbortController> };

/**
 * Serializes work per logical translation key so one owner writes a translation at a
 * time: a second request runs after the first instead of overwriting it from a stale
 * snapshot. Cancellation prevents later segment and finalization writes after delete
 * cleanup joins the queue.
 */
export function createArticleTranslationSessions() {
  const sessions = new Map<string, Session>();

  return {
    has(key: string) {
      return sessions.has(key);
    },
    run<T>(key: string, task: (signal: ArticleTranslationSessionSignal) => Promise<T>): Promise<T> {
      const session = sessions.get(key) || { queue: Promise.resolve(), signals: new Set() };
      sessions.set(key, session);

      const controller = new AbortController();
      session.signals.add(controller);

      const result = session.queue.then(
        () => task(controller.signal),
        () => task(controller.signal),
      );
      session.queue = result.then(ignore, ignore);
      return result.finally(() => {
        session.signals.delete(controller);
        if (session.signals.size === 0 && sessions.get(key) === session) sessions.delete(key);
      });
    },
    cancel(key: string) {
      for (const controller of sessions.get(key)?.signals || []) controller.abort();
    },
  };
}

function ignore() {}
