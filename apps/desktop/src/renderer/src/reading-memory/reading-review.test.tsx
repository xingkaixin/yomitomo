// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReadingEvidence, ReadingReviewEvent } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ReadingMemoryProviderDescriptor,
  ReadingReviewEvidenceResult,
  ReadingReviewEvidenceSession,
  ReadingReviewQueue,
  ReadingReviewQueueItem,
  ReadingReviewRevealResult,
  ReadingReviewSession,
  ReadingReviewSubmitResult,
} from '../../../ipc-contract';
import type { YomitomoDesktopApi } from '../../../preload';
import { ReadingReview } from './reading-review';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
    i18n: { language: 'zh-CN' },
  }),
}));

type ReadingMemoryApi = YomitomoDesktopApi['readingMemory'];
type ReviewApi = ReadingMemoryApi['review'];

const api = {
  confirmPrivacy: vi.fn<ReadingMemoryApi['confirmPrivacy']>(),
  review: {
    queue: vi.fn<ReviewApi['queue']>(),
    start: vi.fn<ReviewApi['start']>(),
    reveal: vi.fn<ReviewApi['reveal']>(),
    history: vi.fn<ReviewApi['history']>(),
    submit: vi.fn<ReviewApi['submit']>(),
    cancel: vi.fn<ReviewApi['cancel']>(),
    searchEvidence: vi.fn<ReviewApi['searchEvidence']>(),
    compareEvidence: vi.fn<ReviewApi['compareEvidence']>(),
  },
} satisfies Pick<ReadingMemoryApi, 'confirmPrivacy' | 'review'>;

const provider: ReadingMemoryProviderDescriptor = {
  id: 'review-provider',
  name: 'Review Provider',
  type: 'openai-chat',
  modelName: 'review-model',
};
const answer = '现在我认为主动回想比重复阅读更重要。';
const currentJudgment = '此前认为理解需要及时反馈。';
const baseJudgment = '原始判断是重复阅读足以形成长期记忆。';
const historicalAnswer = '上一次回想时尚未考虑遗忘的影响。';
const compareLabel = 'readingMemory.review.evidence.compare';
const first = item('first');
const second = item('second');
const evidence = {
  id: 'recent-evidence',
  assetType: 'comment',
  role: 'judgment',
  authorKind: 'user',
  content: '最近的证据表明提取练习需要间隔。',
  sourceVersion: 'evidence-version',
  source: {
    ref: { kind: 'article', id: 'evidence-article' },
    sourceType: 'web',
    title: '提取练习的新证据',
  },
  location: {
    annotationId: 'evidence-annotation',
    commentId: 'evidence-comment',
    anchor: { exact: '原文证据', prefix: '', suffix: '', start: 0, end: 4 },
  },
  createdAt: '2026-08-28T10:00:00.000Z',
  updatedAt: '2026-08-28T10:00:00.000Z',
} satisfies ReadingEvidence;

