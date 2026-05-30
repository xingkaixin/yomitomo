import { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import { commentPersona } from '@yomitomo/core';
import { applyAppTheme, readCachedThemeId, themeRegistry } from './app-theme';

type DiscussionWindowStatus =
  | { type: 'loading' }
  | { type: 'ready'; article: ArticleRecord; annotation: Annotation }
  | { type: 'missing' }
  | { type: 'error'; message: string };

export function AnnotationDiscussionWindowApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const articleId = params.get('articleId') || '';
  const annotationId = params.get('annotationId') || '';
  const [status, setStatus] = useState<DiscussionWindowStatus>({ type: 'loading' });
  const className = annotationDiscussionWindowClassName();

  useEffect(() => {
    const syncTheme = () => applyAppTheme(themeRegistry[readCachedThemeId()]);
    window.addEventListener('storage', syncTheme);
    window.addEventListener('focus', syncTheme);
    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('focus', syncTheme);
    };
  }, []);

  useEffect(() => {
    document.title = status.type === 'ready' ? discussionWindowTitle(status) : '批注讨论';
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    if (!articleId || !annotationId) {
      setStatus({ type: 'missing' });
      return;
    }

    void window.yomitomoDesktop
      .getArticle(articleId)
      .then((article) => {
        if (cancelled) return;
        const annotation = article?.annotations.find((item) => item.id === annotationId);
        setStatus(
          article && annotation ? { type: 'ready', article, annotation } : { type: 'missing' },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : '讨论窗口加载失败',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [annotationId, articleId]);

  if (status.type === 'ready') {
    return (
      <AnnotationDiscussionShell
        article={status.article}
        annotation={status.annotation}
        className={className}
      />
    );
  }

  const message =
    status.type === 'loading'
      ? '正在载入批注讨论'
      : status.type === 'missing'
        ? '找不到这条批注讨论'
        : status.message;

  return (
    <main className={className}>
      <section className="annotation-discussion-empty" aria-busy={status.type === 'loading'}>
        <MessageCircle size={24} />
        <strong>{message}</strong>
      </section>
    </main>
  );
}

function AnnotationDiscussionShell({
  annotation,
  article,
  className,
}: {
  annotation: Annotation;
  article: ArticleRecord;
  className: string;
}) {
  const thoughts = annotation.comments.filter((comment) => !comment.replyTo);
  const replies = annotation.comments.length - thoughts.length;
  const userProfile = annotationUserProfile(annotation, article);
  const firstThought = thoughts[0];
  const firstThoughtAuthor = firstThought ? commentPersona(firstThought, userProfile, []) : null;

  return (
    <main className={className}>
      <section className="annotation-discussion-quote" aria-label="批注引文">
        <span aria-hidden="true">“</span>
        <p>{annotation.anchor.exact}</p>
      </section>

      <section className="annotation-discussion-layout" aria-label="讨论窗口壳层">
        <aside className="annotation-discussion-ideas">
          <header>
            <strong>想法</strong>
            <span>{thoughts.length}</span>
          </header>
          {firstThought && firstThoughtAuthor ? (
            <button className="annotation-discussion-idea is-selected" type="button">
              <AvatarBadge
                avatar={firstThoughtAuthor.avatar}
                fallback={firstThoughtAuthor.fallback}
              />
              <span>
                <strong>{firstThoughtAuthor.nickname}</strong>
                <em>{firstThought.content}</em>
              </span>
            </button>
          ) : (
            <p>还没有想法</p>
          )}
        </aside>
        <section className="annotation-discussion-thread">
          <header>
            <strong>讨论区</strong>
            <span>{replies} 条回复</span>
          </header>
          <div className="annotation-discussion-thread-placeholder">
            <MessageCircle size={22} />
            <strong>选择想法查看讨论</strong>
            <p>这条批注的讨论会在这里展开。</p>
          </div>
        </section>
      </section>
    </main>
  );
}

function annotationDiscussionWindowClassName() {
  return ['annotation-discussion-window', `is-${window.yomitomoDesktop.platform ?? 'unknown'}`]
    .filter(Boolean)
    .join(' ');
}

function discussionWindowTitle({
  annotation,
  article,
}: {
  article: ArticleRecord;
  annotation: Annotation;
}) {
  const quote = compactTitleText(annotation.anchor.exact);
  const articleTitle = compactTitleText(article.title || '未命名文章');
  return quote ? `批注讨论 - ${quote}` : `批注讨论 - ${articleTitle}`;
}

function compactTitleText(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function AvatarBadge({ avatar, fallback }: { avatar?: string; fallback: string }) {
  const value = fallback.slice(0, 2).toUpperCase();

  return (
    <span className={['reader-avatar-badge', avatar ? 'is-image' : ''].filter(Boolean).join(' ')}>
      {avatar ? <img alt="" src={avatar} /> : value}
    </span>
  );
}

function annotationUserProfile(annotation: Annotation, article: ArticleRecord): UserProfile {
  return {
    id: annotation.userId || 'user',
    nickname: annotation.userNickname || '我',
    username: annotation.userUsername || 'user',
    avatar: annotation.userAvatar || '',
    annotationColor: annotation.userAnnotationColor || annotation.color,
    updatedAt: article.updatedAt,
  };
}
