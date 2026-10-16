import type { ArticleTextSection, ArticleTextSnapshot } from '@yomitomo/shared';
import { getOptionalDesktopApi } from '../../shell/app-desktop-api';

// Agents read the article through tools in main, which only has what a reader window extracted.
export function saveAssistantArticleText(articleId: string, snapshot: ArticleTextSnapshot) {
  if (!snapshot.text.trim()) return;
  void getOptionalDesktopApi()
    ?.assistant?.saveArticleText?.({ articleId, snapshot })
    .catch((error: unknown) => {
      console.warn('[assistant] article text sync failed', { articleId, error });
    });
}

// Heading offsets are measured on the rendered DOM, which can include inline translations, so
// each heading is located in the source text instead.
export function sectionsFromHeadings(
  text: string,
  headings: { title: string; depth: number }[],
): ArticleTextSection[] {
  let cursor = 0;
  const located = headings.flatMap((heading, index) => {
    const start = text.indexOf(heading.title, cursor);
    if (!heading.title || start < 0) return [];
    cursor = start + heading.title.length;
    const depth = Number.isInteger(heading.depth) && heading.depth >= 0 ? heading.depth : 0;
    return [{ id: `h${index}`, title: heading.title, depth, start }];
  });
  return located.map(({ id, title, depth, start }, index) => ({
    id,
    title,
    depth,
    start,
    end: located.slice(index + 1).find((item) => item.depth <= depth)?.start ?? text.length,
  }));
}
