import './reading-evidence-card.css';

type ReadingEvidenceCardProps = {
  evidence: {
    content: string;
    excerpt?: string;
    assetLabel: string;
    authorLabel?: string;
    sourceTitle: string;
    sourceDetail?: string;
    date?: { dateTime: string; label: string };
    relation?: { label: string; explanation?: string };
    locationUnavailable?: boolean;
  };
  labels: {
    excerpt: string;
    openSource: string;
    openDiscussion: string;
    locationUnavailable: string;
  };
  onOpenSource: () => void;
  onOpenDiscussion?: () => void;
  className?: string;
};

export function ReadingEvidenceCard({
  evidence,
  labels,
  onOpenSource,
  onOpenDiscussion,
  className,
}: ReadingEvidenceCardProps) {
  return (
    <article className={['reading-evidence-card', className].filter(Boolean).join(' ')}>
      <header className="reading-evidence-card-meta">
        <span className="reading-evidence-card-asset">{evidence.assetLabel}</span>
        {evidence.authorLabel ? <span>{evidence.authorLabel}</span> : null}
        {evidence.date ? (
          <time dateTime={evidence.date.dateTime}>{evidence.date.label}</time>
        ) : null}
      </header>
      <p className="reading-evidence-card-content">{evidence.content}</p>
      {evidence.excerpt ? (
        <blockquote className="reading-evidence-card-excerpt" aria-label={labels.excerpt}>
          <span>{labels.excerpt}</span>
          <p>{evidence.excerpt}</p>
        </blockquote>
      ) : null}
      {evidence.relation ? (
        <div className="reading-evidence-card-relation">
          <strong>{evidence.relation.label}</strong>
          {evidence.relation.explanation ? <p>{evidence.relation.explanation}</p> : null}
        </div>
      ) : null}
      <footer className="reading-evidence-card-footer">
        <div className="reading-evidence-card-source">
          <strong>{evidence.sourceTitle}</strong>
          {evidence.sourceDetail ? <span>{evidence.sourceDetail}</span> : null}
        </div>
        {evidence.locationUnavailable ? (
          <p className="reading-evidence-card-unavailable" role="status">
            {labels.locationUnavailable}
          </p>
        ) : null}
        <div className="reading-evidence-card-actions">
          <button type="button" onClick={onOpenSource}>
            {labels.openSource}
          </button>
          {onOpenDiscussion ? (
            <button type="button" onClick={onOpenDiscussion}>
              {labels.openDiscussion}
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