beforeEach(() => {
  vi.resetAllMocks();
  api.confirmPrivacy.mockResolvedValue(undefined);
  api.review.queue.mockResolvedValue(queue());
  api.review.start.mockImplementation(async ({ requestId, asset }) =>
    session(requestId, asset.assetId === second.asset.assetId ? second : first),
  );
  api.review.reveal.mockImplementation(async ({ requestId, answer: frozenAnswer }) =>
    revealed(requestId, frozenAnswer),
  );
  api.review.history.mockResolvedValue({ events: [], nextCursor: null });
  api.review.submit.mockImplementation(async ({ requestId, eventId, decision }) => ({
    requestId,
    event: { ...event(), id: eventId, decision, answer },
  }));
  api.review.cancel.mockResolvedValue(undefined);
  api.review.searchEvidence.mockImplementation(async ({ requestId, comparisonId }) =>
    localEvidence(requestId, comparisonId),
  );
  api.review.compareEvidence.mockImplementation(async ({ requestId, comparisonId }) =>
    compared(localEvidence(requestId, comparisonId)),
  );
  vi.stubGlobal('yomitomoDesktop', { readingMemory: api });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReadingReview', () => {
  it('shows an honest empty queue without inventing judgments or starting a review', async () => {
    api.review.queue.mockResolvedValue(queue([]));
    renderReview();

    expect(await screen.findByText('readingMemory.review.emptyQueue')).toBeTruthy();
    expect(screen.getByText('readingMemory.review.emptyHint')).toBeTruthy();
    expect(screen.getByText('readingMemory.review.completedCount 0')).toBeTruthy();
    expect(screen.getByText('readingMemory.review.queueCount 0')).toBeTruthy();
    expect(screen.getByText('readingMemory.review.timeOrder')).toBeTruthy();
    expect(screen.getByText('readingMemory.review.candidateCoverage 0 0 0')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'readingMemory.review.start' })).toBeNull();
    expect(screen.queryByText(baseJudgment)).toBeNull();
    expect(api.review.start).not.toHaveBeenCalled();
    expect(api.review.searchEvidence).not.toHaveBeenCalled();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    expect(api.review.submit).not.toHaveBeenCalled();
  });

  it('keeps prior judgments out of the blind stage and permits an empty answer only for needing evidence', async () => {
    api.review.start.mockImplementation(async ({ requestId }) => revealed(requestId, ''));
    const { onOpenEvidenceSource } = renderReview();
    await startFirst();

    const input = screen.getByRole<HTMLTextAreaElement>('textbox', {
      name: 'readingMemory.review.answer',
    });
    expect(input.value).toBe('');
    await waitFor(() => expect(input).toBe(document.activeElement));
    expect(screen.getByText(first.source.title)).toBeTruthy();
    expect(screen.getByLabelText('readingMemory.review.sourceQuote').textContent).toBe(first.quote);
    expect(screen.getByText(/readingMemory.review.formedAt.*2026/)).toBeTruthy();
    expect(screen.getByText(/readingMemory.review.lastReviewedAt.*2026/)).toBeTruthy();
    for (const hidden of [currentJudgment, baseJudgment, historicalAnswer])
      expect(screen.queryByText(hidden)).toBeNull();
    expect(screen.queryByRole('region', { name: 'readingMemory.review.history.title' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'readingEvidence.openSource' })).toBeNull();
    expect(screen.queryByRole('button', { name: compareLabel })).toBeNull();
    expect(api.review.reveal).not.toHaveBeenCalled();
    expect(api.review.history).not.toHaveBeenCalled();

    const reveal = screen.getByRole<HTMLButtonElement>('button', {
      name: 'readingMemory.review.reveal',
    });
    expect(reveal.disabled).toBe(true);
    fireEvent.click(reveal);
    expect(api.review.reveal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.needEvidenceFirst' }));

    await screen.findByRole('region', { name: 'readingMemory.review.revealedTitle' });
    expect(api.review.reveal).toHaveBeenCalledExactlyOnceWith({
      requestId: api.review.start.mock.calls[0][0].requestId,
      answer: '',
    });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('readingMemory.review.noAnswer')).toBeTruthy();
    expect(screen.getByText(currentJudgment)).toBeTruthy();
    expect(screen.getByText(baseJudgment)).toBeTruthy();
    expect(screen.getByText(historicalAnswer)).toBeTruthy();
    for (const decision of ['still_agree', 'changed'])
      expect(
        screen.getByRole<HTMLButtonElement>('button', {
          name: `readingMemory.review.decisions.${decision}`,
        }).disabled,
      ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'readingMemory.review.decisions.need_evidence',
      }).disabled,
    ).toBe(false);
    expect(api.review.submit).not.toHaveBeenCalled();
    expect(onOpenEvidenceSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'readingEvidence.openSource' }));
    expect(onOpenEvidenceSource).toHaveBeenCalledExactlyOnceWith({
      articleId: first.asset.articleId,
      annotationId: first.asset.annotationId,
      view: 'source',
      readingMemoryJump: true,
    });
  });

  it('freezes the revealed answer and advances completion only after a successful explicit submission', async () => {
    const saving = deferred<ReadingReviewSubmitResult>();
    api.review.submit.mockReturnValueOnce(saving.promise);
    renderReview();
    await revealFirst();

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(answer)).toBeTruthy();
    expect(screen.getByText('readingMemory.review.answerFrozen')).toBeTruthy();
    expect(screen.getByText('readingMemory.review.completedCount 0')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'readingMemory.review.doneTitle' })).toBeNull();
    expect(api.review.submit).not.toHaveBeenCalled();
    expect(api.review.searchEvidence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.decisions.changed' }));

    expect(screen.getByText('readingMemory.review.submitting')).toBeTruthy();
    expect(screen.getByText('readingMemory.review.completedCount 0')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'readingMemory.review.decisions.changed' }),
    ).toBeNull();
    const submission = api.review.submit.mock.calls[0][0];
    expect(submission).toEqual({
      requestId: api.review.start.mock.calls[0][0].requestId,
      eventId: expect.any(String),
      decision: 'changed',
    });
    await act(async () =>
      saving.resolve({
        requestId: submission.requestId,
        event: { ...event(), id: submission.eventId, decision: 'changed', answer },
      }),
    );

    expect(screen.getByRole('region', { name: 'readingMemory.review.doneTitle' })).toBeTruthy();
    expect(screen.getByText('readingMemory.review.completedCount 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.next' }));
    await screen.findByRole('textbox');
    expect(screen.getByText(second.source.title)).toBeTruthy();
    expect(api.review.start.mock.calls[1][0].asset).toEqual(second.asset);
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('');
    const cancel = screen.getByRole('button', { name: 'readingMemory.review.cancel' });
    cancel.focus();
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'readingMemory.review.title' }),
    );
    expect(screen.queryByRole('article', { name: first.source.title })).toBeNull();
    expect(screen.getByRole('article', { name: second.source.title })).toBeTruthy();
    expect(screen.getByText('readingMemory.review.queueCount 1')).toBeTruthy();
    expect(screen.getByText('readingMemory.review.completedCount 1')).toBeTruthy();
    expect(api.review.submit).toHaveBeenCalledOnce();
  });

  it('retries a failed frozen submission with its original event id and restarts a conflict with an empty blind answer', async () => {
    api.review.submit
      .mockRejectedValueOnce(new Error('Disk unavailable'))
      .mockRejectedValueOnce(new Error('READING_REVIEW_CONFLICT'));
    renderReview();
    await revealFirst();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.decisions.changed' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'readingMemory.review.submitFailed',
    );
    expect(screen.getByText(answer)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'readingMemory.review.decisions.changed' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'readingMemory.review.restart' })).toBeNull();
    expect(screen.getByText('readingMemory.review.completedCount 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.retrySubmit' }));

    expect(await screen.findByText('readingMemory.review.conflict')).toBeTruthy();
    expect(api.review.submit.mock.calls[1][0]).toEqual(api.review.submit.mock.calls[0][0]);
    expect(screen.queryByRole('button', { name: 'readingMemory.review.retrySubmit' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('readingMemory.review.completedCount 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.restart' }));

    const input = await screen.findByRole<HTMLTextAreaElement>('textbox');
    expect(input.value).toBe('');
    expect(screen.queryByText(answer)).toBeNull();
    expect(screen.queryByText(currentJudgment)).toBeNull();
    expect(screen.queryByText(historicalAnswer)).toBeNull();
    expect(api.review.start.mock.calls[1][0].requestId).not.toBe(
      api.review.start.mock.calls[0][0].requestId,
    );
    expect(api.review.start.mock.calls[1][0].asset).toEqual(first.asset);
  });

  it('keeps a conflicting reveal blind and frozen until the user restarts with an empty answer', async () => {
    api.review.reveal.mockRejectedValueOnce(new Error('READING_REVIEW_CONFLICT'));
    renderReview();
    await startFirst();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: answer } });
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.reveal' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'readingMemory.review.conflict',
    );
    const frozenInput = screen.getByRole<HTMLTextAreaElement>('textbox');
    expect(frozenInput.readOnly).toBe(true);
    expect(frozenInput.value).toBe(answer);
    expect(screen.queryByRole('button', { name: 'readingMemory.review.retryReveal' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'readingMemory.review.reveal' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'readingMemory.review.revealedTitle' })).toBeNull();
    for (const hidden of [currentJudgment, baseJudgment, historicalAnswer])
      expect(screen.queryByText(hidden)).toBeNull();
    expect(screen.getByText('readingMemory.review.completedCount 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.restart' }));

    const input = await screen.findByRole<HTMLTextAreaElement>('textbox');
    expect(input.value).toBe('');
    expect(input.readOnly).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'readingMemory.review.restart' })).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'readingMemory.review.reveal' })
        .disabled,
    ).toBe(true);
  });

  it('compares only after an explicit action and privacy confirmation without sending the blind answer in remote inputs', async () => {
    const consent = deferred<void>();
    api.confirmPrivacy.mockReturnValueOnce(consent.promise);
    renderReview();
    await revealFirst();
    expect(api.review.searchEvidence).not.toHaveBeenCalled();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: compareLabel }));
    await screen.findByRole('region', { name: 'readingMemory.privacy.title' });
    expect(screen.getByText(evidence.content)).toBeTruthy();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.privacy.stayLocal' }));
    expect(screen.queryByRole('region', { name: 'readingMemory.privacy.title' })).toBeNull();
    expect(screen.getByText(evidence.content)).toBeTruthy();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: compareLabel }));
    await screen.findByRole('region', { name: 'readingMemory.privacy.title' });
    fireEvent.click(
      screen.getByRole('button', { name: 'readingMemory.review.evidence.confirmPrivacy' }),
    );
    expect(api.confirmPrivacy).toHaveBeenCalledOnce();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    await act(async () => consent.resolve());

    expect(screen.getByText('较新证据补充了适用条件。')).toBeTruthy();
    const search = api.review.searchEvidence.mock.calls[1][0];
    expect(search).toEqual({
      requestId: api.review.start.mock.calls[0][0].requestId,
      comparisonId: expect.any(String),
      expectedRouteRevision: 'route-revision',
    });
    expect(api.review.compareEvidence).toHaveBeenCalledExactlyOnceWith({
      requestId: search.requestId,
      comparisonId: search.comparisonId,
    });
    const receipt = within(
      screen.getByRole('region', { name: 'readingMemory.review.evidence.receipt' }),
    );
    expect(receipt.getByText('readingMemory.sentEvidence 1')).toBeTruthy();
    expect(
      receipt.getByText('readingMemory.privacy.recipient Review Provider review-model'),
    ).toBeTruthy();
    expect(screen.getByText(answer)).toBeTruthy();
    expect(api.review.submit).not.toHaveBeenCalled();
    expect(screen.getByText('readingMemory.review.completedCount 0')).toBeTruthy();
  });

  it('retains local candidates and permits submission without a provider or after a remote failure', async () => {
    api.review.searchEvidence
      .mockImplementationOnce(async ({ requestId, comparisonId }) => ({
        ...localEvidence(requestId, comparisonId),
        provider: null,
      }))
      .mockImplementationOnce(async ({ requestId, comparisonId }) => ({
        ...localEvidence(requestId, comparisonId),
        remoteConsentRequired: false,
      }));
    api.review.compareEvidence.mockRejectedValueOnce(new Error('Provider unavailable'));
    renderReview();
    await revealFirst();
    fireEvent.click(screen.getByRole('button', { name: compareLabel }));

    expect(await screen.findByText(evidence.content)).toBeTruthy();
    expect(screen.getByText('readingMemory.review.evidence.noProvider')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'readingMemory.privacy.title' })).toBeNull();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'readingMemory.review.decisions.changed',
      }).disabled,
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: compareLabel }));
    expect(await screen.findByText('readingMemory.review.evidence.failed')).toBeTruthy();
    expect(screen.getByText(evidence.content)).toBeTruthy();
    expect(screen.getByText(answer)).toBeTruthy();
    expect(
      screen.queryByRole('region', { name: 'readingMemory.review.evidence.receipt' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: compareLabel })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.decisions.changed' }));
    expect(
      await screen.findByRole('region', { name: 'readingMemory.review.doneTitle' }),
    ).toBeTruthy();
    expect(screen.getByText('readingMemory.review.completedCount 1')).toBeTruthy();
  });

  it('cancels only the comparison and ignores its late result while keeping the review available for submission', async () => {
    const pending = deferred<ReadingReviewEvidenceResult>();
    api.review.searchEvidence.mockImplementation(async ({ requestId, comparisonId }) => ({
      ...localEvidence(requestId, comparisonId),
      remoteConsentRequired: false,
    }));
    api.review.compareEvidence.mockReturnValueOnce(pending.promise);
    renderReview();
    await revealFirst();
    fireEvent.click(screen.getByRole('button', { name: compareLabel }));
    await screen.findByText('readingMemory.review.evidence.comparing');
    const search = api.review.searchEvidence.mock.calls[0][0];
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(api.review.cancel).toHaveBeenCalledExactlyOnceWith({
      requestId: search.requestId,
      comparisonId: search.comparisonId,
    });
    expect(screen.getByText('readingMemory.review.evidence.canceled')).toBeTruthy();
    expect(screen.getByText(evidence.content)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'readingMemory.review.revealedTitle' })).toBeTruthy();
    await act(async () =>
      pending.resolve(compared(localEvidence(search.requestId, search.comparisonId))),
    );
    expect(screen.getByText('readingMemory.review.evidence.canceled')).toBeTruthy();
    expect(screen.queryByText('较新证据补充了适用条件。')).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'readingMemory.review.evidence.receipt' }),
    ).toBeNull();
    expect(screen.getByText(answer)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'readingMemory.review.decisions.still_agree' }),
    );
    expect(
      await screen.findByRole('region', { name: 'readingMemory.review.doneTitle' }),
    ).toBeTruthy();
    expect(screen.getByText('readingMemory.review.completedCount 1')).toBeTruthy();
  });
});

