import { useState } from 'react';
import { CornerDownRight } from 'lucide-react';
import type { Annotation, PublicAgent, QuestionStatus, UserProfile } from '@yomitomo/shared';
import {
  annotationPersona as annotationAuthor,
  annotationThreadComments,
  commentPersona,
  isQuestionComment,
  questionStatusLabel,
  questionStatusOrOpen,
} from '@yomitomo/core';
import {
  AnnotationTypeLabelContent,
  AvatarBadge,
  ReadingIntentLabelContent,
} from './reader-component-primitives';
import { formatRelativeTime } from './reader-date-utils';
import { questionCardStyle } from './reader-style-utils';

export function QuestionPanel({
  agents,
  annotations,
  userProfile,
  onFocus,
  onAnswer,
  onSetAnnotationQuestionStatus,
  onSetCommentQuestionStatus,
}: {
  agents: PublicAgent[];
  annotations: Annotation[];
  userProfile: UserProfile;
  onFocus: (annotationId: string) => void;
  onAnswer: (annotationId: string) => void;
  onSetAnnotationQuestionStatus: (annotationId: string, status: QuestionStatus) => void;
  onSetCommentQuestionStatus: (
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) => void;
}) {
  const [activeStatus, setActiveStatus] = useState<QuestionStatus>('open');
  const questions = annotations.flatMap((annotation) => {
    const annotationAuthorPersona = annotationAuthor(annotation, userProfile, agents);
    const annotationQuestion =
      annotation.annotationType === 'question' || annotation.questionStatus
        ? [
            {
              id: annotation.id,
              annotationId: annotation.id,
              status: questionStatusOrOpen(annotation.questionStatus),
              persona: annotationAuthorPersona,
              text: annotation.anchor.exact,
              quote: annotation.anchor.exact,
              createdAt: annotation.createdAt,
              typeLabel: annotation.readingIntent ? (
                <ReadingIntentLabelContent intent={annotation.readingIntent} short />
              ) : annotation.annotationType ? (
                <AnnotationTypeLabelContent type={annotation.annotationType} />
              ) : (
                <AnnotationTypeLabelContent type="question" />
              ),
              setStatus: (status: QuestionStatus) =>
                onSetAnnotationQuestionStatus(annotation.id, status),
            },
          ]
        : [];
    const commentQuestions = annotationThreadComments(annotation)
      .filter(isQuestionComment)
      .map((comment) => {
        const commentAuthorPersona = commentPersona(comment, userProfile, agents);
        return {
          id: comment.id,
          annotationId: annotation.id,
          status: questionStatusOrOpen(comment.questionStatus),
          persona: commentAuthorPersona,
          text: comment.content,
          quote: annotation.anchor.exact,
          createdAt: comment.createdAt,
          typeLabel: comment.readingIntent ? (
            <ReadingIntentLabelContent intent={comment.readingIntent} short />
          ) : (
            <>
              <CornerDownRight
                aria-hidden="true"
                className="reader-reading-intent-icon"
                focusable="false"
                size={13}
                strokeWidth={2.3}
              />
              追问
            </>
          ),
          setStatus: (status: QuestionStatus) =>
            onSetCommentQuestionStatus(annotation.id, comment.id, status),
        };
      });
    return [...annotationQuestion, ...commentQuestions];
  });
  const statusTabs: Array<{ status: QuestionStatus; label: string }> = [
    { status: 'open', label: '未答' },
    { status: 'answered', label: '已答' },
    { status: 'parked', label: '搁置' },
  ];
  const questionCounts = statusTabs.reduce<Record<QuestionStatus, number>>(
    (counts, tab) => {
      counts[tab.status] = questions.filter((question) => question.status === tab.status).length;
      return counts;
    },
    { open: 0, answered: 0, parked: 0 },
  );
  const activeStatusLabel =
    statusTabs.find((tab) => tab.status === activeStatus)?.label ||
    questionStatusLabel(activeStatus);
  const visibleQuestions = questions.filter((question) => question.status === activeStatus);

  if (questions.length === 0) return null;

  return (
    <section className="reader-question-panel" aria-label="待答问题">
      <header className="reader-question-panel-header">
        <div>
          <strong>待回应</strong>
          <span>INBOX · {questions.length}</span>
        </div>
      </header>
      <div className="reader-question-tabs" role="tablist" aria-label="待答问题状态">
        {statusTabs.map((tab) => (
          <button
            aria-selected={activeStatus === tab.status}
            className={activeStatus === tab.status ? 'is-active' : ''}
            key={tab.status}
            role="tab"
            type="button"
            onClick={() => setActiveStatus(tab.status)}
          >
            <i />
            <span>{tab.label}</span>
            <b>{questionCounts[tab.status]}</b>
          </button>
        ))}
      </div>
      <div className="reader-question-list">
        {visibleQuestions.length === 0 ? (
          <p className="reader-question-empty">当前没有{activeStatusLabel}内容。</p>
        ) : null}
        {visibleQuestions.map((question) => (
          <article
            className={`is-${question.status}`}
            key={question.id}
            style={questionCardStyle(question.persona.color)}
          >
            <div className="reader-question-open">
              <span className="reader-question-meta">
                <span className="reader-question-persona">
                  <AvatarBadge
                    avatar={question.persona.avatar}
                    fallback={question.persona.fallback}
                  />
                  <span>
                    <strong>{question.persona.nickname}</strong>
                  </span>
                </span>
                <time dateTime={question.createdAt}>{formatRelativeTime(question.createdAt)}</time>
              </span>
              <span className="reader-question-type">{question.typeLabel}</span>
              <em>“{question.quote}”</em>
              <span className="reader-question-content">{question.text}</span>
            </div>
            <div className="reader-question-actions">
              {question.status === 'open' ? (
                <>
                  <button type="button" onClick={() => question.setStatus('parked')}>
                    搁置
                  </button>
                  <button type="button" onClick={() => onAnswer(question.annotationId)}>
                    回答
                  </button>
                </>
              ) : null}
              {question.status === 'parked' ? (
                <button type="button" onClick={() => question.setStatus('open')}>
                  恢复
                </button>
              ) : null}
              {question.status === 'answered' ? (
                <button type="button" onClick={() => onFocus(question.annotationId)}>
                  查看
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
