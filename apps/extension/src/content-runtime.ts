import type { ArticlePreview, ExtractedArticle } from './article-extraction';

const CONTENT_READY_KEY = '__YOMITOMO_CONTENT_READY__';

type YomitomoWindow = Window & {
  [CONTENT_READY_KEY]?: boolean;
};

export type RuntimeMessage = { type?: string; inlineImages?: boolean };
export type RuntimeResponse =
  | { ok: true }
  | { ok: true; article: ArticlePreview }
  | { ok: true; article: ExtractedArticle }
  | { ok: false; error: string };

export function registerContentToggleListener({
  addListener,
  targetWindow = window,
  getArticle,
  getArticlePreview,
  toggleReader,
  errorMessage,
}: {
  addListener: (
    listener: (message: RuntimeMessage) => Promise<RuntimeResponse> | undefined,
  ) => boolean | void;
  targetWindow?: Window;
  getArticle?: (options: { inlineImages: boolean }) => Promise<ExtractedArticle>;
  getArticlePreview?: () => Promise<ArticlePreview>;
  toggleReader: () => Promise<void>;
  errorMessage: (error: unknown) => string;
}) {
  const yomitomoWindow = targetWindow as YomitomoWindow;
  if (yomitomoWindow[CONTENT_READY_KEY]) return false;

  const registered = addListener((message) => {
    if (message.type === 'yomitomo:article-preview') {
      if (!getArticlePreview) return;
      return getArticlePreview()
        .then((article) => ({ ok: true, article }) satisfies RuntimeResponse)
        .catch((error: unknown) => {
          console.error('[Yomitomo Extension] article preview failed', error);
          return { ok: false, error: errorMessage(error) } satisfies RuntimeResponse;
        });
    }

    if (message.type === 'yomitomo:article') {
      if (!getArticle) return;
      return getArticle({ inlineImages: Boolean(message.inlineImages) })
        .then((article) => ({ ok: true, article }) satisfies RuntimeResponse)
        .catch((error: unknown) => {
          console.error('[Yomitomo Extension] article extraction failed', error);
          return { ok: false, error: errorMessage(error) } satisfies RuntimeResponse;
        });
    }

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
