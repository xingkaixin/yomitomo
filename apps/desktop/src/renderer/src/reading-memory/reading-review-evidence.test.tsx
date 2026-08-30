// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReadingEvidence, ReadingJudgmentResult } from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ReadingMemoryProviderDescriptor,
  ReadingReviewEvidenceResult,
  ReadingReviewEvidenceSession,
} from '../../../ipc-contract';
import { ReadingReviewEvidence } from './reading-review-evidence';
import type { ReadingReviewComparisonState } from './use-reading-review';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
  }),
}));

type EvidenceProps = ComponentProps<typeof ReadingReviewEvidence>;
type GeneratedResult = ReadingReviewEvidenceResult & {
  judgment: Extract<ReadingJudgmentResult, { state: 'generated' }>;
};

const currentProvider: ReadingMemoryProviderDescriptor = {
  id: 'current',
  name: 'Current Provider',
  type: 'openai-chat',
  modelName: 'current-model',
};
const pendingProvider = {
  ...currentProvider,
  id: 'pending',
  name: 'Pending Provider',
  modelName: 'pending-model',
};
const sentProvider = {
  ...currentProvider,
  id: 'sent',
  name: 'Sent Provider',
  modelName: 'sent-model',
};
const compareLabel = 'readingMemory.review.evidence.compare';
const receiptLabel = 'readingMemory.review.evidence.receipt';
const relationExplanation = '补充了判断的适用条件。';

afterEach(() => cleanup());

