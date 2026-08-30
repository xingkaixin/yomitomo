// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Collection, ReadingEvidenceScope } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ReadingLibraryAnswerResult,
  ReadingLibraryContext,
  ReadingLibrarySession,
} from '../../../ipc-contract';
import type { YomitomoDesktopApi } from '../../../preload';
import { ReadingLibraryQuestion } from './reading-library-question';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
  }),
}));

type ReadingMemoryApi = YomitomoDesktopApi['readingMemory'];
const api = {
  confirmPrivacy: vi.fn<ReadingMemoryApi['confirmPrivacy']>(),
  library: {
    context: vi.fn<ReadingMemoryApi['library']['context']>(),
    search: vi.fn<ReadingMemoryApi['library']['search']>(),
    answer: vi.fn<ReadingMemoryApi['library']['answer']>(),
    cancel: vi.fn<ReadingMemoryApi['library']['cancel']>(),
  },
} satisfies Pick<ReadingMemoryApi, 'confirmPrivacy' | 'library'>;
const openDraft = vi.fn<YomitomoDesktopApi['annotations']['discussion']['open']>();
const keys = 'readingMemory.library';

beforeEach(() => {
  vi.resetAllMocks();
  api.confirmPrivacy.mockResolvedValue(undefined);
  api.library.context.mockImplementation(async ({ scope }) => context(scope));
  api.library.search.mockImplementation(async ({ requestId, scope }) => session(requestId, scope));
  api.library.answer.mockImplementation(async ({ requestId }) => answered(session(requestId)));
  api.library.cancel.mockResolvedValue(undefined);
  openDraft.mockResolvedValue({ reused: false, windowId: 1 });
  vi.stubGlobal('yomitomoDesktop', {
    readingMemory: api,
    annotations: { discussion: { open: openDraft } },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReadingLibraryQuestion', () => {
  it('shows local scope counts, sparse coverage and the destination without automatically searching', async () => {
    const { props } = renderQuestion();
    const summary = within(screen.getByRole('region', { name: `${keys}.context` }));
    expect(await summary.findByText(`${keys}.counts 4 2`)).toBeTruthy();
    expect(summary.getByText(`${keys}.sparse`)).toBeTruthy();
    expect(summary.getByText(`${keys}.keywordHint`)).toBeTruthy();
    expect(
      summary.getByText('readingMemory.privacy.recipient Test provider test-model'),
    ).toBeTruthy();
    expect(
      summary.getByText('readingMemory.projectionCoverage 2 3', { exact: false }),
    ).toBeTruthy();
    expect(summary.getByText('readingMemory.semanticCoverage 0 3', { exact: false })).toBeTruthy();
    expect(
      screen.getByRole('textbox', { name: `${keys}.question` }).getAttribute('maxlength'),
    ).toBe('10000');
    expect(screen.getByRole('button', { name: `${keys}.ask` }).hasAttribute('disabled')).toBe(true);
    expect(api.library.search).not.toHaveBeenCalled();
    expect(api.library.answer).not.toHaveBeenCalled();
    expect(props.onOpenEvidenceSource).not.toHaveBeenCalled();
    expect(openDraft).not.toHaveBeenCalled();
  });

  it('requires a concrete collection and keeps an empty source scope local instead of falling back to the library', async () => {
    const collection: Collection = {
      id: 'collection',
      name: 'Named collection',
      createdAt: '',
      updatedAt: '',
    };
    api.library.context.mockImplementation(async ({ scope }) => ({
      ...context(scope),
      ...(scope.kind === 'sources' ? { sourceCount: 0, judgmentCount: 0 } : {}),
      ...(scope.kind === 'collection' ? { collectionName: collection.name } : {}),
    }));
    renderQuestion([collection]);
    await screen.findByText(`${keys}.counts 4 2`);
    fireEvent.change(screen.getByRole('textbox', { name: `${keys}.question` }), {
      target: { value: 'A question' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: `${keys}.scope` }), {
      target: { value: 'collection' },
    });
    expect(screen.getByText(`${keys}.chooseCollection`)).toBeTruthy();
    expect(screen.getByRole('button', { name: `${keys}.ask` }).hasAttribute('disabled')).toBe(true);
    expect(api.library.context).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('combobox', { name: `${keys}.collection` }), {
      target: { value: collection.id },
    });
    expect(await screen.findByText(`${keys}.actualCollection Named collection`)).toBeTruthy();
    expect(api.library.context).toHaveBeenLastCalledWith({
      scope: { kind: 'collection', collectionId: collection.id },
    });
    fireEvent.change(screen.getByRole('combobox', { name: `${keys}.scope` }), {
      target: { value: 'sources' },
    });
    expect(await screen.findByText(`${keys}.counts 0 0`)).toBeTruthy();
    expect(screen.getByText(`${keys}.chooseSomeSources`)).toBeTruthy();
    expect(screen.getByRole('button', { name: `${keys}.ask` }).hasAttribute('disabled')).toBe(true);
    expect(api.library.context).toHaveBeenLastCalledWith({
      scope: { kind: 'sources', sources: [] },
    });
    expect(api.library.search).not.toHaveBeenCalled();
    expect(api.library.answer).not.toHaveBeenCalled();
  });

  it('shows local cards and focused disclosure before remote consent, then keeps cancellation available', async () => {
    const confirmation = deferred<void>();
    api.confirmPrivacy.mockReturnValueOnce(confirmation.promise);
    renderQuestion();
    await screen.findByText(`${keys}.counts 4 2`);
    submit('  A question  ');
    const privacy = await screen.findByRole('region', { name: 'readingMemory.privacy.title' });
    expect(document.activeElement).toBe(privacy);
    expect(screen.getByRole('region', { name: `${keys}.localEvidence` })).toBeTruthy();
    expect(api.library.search).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'A question',
        expectedRouteRevision: context().routeRevision,
      }),
    );
    expect(api.library.answer).not.toHaveBeenCalled();
    fireEvent.click(
      within(privacy).getByRole('button', { name: 'readingMemory.privacy.stayLocal' }),
    );
    expect(screen.queryByRole('region', { name: 'readingMemory.privacy.title' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: `${keys}.ask` }));
    fireEvent.click(
      screen.getByRole('button', { name: `${keys}.answerWith Test provider test-model` }),
    );
    fireEvent.click(screen.getByRole('button', { name: `${keys}.confirmPrivacy` }));
    await waitFor(() => expect(api.confirmPrivacy).toHaveBeenCalledOnce());
    expect(document.activeElement).toBe(screen.getByText(`${keys}.answering`));
    const cancel = screen.getByRole('button', { name: 'common.cancel' });
    fireEvent.click(cancel);
    expect(screen.getByText(`${keys}.canceled`)).toBeTruthy();
    expect(screen.getByRole('region', { name: `${keys}.localEvidence` })).toBeTruthy();
    await act(async () => confirmation.resolve());
    expect(api.library.search).toHaveBeenCalledOnce();
    expect(api.library.answer).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: `${keys}.receipt` })).toBeNull();
  });

  it('discloses a changed provider and requires another submit before sending to the new destination', async () => {
    const next = {
      ...context(),
      routeRevision: 'b'.repeat(64),
      remoteConsentRequired: false,
      provider: {
        id: 'next',
        name: 'Next provider',
        type: 'openai-chat' as const,
        modelName: 'next-model',
      },
    };
    api.library.search.mockImplementationOnce(async ({ requestId }) => ({
      ...session(requestId),
      ...next,
      providerChanged: true,
    }));
    api.library.search.mockImplementationOnce(async ({ requestId }) => ({
      ...session(requestId),
      ...next,
    }));
    renderQuestion();
    await screen.findByText(`${keys}.counts 4 2`);
    submit('A question');
    expect(await screen.findByText('readingMemory.providerChanged')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: `${keys}.context` })).getByText(
        'readingMemory.privacy.recipient Next provider next-model',
      ),
    ).toBeTruthy();
    expect(api.library.answer).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /readingMemory.library.answerWith/ })).toBeNull();
    expect(screen.getByRole('region', { name: `${keys}.localEvidence` })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: `${keys}.ask` }));
    await screen.findByText('A supported library answer');
    expect(api.library.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRouteRevision: next.routeRevision }),
    );
    expect(api.library.answer).toHaveBeenCalledOnce();
  });

  it('hides a previous answer and receipt during a new failed request and allows an explicit retry', async () => {
    api.library.search.mockImplementation(async ({ requestId, scope }) => ({
      ...session(requestId, scope),
      remoteConsentRequired: false,
    }));
    api.library.answer.mockResolvedValueOnce(answered(session('first')));
    api.library.answer.mockRejectedValueOnce(new Error('Answer IPC unavailable'));
    renderQuestion();
    await screen.findByText(`${keys}.counts 4 2`);
    submit('First question');
    await screen.findByText('A supported library answer');
    expect(screen.getByRole('region', { name: `${keys}.receipt` })).toBeTruthy();

    submit('Second question');
    await screen.findByText(`${keys}.generationFailed`);
    expect(screen.queryByText('A supported library answer')).toBeNull();
    expect(screen.queryByRole('region', { name: `${keys}.receipt` })).toBeNull();
    expect(
      within(screen.getByRole('region', { name: `${keys}.localEvidence` })).getByText(
        'A local reading judgment',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${keys}.retryAnswer` }));
    await screen.findByText('A supported library answer');
    expect(api.library.answer).toHaveBeenCalledTimes(3);
    expect(api.confirmPrivacy).not.toHaveBeenCalled();
  });

  it('opens a thought draft only after choosing a citation and explicitly confirming', async () => {
    api.library.search.mockImplementation(async ({ requestId, scope }) => ({
      ...session(requestId, scope),
      remoteConsentRequired: false,
    }));
    const { props } = renderQuestion();
    await screen.findByText(`${keys}.counts 4 2`);
    submit('A question');
    const save = await screen.findByRole('button', { name: `${keys}.answer.saveThought` });
    fireEvent.click(save);
    const dialog = await screen.findByRole('dialog', { name: `${keys}.thought.title` });
    expect(within(dialog).getByText('A supported library answer')).toBeTruthy();
    expect(
      within(dialog)
        .getByRole('button', { name: `${keys}.thought.openDraft` })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(openDraft).not.toHaveBeenCalled();
    expect(props.onOpenEvidenceSource).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /Evidence source\s*A local reading judgment/ }),
    );
    expect(openDraft).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: `${keys}.thought.openDraft` }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(openDraft).toHaveBeenCalledExactlyOnceWith({
      articleId: 'source',
      annotationId: 'annotation',
      thoughtDraft: 'A supported library answer',
    });
    expect(props.onOpenEvidenceSource).not.toHaveBeenCalled();
  });

  it('preserves local cards and clears the prior receipt across failed answer retries', async () => {
    api.library.search.mockImplementation(async ({ requestId, scope }) => ({
      ...session(requestId, scope),
      remoteConsentRequired: false,
    }));
    api.library.answer.mockImplementationOnce(async ({ requestId }) => {
      const local = session(requestId);
      return {
        ...local,
        remoteConsentRequired: false,
        sentProvider: local.provider!,
        judgment: {
          state: 'local',
          reason: 'failed',
          evidence: local.evidence,
          inputTruncated: false,
          sentEvidenceCount: 1,
        },
      };
    });
    api.library.answer.mockRejectedValueOnce(new Error('Retry IPC unavailable'));
    renderQuestion();
    await screen.findByText(`${keys}.counts 4 2`);
    submit('A question');
    await screen.findByText(`${keys}.generationFailed`);
    expect(
      within(screen.getByRole('region', { name: `${keys}.localEvidence` })).getByText(
        'A local reading judgment',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: `${keys}.receipt` })).getByText(
        'readingMemory.sentEvidence 1',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${keys}.retryAnswer` }));
    await waitFor(() => expect(api.library.answer).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: `${keys}.retryAnswer` });
    expect(screen.queryByRole('region', { name: `${keys}.receipt` })).toBeNull();
    expect(screen.getByRole('region', { name: `${keys}.localEvidence` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${keys}.retryAnswer` }));
    await screen.findByText('A supported library answer');
    expect(api.library.answer).toHaveBeenCalledTimes(3);
    expect(api.library.search).toHaveBeenCalledOnce();
  });
});

function renderQuestion(collections: Collection[] = []) {
  const props = { collections, catalogRevision: 0, onOpenEvidenceSource: vi.fn() };
  return { props, ...render(<ReadingLibraryQuestion {...props} />) };
}

function submit(question: string) {
  fireEvent.change(screen.getByRole('textbox', { name: `${keys}.question` }), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole('button', { name: `${keys}.ask` }));
}

function context(scope: ReadingEvidenceScope = { kind: 'library' }): ReadingLibraryContext {
  return {
    scope,
    sourceCount: 4,
    judgmentCount: 2,
    provider: {
      id: 'provider',
      name: 'Test provider',
      type: 'openai-chat',
      modelName: 'test-model',
    },
    routeRevision: 'a'.repeat(64),
    remoteConsentRequired: true,
    projection: { state: 'available', coverage: { projectedAssetCount: 2, eligibleAssetCount: 3 } },
    semantic: {
      state: 'not_installed',
      modelVersion: 'embedding-v1',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 3 },
      indexingPaused: false,
    },
  };
}

function session(requestId: string, scope?: ReadingEvidenceScope): ReadingLibrarySession {
  return {
    ...context(scope),
    requestId,
    mode: 'keyword',
    evidence: [
      {
        id: 'evidence-1',
        assetType: 'annotation',
        role: 'judgment',
        authorKind: 'user',
        content: 'A local reading judgment',
        sourceVersion: 'source-1',
        source: {
          ref: { kind: 'article', id: 'source' },
          sourceType: 'web',
          title: 'Evidence source',
        },
        location: {
          annotationId: 'annotation',
          anchor: { exact: 'Source quote', prefix: '', suffix: '', start: 0, end: 12 },
        },
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
      },
    ],
  };
}

function answered(local: ReadingLibrarySession): ReadingLibraryAnswerResult {
  return {
    ...local,
    remoteConsentRequired: false,
    sentProvider: local.provider!,
    judgment: {
      state: 'generated',
      output: {
        kind: 'library-answer',
        judgments: [{ text: 'A supported library answer', evidenceIds: ['evidence-1'] }],
        supporting: [],
        opposingOrLimiting: [],
        gaps: [],
      },
      evidence: local.evidence,
      inputTruncated: false,
      sentEvidenceCount: local.evidence.length,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