function renderReview() {
  const onOpenEvidenceSource = vi.fn();
  return {
    onOpenEvidenceSource,
    ...render(<ReadingReview catalogRevision={0} onOpenEvidenceSource={onOpenEvidenceSource} />),
  };
}

async function startFirst() {
  const card = await screen.findByRole('article', { name: first.source.title });
  fireEvent.click(within(card).getByRole('button', { name: 'readingMemory.review.start' }));
  await screen.findByRole('textbox', { name: 'readingMemory.review.answer' });
}

async function revealFirst() {
  await startFirst();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: `  ${answer}  ` } });
  fireEvent.click(screen.getByRole('button', { name: 'readingMemory.review.reveal' }));
  await screen.findByRole('region', { name: 'readingMemory.review.revealedTitle' });
}

function item(id: string): ReadingReviewQueueItem {
  return {
    asset: {
      articleId: `article-${id}`,
      annotationId: `annotation-${id}`,
      assetType: 'comment',
      assetId: `comment-${id}`,
    },
    source: {
      ref: { kind: 'article', id: `article-${id}` },
      sourceType: 'web',
      title: `学习方法 ${id}`,
      byline: '记忆研究',
    },
    quote: `原文线索 ${id}：回忆并不是简单重现。`,
    formedAt: '2026-06-01T10:00:00.000Z',
    lastReviewedAt: '2026-08-01T10:00:00.000Z',
  };
}