describe('ReadingReviewEvidence', () => {
  it('only invokes comparison, privacy, and cancellation callbacks after explicit actions', () => {
    const { props, rerender } = renderEvidence(null);
    const result = session();

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'idle', result }} />);
    for (const callback of [
      props.onCompare,
      props.onConfirmPrivacy,
      props.onDismissPrivacy,
      props.onCancel,
      props.onOpenEvidenceSource,
    ])
      expect(callback).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: compareLabel }));
    expect(props.onCompare).toHaveBeenCalledOnce();

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'privacy', result }} />);
    expect(props.onConfirmPrivacy).not.toHaveBeenCalled();
    expect(props.onDismissPrivacy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.privacy.stayLocal' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'readingMemory.review.evidence.confirmPrivacy' }),
    );
    expect(props.onDismissPrivacy).toHaveBeenCalledOnce();
    expect(props.onConfirmPrivacy).toHaveBeenCalledOnce();

    for (const phase of ['comparing', 'searching'] as const) {
      rerender(
        <ReadingReviewEvidence
          {...props}
          state={phase === 'searching' ? { phase } : { phase, result }}
        />,
      );
      expect(screen.queryByRole('button', { name: compareLabel })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    }
    expect(props.onCancel).toHaveBeenCalledTimes(2);
    expect(props.onCompare).toHaveBeenCalledOnce();
    expect(props.onOpenEvidenceSource).not.toHaveBeenCalled();
  });

  it('moves comparison focus through privacy and progress and restores the compare button', () => {
    const result = session();
    const { props, rerender } = renderEvidence({ phase: 'idle', result });
    const compare = screen.getByRole('button', { name: compareLabel });
    const trace: Array<{ phase: string; targetFocused: boolean; activeElement: string }> = [];
    const recordFocus = (phase: string, target: HTMLElement) => {
      const active = document.activeElement;
      const label =
        active?.getAttribute('aria-label') ??
        active?.getAttribute('role') ??
        (active instanceof HTMLButtonElement ? active.textContent : '');
      trace.push({
        phase,
        targetFocused: active === target,
        activeElement: `${active?.tagName}:${label}`,
      });
    };
    compare.focus();
    expect(document.activeElement).toBe(compare);

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'searching' }} />);
    const searching = screen.getByRole('status');
    recordFocus('searching', searching);
    expect.soft(searching.getAttribute('tabindex')).toBe('-1');

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'search-failed' }} />);
    recordFocus('search-failed', screen.getByRole('button', { name: compareLabel }));

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'privacy', result }} />);
    const privacy = screen.getByRole('region', { name: 'readingMemory.privacy.title' });
    recordFocus('privacy', privacy);
    expect.soft(privacy.getAttribute('tabindex')).toBe('-1');

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'comparing', result }} />);
    const progress = screen.getByRole('status');
    recordFocus('comparing', progress);
    expect.soft(progress.getAttribute('tabindex')).toBe('-1');

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'idle', result }} />);
    recordFocus('idle', screen.getByRole('button', { name: compareLabel }));

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'privacy', result }} />);
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.privacy.stayLocal' }));
    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'idle', result }} />);
    recordFocus('dismissed', screen.getByRole('button', { name: compareLabel }));

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'comparing', result }} />);
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'canceled', result }} />);
    recordFocus('canceled', screen.getByRole('button', { name: compareLabel }));

    expect(trace).toEqual([
      { phase: 'searching', targetFocused: true, activeElement: 'P:status' },
      {
        phase: 'search-failed',
        targetFocused: true,
        activeElement: `BUTTON:${compareLabel}`,
      },
      {
        phase: 'privacy',
        targetFocused: true,
        activeElement: 'SECTION:readingMemory.privacy.title',
      },
      { phase: 'comparing', targetFocused: true, activeElement: 'P:status' },
      { phase: 'idle', targetFocused: true, activeElement: `BUTTON:${compareLabel}` },
      { phase: 'dismissed', targetFocused: true, activeElement: `BUTTON:${compareLabel}` },
      { phase: 'canceled', targetFocused: true, activeElement: `BUTTON:${compareLabel}` },
    ]);
  });

  it('keeps keyword candidates and source actions honest without a configured provider', () => {
    const result = session();
    const local: ReadingReviewEvidenceResult = {
      ...result,
      provider: null,
      judgment: {
        state: 'local',
        reason: 'unconfigured',
        evidence: result.evidence,
        inputTruncated: false,
        sentEvidenceCount: 0,
      },
    };
    const { props } = renderEvidence({ phase: 'idle', result: local }, null);
    const card = within(screen.getByRole('article'));

    expect(screen.getAllByText('readingMemory.review.evidence.noProvider')).toHaveLength(1);
    expect(screen.getByText('readingMemory.review.evidence.keywordHint')).toBeTruthy();
    expect(screen.getByText('readingMemory.mode.keyword', { exact: false })).toBeTruthy();
    expect(screen.getByText('readingMemory.projectionCoverage 4 6', { exact: false })).toBeTruthy();
    expect(screen.getByText('readingMemory.semanticCoverage 0 8', { exact: false })).toBeTruthy();
    expect(card.getByText('readingEvidence.authors.user')).toBeTruthy();
    expect(card.getByText('readingEvidence.assetTypes.comment')).toBeTruthy();
    expect(card.getByText('学习的条件')).toBeTruthy();
    expect(card.getByText('第三章')).toBeTruthy();
    expect(card.getByLabelText('readingEvidence.excerpt').textContent).toContain('原文摘录');
    expect(screen.getByRole('button', { name: compareLabel })).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: receiptLabel })).getByText(
        'readingMemory.review.evidence.notSent',
      ),
    ).toBeTruthy();

    fireEvent.click(card.getByRole('button', { name: 'readingEvidence.openSource' }));
    fireEvent.click(card.getByRole('button', { name: 'readingEvidence.openDiscussion' }));
    expect(props.onOpenEvidenceSource.mock.calls).toEqual([
      [{ articleId: 'source-article', annotationId: 'annotation-first', view: 'source' }],
      [{ articleId: 'source-article', annotationId: 'annotation-first', view: 'discussion' }],
    ]);
    expect(props.onCompare).not.toHaveBeenCalled();
  });

  it('separates the current, pending, and actual providers and keeps a truthful receipt after a provider change', () => {
    const result = generated();
    result.provider = pendingProvider;
    result.judgment.sentEvidenceCount = 3;
    result.judgment.inputTruncated = true;
    const { props, rerender } = renderEvidence({ phase: 'privacy', result });
    const privacy = within(screen.getByRole('region', { name: 'readingMemory.privacy.title' }));

    expect(
      screen.getByText(
        'readingMemory.review.evidence.currentProvider Current Provider current-model',
      ),
    ).toBeTruthy();
    expect(
      privacy.getByText('readingMemory.privacy.recipient Pending Provider pending-model'),
    ).toBeTruthy();
    for (const key of [
      'readingMemory.review.evidence.privacyContent',
      'readingMemory.privacy.excluded',
      'readingMemory.privacy.control',
    ])
      expect(privacy.getByText(key)).toBeTruthy();
    expect(screen.queryByRole('region', { name: receiptLabel })).toBeNull();
    expect(screen.queryByText(relationExplanation)).toBeNull();
    expect(
      screen.queryByText('readingMemory.privacy.recipient Sent Provider sent-model'),
    ).toBeNull();

    rerender(
      <ReadingReviewEvidence
        {...props}
        state={{ phase: 'idle', result: { ...result, providerChanged: true } }}
      />,
    );

    const receipt = within(screen.getByRole('region', { name: receiptLabel }));
    expect(
      receipt.getByText('readingMemory.privacy.recipient Sent Provider sent-model'),
    ).toBeTruthy();
    expect(receipt.getByText('readingMemory.sentEvidence 3')).toBeTruthy();
    expect(receipt.getByText('readingMemory.inputTruncated')).toBeTruthy();
    expect(receipt.queryByText('readingMemory.review.evidence.notSent')).toBeNull();
    expect(
      screen.queryByText('readingMemory.privacy.recipient Pending Provider pending-model'),
    ).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('readingMemory.providerChanged');
    expect(screen.queryByText(relationExplanation)).toBeNull();
    expect(screen.queryByText('readingMemory.review.evidence.abstained')).toBeNull();
    expect(screen.getByRole('article')).toBeTruthy();
    expect(props.onCompare).not.toHaveBeenCalled();

    rerender(
      <ReadingReviewEvidence
        {...props}
        state={{ phase: 'idle', result: { ...result, sentProvider: undefined } }}
      />,
    );
    const unknownSenderReceipt = within(screen.getByRole('region', { name: receiptLabel }));
    expect(unknownSenderReceipt.getByText('readingMemory.sentEvidence 3')).toBeTruthy();
    expect(unknownSenderReceipt.queryByText('readingMemory.review.evidence.notSent')).toBeNull();
    expect(unknownSenderReceipt.queryByText(/readingMemory\.privacy\.recipient/)).toBeNull();
  });

  it('renders only relations whose evidence id and version remain in both snapshots and removes stale results immediately', () => {
    const stable = evidence('stable', { content: '<img src="private"> 保存的判断。' });
    const changed = evidence('changed', { sourceVersion: 'version-2' });
    const unsent = evidence('unsent');
    const blank = evidence('blank');
    const deleted = evidence('deleted');
    const explanation = '<script>alert(1)</script> 适用条件不同。';
    const result = generated([stable, changed, unsent, blank]);
    result.judgment.evidence = [stable, { ...changed, sourceVersion: 'version-1' }, blank, deleted];
    result.judgment.output = {
      kind: 'evidence-comparison',
      relations: [
        { evidenceId: stable.id, relation: 'complementary', explanation },
        { evidenceId: changed.id, relation: 'opposite', explanation: '版本不匹配的关系' },
        { evidenceId: unsent.id, relation: 'same', explanation: '未发送证据的关系' },
        { evidenceId: deleted.id, relation: 'same', explanation: '已删除证据的关系' },
        { evidenceId: 'unknown', relation: 'same', explanation: '未知证据的关系' },
        { evidenceId: blank.id, relation: 'same', explanation: ' \n ' },
      ],
    };
    const { props, rerender, container } = renderEvidence({ phase: 'idle', result });
    const cards = screen.getAllByRole('article');

    expect(cards).toHaveLength(4);
    expect(within(cards[0]).getByText(stable.content)).toBeTruthy();
    expect(within(cards[0]).getByText(explanation)).toBeTruthy();
    expect(within(cards[0]).getByText('readingEvidence.relations.complementary')).toBeTruthy();
    for (const card of cards.slice(1))
      expect(within(card).queryByText(/readingEvidence\.relations\./)).toBeNull();
    for (const hidden of [
      '版本不匹配的关系',
      '未发送证据的关系',
      '已删除证据的关系',
      '未知证据的关系',
    ])
      expect(screen.queryByText(hidden)).toBeNull();
    expect(container.querySelector('img, script')).toBeNull();

    rerender(
      <ReadingReviewEvidence
        {...props}
        state={{
          phase: 'idle',
          result: {
            ...result,
            evidence: [{ ...stable, sourceVersion: 'version-2' }, changed, unsent, blank],
          },
        }}
      />,
    );
    expect(screen.queryByText(explanation)).toBeNull();
    expect(screen.queryByText(/readingEvidence\.relations\./)).toBeNull();
    expect(screen.getByText('readingMemory.review.evidence.abstained')).toBeTruthy();

    rerender(
      <ReadingReviewEvidence
        {...props}
        state={{ phase: 'idle', result: { ...result, evidence: [changed, unsent, blank] } }}
      />,
    );
    expect(screen.queryByText(stable.content)).toBeNull();
    expect(screen.queryByText(explanation)).toBeNull();
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('does not present other judgment output kinds or empty relations as evidence comparisons', () => {
    const result = generated();
    const { props, rerender } = renderEvidence({ phase: 'idle', result });
    const card = screen.getByRole('article');
    expect(screen.getByText(relationExplanation)).toBeTruthy();

    const outputs = [
      {
        kind: 'reading-relations',
        relations: [
          { evidenceId: result.evidence[0].id, relation: 'same', explanation: relationExplanation },
        ],
      },
      { kind: 'library-answer', judgments: [], supporting: [], opposingOrLimiting: [], gaps: [] },
      { kind: 'evidence-comparison', relations: [] },
    ] satisfies GeneratedResult['judgment']['output'][];
    for (const output of outputs) {
      rerender(
        <ReadingReviewEvidence
          {...props}
          state={{ phase: 'idle', result: { ...result, judgment: { ...result.judgment, output } } }}
        />,
      );
      expect(screen.getByRole('article')).toBe(card);
      expect(screen.queryByText(relationExplanation)).toBeNull();
      expect(screen.queryByText(/readingEvidence\.relations\./)).toBeNull();
      expect(Boolean(screen.queryByText('readingMemory.review.evidence.abstained'))).toBe(
        output.kind === 'evidence-comparison',
      );
    }
    expect(props.onCompare).not.toHaveBeenCalled();
  });

  it('hides old relations and receipts after failure or cancellation while preserving retryable local cards', () => {
    const result = generated();
    const { props, rerender } = renderEvidence({ phase: 'idle', result });
    const card = screen.getByRole('article');
    expect(screen.getByText(relationExplanation)).toBeTruthy();
    expect(screen.getByRole('region', { name: receiptLabel })).toBeTruthy();

    for (const phase of ['failed', 'canceled'] as const) {
      rerender(<ReadingReviewEvidence {...props} state={{ phase, result }} />);
      expect(screen.getByRole('article')).toBe(card);
      expect(screen.getByText(result.evidence[0].content)).toBeTruthy();
      expect(screen.queryByText(relationExplanation)).toBeNull();
      expect(screen.queryByRole('region', { name: receiptLabel })).toBeNull();
      expect(
        screen.queryByText('readingMemory.privacy.recipient Sent Provider sent-model'),
      ).toBeNull();
      expect(screen.getByRole(phase === 'failed' ? 'alert' : 'status').textContent).toBe(
        `readingMemory.review.evidence.${phase}`,
      );
      fireEvent.click(screen.getByRole('button', { name: compareLabel }));
    }
    expect(props.onCompare).toHaveBeenCalledTimes(2);
    expect(props.onConfirmPrivacy).not.toHaveBeenCalled();
  });

  it('distinguishes an empty local search from a failed search without inventing a remote result', () => {
    const { props, rerender } = renderEvidence({ phase: 'idle', result: session([]) });
    expect(screen.getByText('readingMemory.review.evidence.empty')).toBeTruthy();
    expect(screen.queryByText('readingMemory.review.evidence.abstained')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('region', { name: receiptLabel })).toBeNull();

    rerender(<ReadingReviewEvidence {...props} state={{ phase: 'search-failed' }} />);
    expect(screen.getByRole('alert').textContent).toBe('readingMemory.relations.searchFailed');
    expect(screen.queryByText('readingMemory.review.evidence.empty')).toBeNull();
    expect(screen.queryByRole('region', { name: 'readingMemory.coverage' })).toBeNull();
    expect(screen.queryByRole('region', { name: receiptLabel })).toBeNull();
    expect(props.onCompare).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: compareLabel }));
    expect(props.onCompare).toHaveBeenCalledOnce();
  });
});

