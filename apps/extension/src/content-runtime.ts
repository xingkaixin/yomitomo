const CONTENT_READY_KEY = '__YOMITOMO_CONTENT_READY__';

type YomitomoWindow = Window & {
  [CONTENT_READY_KEY]?: boolean;
};

export type RuntimeMessage = { type?: string };
export type RuntimeResponse = { ok: true } | { ok: false; error: string };

export function registerContentToggleListener({
  addListener,
  targetWindow = window,
  toggleReader,
  errorMessage,
}: {
  addListener: (
    listener: (message: RuntimeMessage) => Promise<RuntimeResponse> | undefined,
  ) => boolean | void;
  targetWindow?: Window;
  toggleReader: () => Promise<void>;
  errorMessage: (error: unknown) => string;
}) {
  const yomitomoWindow = targetWindow as YomitomoWindow;
  if (yomitomoWindow[CONTENT_READY_KEY]) return false;

  const registered = addListener((message) => {
    if (message.type !== 'yomitomo:toggle' && message.type !== 'yomitomo:toggle:v2') return;

    return toggleReader()
      .then(() => ({ ok: true }) satisfies RuntimeResponse)
      .catch((error: unknown) => {
        console.error('[Yomitomo Extension] toggle failed', error);
        return { ok: false, error: errorMessage(error) } satisfies RuntimeResponse;
      });
  });
  if (registered === false) return false;
  yomitomoWindow[CONTENT_READY_KEY] = true;
  return true;
}
