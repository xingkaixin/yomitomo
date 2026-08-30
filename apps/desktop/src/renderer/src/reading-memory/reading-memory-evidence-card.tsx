import { useTranslation } from 'react-i18next';
import { ReadingEvidenceCard } from '@yomitomo/reader-ui/reading-evidence-card';
import type { ReadingEvidence, ReadingEvidenceRelation } from '@yomitomo/shared';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';

export function ReadingMemoryEvidenceCard({
  evidence,
  relation,
  onOpenEvidenceSource,
  onAfterOpen,
}: {
  evidence: ReadingEvidence;
  relation?: ReadingEvidenceRelation;
  onOpenEvidenceSource?: (target: ReadingEvidenceSourceTarget) => void;
  onAfterOpen?: () => void;
}) {
  const { t } = useTranslation();

  function open(view: 'source' | 'discussion') {
    onOpenEvidenceSource?.({
      articleId: evidence.source.ref.id,
      annotationId: evidence.location.annotationId,
      view,
      readingMemoryJump: true,
    });
    onAfterOpen?.();
  }

  return (
    <ReadingEvidenceCard
      evidence={{
        content: evidence.content,
        excerpt:
          evidence.content === evidence.location.anchor.exact
            ? undefined
            : evidence.location.anchor.exact,
        assetLabel: t(`readingEvidence.assetTypes.${evidence.assetType}`),
        authorLabel: t(`readingEvidence.authors.${evidenceAuthor(evidence)}`),
        sourceTitle: evidence.source.title,
        sourceDetail: evidence.source.byline,
        relation: relation
          ? {
              label: t(`readingEvidence.relations.${relation.relation}`),
              explanation: relation.explanation,
            }
          : undefined,
      }}
      labels={{
        excerpt: t('readingEvidence.excerpt'),
        openSource: t('readingEvidence.openSource'),
        openDiscussion: t('readingEvidence.openDiscussion'),
        locationUnavailable: t('readingEvidence.locationUnavailable'),
      }}
      onOpenSource={() => open('source')}
      onOpenDiscussion={onOpenEvidenceSource ? () => open('discussion') : undefined}
    />
  );
}

function evidenceAuthor(evidence: ReadingEvidence) {
  if (evidence.role === 'source') return 'source';
  if (evidence.authorKind === 'user') return 'user';
  if (evidence.authorKind === 'ai') return 'ai';
  return evidence.assetType === 'distillation' ? 'aiAssisted' : 'source';
}