function renderEvidence(
  state: ReadingReviewComparisonState | null,
  provider: ReadingMemoryProviderDescriptor | null = currentProvider,
) {
  const props = {
    provider,
    state,
    onCompare: vi.fn(),
    onConfirmPrivacy: vi.fn(),
    onDismissPrivacy: vi.fn(),
    onCancel: vi.fn(),
    onOpenEvidenceSource: vi.fn(),
  } satisfies EvidenceProps;
  return { props, ...render(<ReadingReviewEvidence {...props} />) };
}

function evidence(id: string, overrides: Partial<ReadingEvidence> = {}): ReadingEvidence {
  return {
    id,
    assetType: 'comment',
    role: 'judgment',
    authorKind: 'user',
    content: `${id}：间隔复习有助于长期记忆。`,
    sourceVersion: 'version-1',
    source: {
      ref: { kind: 'article', id: 'source-article' },
      sourceType: 'web',
      title: '学习的条件',
      byline: '第三章',
    },
    location: {
      annotationId: `annotation-${id}`,
      commentId: `comment-${id}`,
      anchor: { exact: '原文摘录', prefix: '', suffix: '', start: 0, end: 4 },
    },
    createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
    ...overrides,
  };
}

function session(entries = [evidence('first')]): ReadingReviewEvidenceSession {
  return {
    requestId: 'review-request',
    comparisonId: 'comparison-request',
    routeRevision: 'route-revision',
    evidence: entries,
    mode: 'keyword',
    projection: { state: 'available', coverage: { projectedAssetCount: 4, eligibleAssetCount: 6 } },
    semantic: {
      state: 'not_installed',
      modelVersion: 'reading-memory-v1',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 8 },
      indexingPaused: false,
    },
    provider: currentProvider,
    remoteConsentRequired: true,
  };
}

function generated(entries = [evidence('first')]): GeneratedResult {
  return {
    ...session(entries),
    sentProvider,
    judgment: {
      state: 'generated',
      evidence: entries,
      output: {
        kind: 'evidence-comparison',
        relations: [
          {
            evidenceId: entries[0].id,
            relation: 'complementary',
            explanation: relationExplanation,
          },
        ],
      },
      inputTruncated: false,
      sentEvidenceCount: entries.length,
    },
  };
}
