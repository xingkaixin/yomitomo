import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Collection, ReadingEvidenceScope, ReadingJudgmentClaim } from '@yomitomo/shared';
import type { ReadingLibraryAnswerResult, ReadingLibraryContext } from '../../../ipc-contract';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { ReadingLibraryAnswer } from './reading-library-answer';
import { ReadingLibraryThoughtDraft } from './reading-library-thought-draft';
import { ReadingMemoryEvidenceCard } from './reading-memory-evidence-card';
import {
  ReadingMemorySourcePicker,
  type ReadingMemorySourceSelection,
} from './reading-memory-source-picker';
import { useReadingLibraryQuestion } from './use-reading-library-question';
import './reading-library-question.css';

type ScopeSelection =
  | { kind: 'library' }
  | { kind: 'collection'; id: string }
  | { kind: 'sources'; sources: ReadingMemorySourceSelection[] };

const localFailureLabels = {
  input_too_large: 'readingMemory.inputTooLarge',
  unconfigured: 'readingMemory.noProvider',
  no_evidence: 'readingMemory.evidenceChanged',
  failed: 'readingMemory.library.generationFailed',
} as const;

export function ReadingLibraryQuestion({
  collections,
  catalogRevision,
  onOpenEvidenceSource,
}: {
  collections: Collection[];
  catalogRevision: unknown;
  onOpenEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
}) {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<ScopeSelection>({ kind: 'library' });
  const [question, setQuestion] = useState('');
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [draft, setDraft] = useState<{
    claim: ReadingJudgmentClaim;
    result: ReadingLibraryAnswerResult;
  } | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const privacyRef = useRef<HTMLElement>(null);
  const answeringRef = useRef<HTMLParagraphElement>(null);
  const scope: ReadingEvidenceScope | null =
    selection.kind === 'collection'
      ? collections.some((collection) => collection.id === selection.id)
        ? { kind: 'collection', collectionId: selection.id }
        : null
      : selection.kind === 'sources'
        ? { kind: 'sources', sources: selection.sources.map((source) => source.ref) }
        : { kind: 'library' };
  const { contextState, state, ask, answer, dismissPrivacy, cancel, reloadContext } =
    useReadingLibraryQuestion(scope, catalogRevision);
  const context = contextState?.phase === 'ready' ? contextState.context : null;
  const ready = state?.phase === 'ready' ? state : null;
  const result = ready?.result;
  const judged = ready?.remote === 'idle' && result && 'judgment' in result ? result : undefined;
  const judgment = judged?.judgment;
  const evidence = judgment?.evidence ?? result?.evidence ?? [];
  const output =
    !result?.providerChanged &&
    judgment?.state === 'generated' &&
    judgment.output.kind === 'library-answer'
      ? judgment.output
      : undefined;
  const busy = state?.phase === 'searching' || ready?.remote === 'answering';
  const canAsk =
    scope !== null &&
    context !== null &&
    context.sourceCount > 0 &&
    (scope.kind !== 'sources' || scope.sources.length > 0) &&
    question.trim().length > 0 &&
    question.length <= 10000 &&
    !busy;
  const canRetryAnswer =
    ready?.remote === 'failed' || (judgment?.state === 'local' && judgment.reason === 'failed');
  const canAnswer =
    ready &&
    result?.provider &&
    evidence.length > 0 &&
    !result.providerChanged &&
    (canRetryAnswer || (ready.remote === 'idle' && !judgment));
  const recipient = result?.provider
    ? { provider: result.provider.name, model: result.provider.modelName }
    : undefined;

  useEffect(() => {
    if (ready?.remote !== 'privacy' && ready?.remote !== 'answering') return;
    const target = ready.remote === 'privacy' ? privacyRef : answeringRef;
    target.current?.focus();
    return () => submitRef.current?.focus();
  }, [ready?.remote]);

  return (
    <div className="reading-library-question">
      <div className="reading-library-question-inner">
        <header className="reading-library-heading">
          <h1>{t('readingMemory.library.title')}</h1>
          <p>{t('readingMemory.library.description')}</p>
        </header>
        <div className="reading-library-scope-controls">
          <label>
            <span>{t('readingMemory.library.scope')}</span>
            <select
              value={selection.kind}
              onChange={(event) => {
                const kind = event.target.value;
                setSelection(
                  kind === 'collection'
                    ? { kind: 'collection', id: '' }
                    : kind === 'sources'
                      ? { kind: 'sources', sources: [] }
                      : { kind: 'library' },
                );
              }}
            >
              <option value="library">{t('readingMemory.library.scopeLibrary')}</option>
              <option value="collection">{t('readingMemory.library.scopeCollection')}</option>
              <option value="sources">{t('readingMemory.library.scopeSources')}</option>
            </select>
          </label>
          {selection.kind === 'collection' ? (
            <label>
              <span>{t('readingMemory.library.collection')}</span>
              <select
                value={scope?.kind === 'collection' ? scope.collectionId : ''}
                onChange={(event) => setSelection({ kind: 'collection', id: event.target.value })}
              >
                <option value="">{t('readingMemory.library.collection')}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {selection.kind === 'sources' ? (
            <div className="reading-library-source-selection">
              <Button variant="secondary" onClick={() => setSourcePickerOpen(true)}>
                {t('readingMemory.library.chooseSources')}
              </Button>
              <span>
                {t('readingMemory.library.selectedSources', { count: selection.sources.length })}
              </span>
            </div>
          ) : null}
        </div>

        <section
          className="reading-library-context"
          aria-label={t('readingMemory.library.context')}
        >
          <h2>{t('readingMemory.library.context')}</h2>
          {!scope ? <p>{t('readingMemory.library.chooseCollection')}</p> : null}
          {scope?.kind === 'sources' && scope.sources.length === 0 ? (
            <p>{t('readingMemory.library.chooseSomeSources')}</p>
          ) : null}
          {contextState?.phase === 'loading' ? (
            <p role="status">{t('readingMemory.library.contextLoading')}</p>
          ) : null}
          {contextState?.phase === 'failed' ? (
            <div>
              <p role="alert">{t('readingMemory.library.contextFailed')}</p>
              <Button variant="secondary" onClick={reloadContext}>
                {t('readingMemory.library.reloadContext')}
              </Button>
            </div>
          ) : null}
          {context ? <LibraryContextSummary context={context} /> : null}
          {context?.semantic.queryModelVersion === null || result?.mode === 'keyword' ? (
            <p>{t('readingMemory.library.keywordHint')}</p>
          ) : null}
        </section>

        <form
          className="reading-library-query"
          onSubmit={(event) => {
            event.preventDefault();
            if (canAsk) void ask(question);
          }}
        >
          <label>
            <span>{t('readingMemory.library.question')}</span>
            <Textarea
              value={question}
              maxLength={10000}
              disabled={busy}
              placeholder={t('readingMemory.library.placeholder')}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          <div className="reading-library-actions">
            {busy ? (
              <Button type="button" variant="secondary" onClick={cancel}>
                {t('common.cancel')}
              </Button>
            ) : null}
            <Button ref={submitRef} type="submit" disabled={!canAsk}>
              {t('readingMemory.library.ask')}
            </Button>
          </div>
        </form>

        {state ? (
          <blockquote
            className="reading-library-submitted"
            aria-label={t('readingMemory.library.submittedQuestion')}
          >
            {state.request.question}
          </blockquote>
        ) : null}
        {state?.phase === 'searching' ? (
          <p role="status">{t('readingMemory.relations.searching')}</p>
        ) : null}
        {state?.phase === 'search-failed' ? (
          <p role="alert">{t('readingMemory.relations.searchFailed')}</p>
        ) : null}
        {ready?.remote === 'answering' ? (
          <p ref={answeringRef} tabIndex={-1} role="status">
            {t('readingMemory.library.answering')}
          </p>
        ) : null}
        {ready?.remote === 'privacy' ? (
          <section
            ref={privacyRef}
            tabIndex={-1}
            className="reading-library-privacy"
            aria-label={t('readingMemory.privacy.title')}
          >
            <h2>{t('readingMemory.privacy.title')}</h2>
            <p>{t('readingMemory.privacy.content')}</p>
            <p>{t('readingMemory.privacy.excluded')}</p>
            <p>{t('readingMemory.privacy.control')}</p>
            <p>{t('readingMemory.privacy.recipient', recipient)}</p>
            <div className="reading-library-actions">
              <Button variant="secondary" onClick={dismissPrivacy}>
                {t('readingMemory.privacy.stayLocal')}
              </Button>
              <Button onClick={() => void answer(true)}>
                {t('readingMemory.library.confirmPrivacy')}
              </Button>
            </div>
          </section>
        ) : null}
        {result?.providerChanged ? <p role="alert">{t('readingMemory.providerChanged')}</p> : null}
        {ready?.remote === 'canceled' ? (
          <p role="status">{t('readingMemory.library.canceled')}</p>
        ) : null}
        {ready?.remote === 'failed' ? (
          <p role="alert">{t('readingMemory.library.generationFailed')}</p>
        ) : null}
        {judgment?.state === 'local' && !result?.providerChanged ? (
          <p role="alert">{t(localFailureLabels[judgment.reason])}</p>
        ) : null}
        {canAnswer ? (
          <div className="reading-library-actions">
            <Button variant="secondary" onClick={() => void answer()}>
              {canRetryAnswer
                ? t('readingMemory.library.retryAnswer')
                : t('readingMemory.library.answerWith', recipient)}
            </Button>
          </div>
        ) : null}
        {judged ? (
          <section
            className="reading-library-receipt"
            aria-label={t('readingMemory.library.receipt')}
          >
            <h2>{t('readingMemory.library.receipt')}</h2>
            {judged.sentProvider ? (
              <p>
                {t('readingMemory.privacy.recipient', {
                  provider: judged.sentProvider.name,
                  model: judged.sentProvider.modelName,
                })}
              </p>
            ) : null}
            <p>{t('readingMemory.sentEvidence', { count: judged.judgment.sentEvidenceCount })}</p>
            {judged.judgment.inputTruncated ? <p>{t('readingMemory.inputTruncated')}</p> : null}
          </section>
        ) : null}
        {output && judged ? (
          <ReadingLibraryAnswer
            output={output}
            evidence={evidence}
            onOpenEvidenceSource={onOpenEvidenceSource}
            onSaveThought={(claim) => setDraft({ claim, result: judged })}
          />
        ) : null}
        {result ? (
          <section
            className="reading-library-evidence"
            aria-label={t('readingMemory.library.localEvidence')}
          >
            <header>
              <h2>{t('readingMemory.library.localEvidence')}</h2>
              <p>
                {t('readingMemory.library.evidenceCount', { count: evidence.length })} ·{' '}
                {t(`readingMemory.mode.${result.mode}`)}
              </p>
            </header>
            {evidence.length === 0 ? <p>{t('readingMemory.library.emptyEvidence')}</p> : null}
            {evidence.map((item) => (
              <ReadingMemoryEvidenceCard
                key={item.id}
                evidence={item}
                onOpenEvidenceSource={onOpenEvidenceSource}
              />
            ))}
          </section>
        ) : null}
        {sourcePickerOpen && selection.kind === 'sources' ? (
          <ReadingMemorySourcePicker
            catalogRevision={catalogRevision}
            selectedSources={selection.sources}
            onConfirm={(sources) => setSelection({ kind: 'sources', sources })}
            onClose={() => setSourcePickerOpen(false)}
          />
        ) : null}
        {draft && draft.result === judged ? (
          <ReadingLibraryThoughtDraft
            claim={draft.claim}
            evidence={evidence}
            onClose={() => setDraft(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

function LibraryContextSummary({ context }: { context: ReadingLibraryContext }) {
  const { t } = useTranslation();
  return (
    <>
      <p className="reading-library-context-scope">
        {context.scope.kind === 'library'
          ? t('readingMemory.library.scopeLibrary')
          : context.scope.kind === 'collection'
            ? t('readingMemory.library.actualCollection', { name: context.collectionName })
            : t('readingMemory.library.selectedSources', { count: context.sourceCount })}
      </p>
      <p>
        {t('readingMemory.library.counts', {
          sources: context.sourceCount,
          judgments: context.judgmentCount,
        })}
      </p>
      <p>
        {context.provider
          ? t('readingMemory.privacy.recipient', {
              provider: context.provider.name,
              model: context.provider.modelName,
            })
          : t('readingMemory.noProvider')}
      </p>
      <div className="reading-library-coverage" aria-label={t('readingMemory.coverage')}>
        <p>
          {t('readingMemory.projectionCoverage', {
            count: context.projection.coverage.projectedAssetCount,
            total: context.projection.coverage.eligibleAssetCount,
          })}{' '}
          · {t(`settings.models.localMemory.projectionState.${context.projection.state}`)}
        </p>
        <p>
          {t('readingMemory.semanticCoverage', {
            count: context.semantic.coverage.indexedEntryCount,
            total: context.semantic.coverage.eligibleEntryCount,
          })}{' '}
          · {t(`settings.models.localMemory.semanticState.${context.semantic.state}`)}
        </p>
      </div>
      {context.sourceCount === 0 ? <p>{t('readingMemory.library.emptyScope')}</p> : null}
      {context.sourceCount < 2 || context.judgmentCount < 5 ? (
        <p className="reading-library-sparse">{t('readingMemory.library.sparse')}</p>
      ) : null}
    </>
  );
}
