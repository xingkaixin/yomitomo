export type ArticleTranslationSessionSignal = { readonly cancelled: boolean };

type MutableSignal = { cancelled: boolean };
type Session = { queue: Promise<unknown>; signals: Set<MutableSignal> };

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

      const signal: MutableSignal = { cancelled: false };
      session.signals.add(signal);

      const result = session.queue.then(
        () => task(signal),
        () => task(signal),
      );
      session.queue = result.then(ignore, ignore);
      return result.finally(() => {
        session.signals.delete(signal);
        if (session.signals.size === 0 && sessions.get(key) === session) sessions.delete(key);
      });
    },
    cancel(key: string) {
      for (const signal of sessions.get(key)?.signals || []) signal.cancelled = true;
    },
  };
}

function ignore() {}
