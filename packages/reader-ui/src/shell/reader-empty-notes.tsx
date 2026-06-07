import { Highlighter } from 'lucide-react';
import type { ReaderUiLabels } from './reader-app-view-types';

type EmptyNotesLabels = Pick<
  ReaderUiLabels,
  'emptyNotesDescription' | 'emptyNotesGestureLabel' | 'emptyNotesTitle'
>;

const fallbackEmptyNotesLabels: EmptyNotesLabels = {
  emptyNotesDescription:
    'Select text in the reader to highlight it, save a thought, or start a discussion.',
  emptyNotesGestureLabel: 'Select text in the article to create a saved highlight or thought.',
  emptyNotesTitle: 'Highlights and thoughts stay here',
};

export function EmptyNotes({ labels = fallbackEmptyNotesLabels }: { labels?: EmptyNotesLabels }) {
  return (
    <div className="reader-empty">
      <div className="reader-empty-icon" aria-hidden="true">
        <Highlighter size={28} strokeWidth={2.1} />
      </div>
      <strong>{labels.emptyNotesTitle}</strong>
      <p>{labels.emptyNotesDescription}</p>
      <div className="reader-empty-gesture" role="img" aria-label={labels.emptyNotesGestureLabel}>
        <div className="reader-empty-gesture-card is-source" aria-hidden="true">
          <span className="reader-empty-line is-short" />
          <span className="reader-empty-line" />
          <span className="reader-empty-line has-highlight">
            <i />
          </span>
        </div>
        <span className="reader-empty-gesture-arrow" aria-hidden="true" />
        <div className="reader-empty-gesture-card is-note" aria-hidden="true">
          <span className="reader-empty-quote-mark" />
          <span className="reader-empty-line" />
          <span className="reader-empty-line is-medium" />
        </div>
      </div>
    </div>
  );
}
