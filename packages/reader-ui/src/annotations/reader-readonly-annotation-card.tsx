import React from 'react';
import { Lightbulb } from 'lucide-react';
import { renderSafeMarkdown } from '@yomitomo/core/article-extraction';
import { AvatarBadge } from '../shared/reader-component-primitives';
import { formatTime } from '../reader-date-utils';
import { noteStyle } from '../reader-style-utils';

type AvatarColorStyle = React.CSSProperties & {
  '--reader-avatar-color': string;
};

export type ReadonlyAnnotationCardAuthor = {
  avatar?: string;
  color: string;
  fallback: string;
  name: string;
};

export type ReadonlyAnnotationCardThought = {
  id: string;
  author: ReadonlyAnnotationCardAuthor;
  content: string;
  createdAt: string;
};

export type ReadonlyAnnotationCardAction = {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
};

export function ReadonlyAnnotationCard({
  action,
  author,
  className,
  createdAt,
  id,
  quote,
  style,
  thoughts,
}: {
  action?: ReadonlyAnnotationCardAction;
  author: ReadonlyAnnotationCardAuthor;
  className?: string;
  createdAt: string;
  id: string;
  quote?: string;
  style?: React.CSSProperties;
  thoughts: ReadonlyAnnotationCardThought[];
}) {
  const annotationStyle = {
    ...noteStyle(author.color, false),
    '--reader-note-accent': author.color,
    ...style,
  } as React.CSSProperties;

  return (
    <article
      className={['reader-note', 'reader-readonly-note', className || ''].filter(Boolean).join(' ')}
      data-annotation-id={id}
      style={annotationStyle}
    >
      <div className="reader-note-body">
        {quote ? (
          <header className="reader-note-card-header">
            {action ? (
              <button className="reader-note-quote" type="button" onClick={action.onClick}>
                <QuoteContent quote={quote} />
              </button>
            ) : (
              <span className="reader-note-quote">
                <QuoteContent quote={quote} />
              </span>
            )}
          </header>
        ) : null}
        <div className="reader-note-meta">
          <span
            className="reader-note-owner"
            style={avatarColorStyle(author.color)}
            aria-hidden="true"
          >
            <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
          </span>
          <span className="reader-note-meta-copy">
            <strong>{author.name}</strong>
          </span>
          <span className="reader-note-time-actions">
            <time dateTime={createdAt}>{formatTime(createdAt)}</time>
          </span>
        </div>
        <footer className="reader-note-toolbar reader-readonly-note-toolbar">
          <span className="reader-note-thread-toggle">
            <span className="reader-note-thread-toggle-main">
              <span className="reader-comment-count" aria-label={`${thoughts.length} 条想法`}>
                <span>{thoughts.length}</span>
                <Lightbulb size={14} />
              </span>
            </span>
          </span>
          {action ? (
            <button type="button" onClick={action.onClick}>
              {action.icon}
              {action.label}
            </button>
          ) : null}
        </footer>
      </div>
      {thoughts.length > 0 ? (
        <div className="reader-note-comments-region">
          <div className="reader-note-comments-panel">
            <div className="reader-comments">
              {thoughts.map((thought) => (
                <ReadonlyThoughtView key={thought.id} thought={thought} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function QuoteContent({ quote }: { quote: string }) {
  return (
    <>
      <span className="reader-note-quote-mark" aria-hidden="true">
        “
      </span>
      <span className="reader-note-quote-text">{quote}</span>
    </>
  );
}

function ReadonlyThoughtView({ thought }: { thought: ReadonlyAnnotationCardThought }) {
  const html = React.useMemo(() => renderSafeMarkdown(thought.content), [thought.content]);
  return (
    <div className="reader-comment is-root">
      <AvatarBadge avatar={thought.author.avatar} fallback={thought.author.fallback} />
      <div className="reader-comment-body">
        <div className="reader-comment-author">
          <strong>{thought.author.name}</strong>
          <time dateTime={thought.createdAt}>{formatTime(thought.createdAt)}</time>
        </div>
        <div className="reader-markdown reader-comment-markdown">
          <div className="reader-markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

function avatarColorStyle(color: string): AvatarColorStyle {
  return { '--reader-avatar-color': color };
}