function queue(items = [first, second]): ReadingReviewQueue {
  return {
    items,
    mode: 'time',
    projection: {
      state: 'available',
      coverage: { projectedAssetCount: items.length, eligibleAssetCount: items.length },
    },
    semantic: {
      state: 'not_installed',
      modelVersion: 'memory-model-v1',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: items.length },
      indexingPaused: false,
    },
    coverage: {
      eligibleAssetCount: items.length,
      timeCandidateCount: items.length,
      semanticCandidateCount: 0,
      recentEvidenceCount: 0,
    },
    semanticWindow: { candidateLimit: 64, evidenceLimit: 128, lookbackDays: 30 },
  };
}

function session(requestId: string, source = first): ReadingReviewSession {
  return {
    ...source,
    requestId,
    provider,
    routeRevision: 'route-revision',
    remoteConsentRequired: true,
  };
}

function revealed(requestId: string, frozenAnswer: string): ReadingReviewRevealResult {
  return {
    ...session(requestId),
    answer: frozenAnswer,
    currentJudgment,
    baseJudgment,
    history: { events: [event()], nextCursor: null },
    sourceTarget: { articleId: first.asset.articleId, annotationId: first.asset.annotationId },
  };
}

function event(): ReadingReviewEvent {
  return {
    ...first.asset,
    id: 'historical-review',
    assetVersion: 'asset-version',
    judgmentSnapshot: '当时的观点缺少实验反馈。',
    judgmentDigest: 'judgment-digest',
    previousReviewId: null,
    decision: 'still_agree',
    answer: historicalAnswer,
    createdAt: '2026-08-01T10:00:00.000Z',
  };
}

function localEvidence(requestId: string, comparisonId: string): ReadingReviewEvidenceSession {
  return {
    requestId,
    comparisonId,
    routeRevision: 'route-revision',
    evidence: [evidence],
    mode: 'keyword',
    projection: queue().projection,
    semantic: queue().semantic,
    provider,
    remoteConsentRequired: true,
  };
}

function compared(local: ReadingReviewEvidenceSession): ReadingReviewEvidenceResult {
  return {
    ...local,
    remoteConsentRequired: false,
    sentProvider: provider,
    judgment: {
      state: 'generated',
      evidence: local.evidence,
      output: {
        kind: 'evidence-comparison',
        relations: [
          {
            evidenceId: evidence.id,
            relation: 'complementary',
            explanation: '较新证据补充了适用条件。',
          },
        ],
      },
      inputTruncated: false,
      sentEvidenceCount: local.evidence.length,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
