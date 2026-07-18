import { useEffect, useRef } from 'react';
import type { Annotation, ArticleRecord, ArticleStorePatch } from '@yomitomo/shared';

type AnnotationArticleUpdate = {
  annotation: Annotation;
  article: ArticleRecord;
};

export function useAnnotationWindowArticlePatches(
  articleId: string,
  annotationId: string,
  onUpdate: (update: AnnotationArticleUpdate | null) => void,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!articleId || !annotationId || !desktop?.onArticlePatched) return;
    let active = true;
    let refreshVersion = 0;

    const unsubscribe = desktop.onArticlePatched((patch) => {
      if (articleIdFromPatch(patch) !== articleId) return;
      const version = ++refreshVersion;
      void desktop
        .getArticle(articleId)
        .then((article) => {
          if (!active || version !== refreshVersion) return;
          const annotation = article?.annotations.find((item) => item.id === annotationId);
          onUpdateRef.current(article && annotation ? { annotation, article } : null);
        })
        .catch(() => undefined);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [annotationId, articleId]);
}

function articleIdFromPatch(patch: ArticleStorePatch) {
  return patch.type === 'article-upsert' ? patch.article.id : patch.articleId;
}
