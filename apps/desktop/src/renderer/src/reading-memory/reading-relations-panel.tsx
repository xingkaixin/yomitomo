import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import type { ReadingJudgmentResult } from '@yomitomo/shared';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import type { ReadingRelationsState } from './use-reading-relations';
import { ReadingMemoryEvidenceCard } from './reading-memory-evidence-card';
import './reading-relations-panel.css';

export function ReadingRelationsPanel({
  state,
  returnFocus,
  onClose,
  onSearch,
  onJudge,
  onDismissPrivacy,
  onOpenEvidenceSource,
}: {
  state: ReadingRelationsState;
  returnFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSearch: (question: string) => void;
  onJudge: (confirmPrivacy?: boolean) => void;
  onDismissPrivacy: () => void;
  onOpenEvidenceSource?: (target: ReadingEvidenceSourceTarget) => void;
}) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState(state.request.question ?? '');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const privacyRef = useRef<HTMLElement>(null);
  const judgeButtonRef = useRef<HTMLButtonElement>(null);
  const ready = state.phase === 'ready' ? state : null;
  const result = ready?.result;
  const judged = ready?.remote === 'idle' && result && 'judgment' in result ? result : undefined;
  const judgment = judged?.judgment;
  const evidence = judgment?.evidence ?? result?.evidence ?? [];
  const relations =
    judgment?.state === 'generated' && judgment.output.kind === 'reading-relations'
      ? judgment.output.relations
      : [];
  const busy = state.phase === 'searching' || ready?.remote === 'judging';
  const provider = result?.provider;
  const recipient = provider ? { provider: provider.name, model: provider.modelName } : undefined;
  const sentProvider = judged?.sentProvider;
  const receiptRecipient = sentProvider
    ? { provider: sentProvider.name, model: sentProvider.modelName }
    : recipient;
  const providerChanged = judged?.providerChanged;

  useEffect(() => {
    if (ready?.remote !== 'privacy' && ready?.remote !== 'judging') return;
    const target = ready.remote === 'privacy' ? privacyRef : titleRef;
    target.current?.focus();
    return () => (judgeButtonRef.current ?? titleRef.current)?.focus();
  }, [ready?.remote]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="reading-relations-overlay">
          <DialogContent
            className="reading-relations-panel"
            initialFocus={titleRef}
            finalFocus={returnFocus}
          >
            <header className="reading-relations-header">
              <div>
                <DialogTitle ref={titleRef} tabIndex={-1}>
                  {t('readingMemory.relations.title')}
                </DialogTitle>
                <DialogDescription>{t('readingMemory.relations.description')}</DialogDescription>
              </div>
              <button
                className="reading-relations-close"
                type="button"
                aria-label={t('readingMemory.relations.close')}
                onClick={onClose}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={20} />
              </button>
            </header>
            <div className="reading-relations-body">
              <blockquote className="reading-relations-selection">
                {state.request.context.quote}
              </blockquote>
              <form
                className="reading-relations-query"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!busy) onSearch(question);
                }}
              >
                <label>
                  <span>{t('readingMemory.relations.question')}</span>
                  <input
                    value={question}
                    maxLength={2000}
                    disabled={busy}
                    placeholder={t('readingMemory.relations.questionPlaceholder')}
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                </label>
                <Button className="action-button" type="submit" variant="secondary" disabled={busy}>
                  {t('readingMemory.relations.search')}
                </Button>
              </form>

              {state.phase === 'searching' ? (
                <p className="reading-relations-status" role="status">
                  {t('readingMemory.relations.searching')}
                </p>
              ) : null}
              {state.phase === 'search-failed' ? (
                <p className="reading-relations-status" role="alert">
                  {t('readingMemory.relations.searchFailed')}
                </p>
              ) : null}
              {result ? (
                <section
                  className="reading-relations-coverage"
                  aria-label={t('readingMemory.coverage')}
                >
                  <p>
                    {t(`readingMemory.mode.${result.mode}`)} · {t('readingMemory.scopeLibrary')}
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
                </section>
              ) : null}

              {result && evidence.length === 0 ? (
                <p className="reading-relations-status">{t('readingMemory.relations.empty')}</p>
              ) : null}
              <div className="reading-relations-evidence">
                {evidence.map((item) => {
                  const relation = relations.find((entry) => entry.evidenceId === item.id);
                  return (
                    <ReadingMemoryEvidenceCard
                      key={item.id}
                      evidence={item}
                      relation={relation}
                      onOpenEvidenceSource={onOpenEvidenceSource}
                      onAfterOpen={onClose}
                    />
                  );
                })}
              </div>

              {ready?.remote === 'privacy' ? (
                <section
                  ref={privacyRef}
                  tabIndex={-1}
                  className="reading-relations-privacy"
                  aria-label={t('readingMemory.privacy.title')}
                >
                  <h3>{t('readingMemory.privacy.title')}</h3>
                  <p>{t('readingMemory.privacy.content')}</p>
                  <p>{t('readingMemory.privacy.excluded')}</p>
                  <p>{t('readingMemory.privacy.control')}</p>
                  <p>{t('readingMemory.privacy.recipient', recipient)}</p>
                  <div className="reading-relations-actions">
                    <Button
                      className="action-button"
                      variant="secondary"
                      onClick={onDismissPrivacy}
                    >
                      {t('readingMemory.privacy.stayLocal')}
                    </Button>
                    <Button className="action-button" onClick={() => onJudge(true)}>
                      {t('readingMemory.privacy.confirm')}
                    </Button>
                  </div>
                </section>
              ) : null}
              {ready?.remote === 'failed' || providerChanged || judgment?.state === 'local' ? (
                <p className="reading-relations-status" role="alert">
                  {t(
                    providerChanged
                      ? 'readingMemory.providerChanged'
                      : judgmentFailureKey(judgment),
                  )}
                </p>
              ) : null}
              {judgment?.inputTruncated ? (
                <p className="reading-relations-status">{t('readingMemory.inputTruncated')}</p>
              ) : null}
              {judgment?.state === 'generated' && relations.length === 0 ? (
                <p className="reading-relations-status">{t('readingMemory.relations.abstained')}</p>
              ) : null}
            </div>
            <footer className="reading-relations-footer">
              <p role="status">
                {receiptRecipient
                  ? t('readingMemory.privacy.recipient', receiptRecipient)
                  : t('readingMemory.noProvider')}
                {judgment
                  ? ` · ${t('readingMemory.sentEvidence', { count: judgment.sentEvidenceCount })}`
                  : ''}
              </p>
              {busy ? (
                <div className="reading-relations-actions">
                  <span role="status">
                    {ready?.remote === 'judging' ? t('readingMemory.relations.judging') : null}
                  </span>
                  <Button className="action-button" variant="secondary" onClick={onClose}>
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : provider && evidence.length > 0 && ready?.remote !== 'privacy' ? (
                <Button ref={judgeButtonRef} className="action-button" onClick={() => onJudge()}>
                  {t('readingMemory.relations.judgeWith', recipient)}
                </Button>
              ) : null}
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function judgmentFailureKey(result: ReadingJudgmentResult | undefined) {
  if (result?.state === 'local') {
    if (result.reason === 'input_too_large') return 'readingMemory.inputTooLarge';
    if (result.reason === 'no_evidence') return 'readingMemory.evidenceChanged';
    if (result.reason === 'unconfigured') return 'readingMemory.noProvider';
  }
  return 'readingMemory.generationFailed';
}
