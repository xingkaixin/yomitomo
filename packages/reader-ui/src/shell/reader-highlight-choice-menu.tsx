import { X } from 'lucide-react';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationPersona as annotationAuthor } from '@yomitomo/core';
import type { HighlightChoiceAction } from '../reader-types';
import { AvatarBadge } from '../shared/reader-component-primitives';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

export function HighlightChoiceMenu({
  action,
  agents,
  annotations,
  labels = defaultReaderUiLabels,
  userProfile,
  onCancel,
  onSelect,
}: {
  action: HighlightChoiceAction;
  agents: PublicAgent[];
  annotations: Annotation[];
  labels?: ReaderUiLabels;
  userProfile: UserProfile;
  onCancel: () => void;
  onSelect: (annotationId: string) => void;
}) {
  return (
    <div className="reader-highlight-choice-menu" style={{ left: action.x, top: action.y }}>
      <header>
        <strong>{labels.highlightChoice}</strong>
        <button type="button" onClick={onCancel} aria-label={labels.closeHighlightChoice}>
          <X size={14} />
        </button>
      </header>
      {annotations.map((annotation) => {
        const persona = annotationAuthor(annotation, userProfile, agents);
        return (
          <button key={annotation.id} type="button" onClick={() => onSelect(annotation.id)}>
            <AvatarBadge avatar={persona.avatar} fallback={persona.fallback} />
            <span>
              <strong>{persona.nickname}</strong>
              <em>@{persona.username}</em>
            </span>
          </button>
        );
      })}
    </div>
  );
}
