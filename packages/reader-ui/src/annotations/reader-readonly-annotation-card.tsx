import React from 'react';
import { Lightbulb } from 'lucide-react';
import { renderSafeMarkdown } from '@yomitomo/core/article-extraction';
import { AvatarBadge } from '../shared/reader-component-primitives';
import { formatTime } from '../reader-date-utils';
import type { ReaderUiLabels } from '../shell/reader-app-view-types';
import { defaultReaderUiLabels } from '../shell/reader-app-view-types';

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
  labels = defaultReaderUiLabels,
}: {
  action?: ReadonlyAnnotationCardAction;
  author: ReadonlyAnnotationCardAuthor;
  className?: string;
  createdAt: string;
  id: string;
  quote?: string;
  style?: React.CSSProperties;
  thoughts: ReadonlyAnnotationCardThought[];
  labels?: ReaderUiLabels;
}) {
  return (
    <article
      className={['reader-note', 'reader-readonly-note', 'has-discussion', className || '']
        .filter(Boolean)
        .join(' ')}
      data-annotation-id={id}
      style={style}
    >
      <span className="reader-note-tab">{labels.annotationCardTab}</span>
      <div className="reader-note-body">
        {quote ? (
          <header className="reader-note-card-header">
            {action ? (
              <button className="reader-note-quote" type="button" onClick={action.onClick}>
                <span className="reader-note-quote-text">{quote}</span>
              </button>
            ) : (
              <span className="reader-note-quote">
                <span className="reader-note-quote-text">{quote}</span>
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
            <time dateTime={createdAt}>{formatTime(createdAt, labels)}</time>
          </span>
        </div>
        <footer className="reader-note-toolbar reader-note-summary-toolbar reader-readonly-note-toolbar">
          <span className="reader-note-discussion-summary">
            <span className="reader-note-thread-toggle-main">
              <span className="reader-comment-count" aria-label={`${thoughts.length} 条想法`}>
                <span>{thoughts.length}</span>
                <Lightbulb size={14} />
              </span>
            </span>
          </span>
          {action ? (
            <button className="reader-note-discussion-entry" type="button" onClick={action.onClick}>
              {action.icon}
              {action.label}
            </button>
          ) : null}
        </footer>
        {thoughts.length > 0 ? (
          <div className="reader-note-comments-region">
            <div className="reader-note-comments-panel">
              <div className="reader-comments">
                {thoughts.map((thought) => (
                  <ReadonlyThoughtView key={thought.id} labels={labels} thought={thought} />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ReadonlyThoughtView({
  labels,
  thought,
}: {
  labels: ReaderUiLabels;
  thought: ReadonlyAnnotationCardThought;
}) {
  const html = React.useMemo(() => renderSafeMarkdown(thought.content), [thought.content]);
  return (
    <div className="reader-comment is-root">
      <AvatarBadge avatar={thought.author.avatar} fallback={thought.author.fallback} />
      <div className="reader-comment-body">
        <div className="reader-comment-author">
          <strong>{thought.author.name}</strong>
          <time dateTime={thought.createdAt}>{formatTime(thought.createdAt, labels)}</time>
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
