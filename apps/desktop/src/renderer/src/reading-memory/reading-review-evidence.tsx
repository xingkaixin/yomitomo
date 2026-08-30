import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReadingEvidenceRelation } from '@yomitomo/shared';
import type {
  ReadingMemoryProviderDescriptor,
  ReadingReviewEvidenceResult,
} from '../../../ipc-contract';
import { Button } from '../components/ui/button';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { ReadingMemoryEvidenceCard } from './reading-memory-evidence-card';
import type { ReadingReviewComparisonState } from './use-reading-review';
import './reading-review-evidence.css';

const localFailureLabels = {
  input_too_large: 'readingMemory.review.evidence.inputTooLarge',
  unconfigured: 'readingMemory.review.evidence.noProvider',
  no_evidence: 'readingMemory.evidenceChanged',
  failed: 'readingMemory.review.evidence.failed',
} as const;

export function ReadingReviewEvidence({
  provider,
  state,
  onCompare,
  onConfirmPrivacy,
  onDismissPrivacy,
  onCancel,
  onOpenEvidenceSource,
}: {
  provider: ReadingMemoryProviderDescriptor | null;
  state: ReadingReviewComparisonState | null;
  onCompare: () => void;
  onConfirmPrivacy: () => void;
  onDismissPrivacy: () => void;
  onCancel: () => void;
  onOpenEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
}) {
  const { t } = useTranslation();
  const compareRef = useRef<HTMLButtonElement>(null);
  const privacyRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const result = state && 'result' in state ? state.result : undefined;
  const judged = state?.phase === 'idle' && 'judgment' in state.result ? state.result : undefined;
  const judgment = judged?.judgment;
  const relations = verifiedRelations(judged);
  const busy = state?.phase === 'searching' || state?.phase === 'comparing';

  useEffect(() => {
    if (state?.phase !== 'privacy' && state?.phase !== 'searching' && state?.phase !== 'comparing')
      return;
    const target = state.phase === 'privacy' ? privacyRef : statusRef;
    target.current?.focus();
    return () => compareRef.current?.focus();
  }, [state?.phase]);

  return (
    <section
      className="reading-review-evidence"
      aria-label={t('readingMemory.review.evidence.title')}
    >
      <header className="reading-review-evidence-heading">
        <h3>{t('readingMemory.review.evidence.title')}</h3>
        <p>{t('readingMemory.review.evidence.description')}</p>
        <p className="reading-review-evidence-provider">
          {provider
            ? t('readingMemory.review.evidence.currentProvider', {
                provider: provider.name,
                model: provider.modelName,
              })
            : t('readingMemory.review.evidence.noProvider')}
        </p>
      </header>

      {state?.phase === 'searching' ? (
        <p ref={statusRef} tabIndex={-1} role="status">
          {t('readingMemory.relations.searching')}
        </p>
      ) : null}
      {state?.phase === 'search-failed' ? (
        <p role="alert">{t('readingMemory.relations.searchFailed')}</p>
      ) : null}
      {state?.phase === 'comparing' ? (
        <p ref={statusRef} tabIndex={-1} role="status">
          {t('readingMemory.review.evidence.comparing')}
        </p>
      ) : null}
      {state?.phase === 'failed' ? (
        <p role="alert">{t('readingMemory.review.evidence.failed')}</p>
      ) : null}
      {state?.phase === 'canceled' ? (
        <p role="status">{t('readingMemory.review.evidence.canceled')}</p>
      ) : null}
      {result?.providerChanged ? <p role="alert">{t('readingMemory.providerChanged')}</p> : null}
      {judgment?.state === 'local' &&
      !result?.providerChanged &&
      (judgment.reason !== 'unconfigured' || provider) ? (
        <p role="status">{t(localFailureLabels[judgment.reason])}</p>
      ) : null}
      {judgment?.state === 'generated' &&
      judgment.output.kind === 'evidence-comparison' &&
      !result?.providerChanged &&
      relations.size === 0 ? (
        <p role="status">{t('readingMemory.review.evidence.abstained')}</p>
      ) : null}

      {state?.phase === 'privacy' && result?.provider ? (
        <section
          ref={privacyRef}
          tabIndex={-1}
          className="reading-review-evidence-privacy"
          aria-label={t('readingMemory.privacy.title')}
        >
          <h4>{t('readingMemory.privacy.title')}</h4>
          <p>{t('readingMemory.review.evidence.privacyContent')}</p>
          <p>{t('readingMemory.privacy.excluded')}</p>
          <p>{t('readingMemory.privacy.control')}</p>
          <p>
            {t('readingMemory.privacy.recipient', {
              provider: result.provider.name,
              model: result.provider.modelName,
            })}
          </p>
          <div className="reading-review-evidence-actions">
            <Button type="button" variant="secondary" onClick={onDismissPrivacy}>
              {t('readingMemory.privacy.stayLocal')}
            </Button>
            <Button type="button" onClick={onConfirmPrivacy}>
              {t('readingMemory.review.evidence.confirmPrivacy')}
            </Button>
          </div>
        </section>
      ) : (
        <div className="reading-review-evidence-actions">
          {busy ? (
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          ) : (
            <Button ref={compareRef} type="button" variant="secondary" onClick={onCompare}>
              {t('readingMemory.review.evidence.compare')}
            </Button>
          )}
        </div>
      )}

      {judged ? (
        <section
          className="reading-review-evidence-receipt"
          aria-label={t('readingMemory.review.evidence.receipt')}
        >
          {judged.sentProvider ? (
            <p>
              {t('readingMemory.privacy.recipient', {
                provider: judged.sentProvider.name,
                model: judged.sentProvider.modelName,
              })}
            </p>
          ) : judged.judgment.sentEvidenceCount === 0 ? (
            <p>{t('readingMemory.review.evidence.notSent')}</p>
          ) : null}
          <p>{t('readingMemory.sentEvidence', { count: judged.judgment.sentEvidenceCount })}</p>
          {judged.judgment.inputTruncated ? <p>{t('readingMemory.inputTruncated')}</p> : null}
        </section>
      ) : null}

      {result ? (
        <>
          <section
            className="reading-review-evidence-coverage"
            aria-label={t('readingMemory.coverage')}
          >
            <p>
              {t('readingMemory.library.evidenceCount', { count: result.evidence.length })}
              {' · '}
              {t(`readingMemory.mode.${result.mode}`)}
            </p>
            <p>
              {t('readingMemory.projectionCoverage', {
                count: result.projection.coverage.projectedAssetCount,
                total: result.projection.coverage.eligibleAssetCount,
              })}
              {' · '}
              {t(`settings.models.localMemory.projectionState.${result.projection.state}`)}
            </p>
            <p>
              {t('readingMemory.semanticCoverage', {
                count: result.semantic.coverage.indexedEntryCount,
                total: result.semantic.coverage.eligibleEntryCount,
              })}
              {' · '}
              {t(`settings.models.localMemory.semanticState.${result.semantic.state}`)}
            </p>
            {result.mode === 'keyword' ? (
              <p>{t('readingMemory.review.evidence.keywordHint')}</p>
            ) : null}
          </section>
          {result.evidence.length === 0 ? <p>{t('readingMemory.review.evidence.empty')}</p> : null}
          <div className="reading-review-evidence-cards">
            {result.evidence.map((evidence) => (
              <ReadingMemoryEvidenceCard
                key={evidence.id}
                evidence={evidence}
                relation={relations.get(evidence.id)}
                onOpenEvidenceSource={onOpenEvidenceSource}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function verifiedRelations(result: ReadingReviewEvidenceResult | undefined) {
  const relations = new Map<string, ReadingEvidenceRelation>();
  if (
    !result ||
    result.providerChanged ||
    result.judgment.state !== 'generated' ||
    result.judgment.output.kind !== 'evidence-comparison'
  )
    return relations;

  const versions = new Map(
    result.evidence.map((evidence) => [evidence.id, evidence.sourceVersion]),
  );
  const verified = new Set(
    result.judgment.evidence
      .filter((evidence) => versions.get(evidence.id) === evidence.sourceVersion)
      .map((evidence) => evidence.id),
  );
  for (const relation of result.judgment.output.relations) {
    if (verified.has(relation.evidenceId) && relation.explanation.trim())
      relations.set(relation.evidenceId, relation);
  }
  return relations;
}
