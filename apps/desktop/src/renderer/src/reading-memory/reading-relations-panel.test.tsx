// @vitest-environment jsdom

import React, { useRef, useState, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReadingEvidence, ReadingJudgmentResult } from '@yomitomo/shared';
import type { ReadingRelationsJudgeResult, ReadingRelationsSession } from '../../../ipc-contract';
import type { YomitomoDesktopApi } from '../../../preload';
import { ReadingRelationsPanel } from './reading-relations-panel';
import { useReadingRelations, type ReadingRelationsState } from './use-reading-relations';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
  }),
}));

type PanelProps = ComponentProps<typeof ReadingRelationsPanel>;
type ReadyState = Extract<ReadingRelationsState, { phase: 'ready' }>;

const request: ReadingRelationsState['request'] = {
  requestId: 'request-1',
  articleId: 'current-article',
  context: { sourceType: 'web', quote: '当前阅读选段', nearbyText: '当前段落' },
};

function evidence(overrides: Partial<ReadingEvidence> = {}): ReadingEvidence {
  return {
    id: 'evidence-1',
    assetType: 'comment',
    role: 'judgment',
    authorKind: 'user',
    content: '间隔复习有助于长期记忆。',
    sourceVersion: 'version-1',
    source: {
      ref: { kind: 'article', id: 'source-article' },
      sourceType: 'web',
      title: '学习的条件',
      byline: '第三章',
    },
    location: {
      annotationId: 'annotation-1',
      commentId: 'comment-1',
      anchor: { exact: '原文摘录', prefix: '', suffix: '', start: 0, end: 4 },
    },
    createdAt: '2026-08-30T00:00:00Z',
    updatedAt: '2026-08-30T00:00:00Z',
    ...overrides,
  };
}

function session(entries = [evidence()]): ReadingRelationsSession {
  return {
    requestId: request.requestId,
    evidence: entries,
    mode: 'keyword',
    projection: {
      state: 'available',
      coverage: { projectedAssetCount: 4, eligibleAssetCount: 6 },
    },
    semantic: {
      state: 'not_installed',
      modelVersion: 'reading-memory-v1',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 8 },
      indexingPaused: false,
    },
    provider: {
      id: 'provider-1',
      name: 'Test Provider',
      type: 'openai-chat',
      modelName: 'model-a',
    },
    remoteConsentRequired: true,
  };
}

function ready(
  result: ReadyState['result'] = session(),
  remote: ReadyState['remote'] = 'idle',
): ReadyState {
  return { phase: 'ready', request, result, remote };
}

function localResult(
  reason: Extract<ReadingJudgmentResult, { state: 'local' }>['reason'],
): ReadingRelationsJudgeResult {
  const result = session();
  return {
    ...result,
    judgment: {
      state: 'local',
      reason,
      evidence: result.evidence,
      inputTruncated: false,
      sentEvidenceCount: 0,
    },
  };
}

function renderPanel(state: ReadingRelationsState = ready()) {
  const props = {
    state,
    returnFocus: { current: null },
    onClose: vi.fn<PanelProps['onClose']>(),
    onSearch: vi.fn<PanelProps['onSearch']>(),
    onJudge: vi.fn<PanelProps['onJudge']>(),
    onDismissPrivacy: vi.fn<PanelProps['onDismissPrivacy']>(),
    onOpenEvidenceSource: vi.fn<NonNullable<PanelProps['onOpenEvidenceSource']>>(),
  } satisfies PanelProps;
  return { props, ...render(<ReadingRelationsPanel {...props} />) };
}

function activeFocusDescription() {
  const active = document.activeElement;
  return JSON.stringify({
    tag: active?.tagName,
    role: active?.getAttribute('role'),
    ariaLabel: active?.getAttribute('aria-label'),
    text: active?.textContent?.trim().slice(0, 160),
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReadingRelationsPanel', () => {
  it('shows local evidence attribution and coverage without automatically judging on mount or search', () => {
    const entries = [
      evidence({ id: 'judgment', assetType: 'comment', content: '我的判断' }),
      evidence({ id: 'comment', authorKind: 'ai', content: '助手评论' }),
      evidence({
        id: 'distillation',
        assetType: 'distillation',
        authorKind: undefined,
        content: '沉淀',
      }),
      evidence({
        id: 'source',
        assetType: 'annotation',
        role: 'source',
        authorKind: 'user',
        content: '原文摘录',
      }),
    ];
    const { props } = renderPanel(ready(session(entries)));
    const cards = screen.getAllByRole('article');

    expect(cards).toHaveLength(4);
    for (const [index, author] of ['user', 'ai', 'aiAssisted', 'source'].entries()) {
      const card = within(cards[index]);
      expect(card.getByText(`readingEvidence.authors.${author}`)).toBeTruthy();
      expect(card.getByText(`readingEvidence.assetTypes.${entries[index].assetType}`)).toBeTruthy();
      expect(card.getByText(entries[index].content)).toBeTruthy();
      expect(card.getByText('学习的条件')).toBeTruthy();
      expect(card.getByText('第三章')).toBeTruthy();
    }
    expect(within(cards[0]).getByLabelText('readingEvidence.excerpt')).toBeTruthy();
    expect(within(cards[3]).queryByLabelText('readingEvidence.excerpt')).toBeNull();
    expect(screen.getByText(request.context.quote)).toBeTruthy();
    expect(screen.getByText('readingMemory.projectionCoverage 4 6', { exact: false })).toBeTruthy();
    expect(screen.getByText('readingMemory.semanticCoverage 0 8', { exact: false })).toBeTruthy();
    expect(props.onSearch).not.toHaveBeenCalled();
    expect(props.onJudge).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'readingMemory.relations.question' }), {
      target: { value: '什么条件下适用？' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.relations.search' }));

    expect(props.onSearch).toHaveBeenCalledExactlyOnceWith('什么条件下适用？');
    expect(props.onJudge).not.toHaveBeenCalled();
  });

  it.each([
    ['source', 'readingEvidence.openSource'],
    ['discussion', 'readingEvidence.openDiscussion'],
  ] as const)('opens the evidence %s and closes the panel', (view, label) => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(props.onOpenEvidenceSource).toHaveBeenCalledExactlyOnceWith({
      articleId: 'source-article',
      annotationId: 'annotation-1',
      view,
      readingMemoryJump: true,
    });
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onOpenEvidenceSource.mock.invocationCallOrder[0]).toBeLessThan(
      props.onClose.mock.invocationCallOrder[0],
    );
  });

  it('discloses the remote recipient and requires an explicit privacy decision', () => {
    const { props, rerender } = renderPanel(ready(session(), 'privacy'));
    const privacy = within(screen.getByRole('region', { name: 'readingMemory.privacy.title' }));

    for (const key of ['content', 'excluded', 'control']) {
      expect(privacy.getByText(`readingMemory.privacy.${key}`)).toBeTruthy();
    }
    expect(privacy.getByText('readingMemory.privacy.recipient Test Provider model-a')).toBeTruthy();
    expect(screen.getByRole('article')).toBeTruthy();
    expect(props.onJudge).not.toHaveBeenCalled();

    fireEvent.click(privacy.getByRole('button', { name: 'readingMemory.privacy.stayLocal' }));
    expect(props.onDismissPrivacy).toHaveBeenCalledOnce();
    expect(props.onJudge).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();

    rerender(<ReadingRelationsPanel {...props} state={ready()} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'readingMemory.relations.judgeWith Test Provider model-a',
      }),
    );
    expect(props.onJudge).toHaveBeenNthCalledWith(1);

    rerender(<ReadingRelationsPanel {...props} state={ready(session(), 'privacy')} />);
    fireEvent.click(screen.getByRole('button', { name: 'readingMemory.privacy.confirm' }));
    expect(props.onJudge).toHaveBeenNthCalledWith(2, true);
    expect(props.onJudge).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: 'remote failure',
      state: ready(session(), 'failed'),
      notice: 'readingMemory.generationFailed',
    },
    {
      label: 'rejected output',
      state: ready(localResult('failed')),
      notice: 'readingMemory.generationFailed',
    },
    {
      label: 'oversized input',
      state: ready(localResult('input_too_large')),
      notice: 'readingMemory.inputTooLarge',
    },
    {
      label: 'changed provider',
      state: ready({
        ...localResult('failed'),
        providerChanged: true,
        provider: {
          id: 'provider-2',
          name: 'New Provider',
          type: 'openai-chat',
          modelName: 'model-b',
        },
      }),
      notice: 'readingMemory.providerChanged',
    },
  ])('retains local cards and offers explicit retry after $label', ({ state, notice }) => {
    const { props, rerender } = renderPanel();
    const card = screen.getByRole('article');
    rerender(<ReadingRelationsPanel {...props} state={state} />);

    expect(screen.getByRole('article')).toBe(card);
    expect(within(card).getByText(evidence().content)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(notice);
    expect(props.onJudge).not.toHaveBeenCalled();
    const recipient = state.result.provider!;
    fireEvent.click(
      screen.getByRole('button', {
        name: `readingMemory.relations.judgeWith ${recipient.name} ${recipient.modelName}`,
      }),
    );
    expect(props.onJudge).toHaveBeenCalledExactlyOnceWith();
  });

  it('reports the actual sender after provider changes without labeling it as the retry target', () => {
    const local = localResult('failed');
    const sentProvider = local.provider!;
    const result: ReadingRelationsJudgeResult = {
      ...local,
      provider: { ...sentProvider, id: 'next', name: 'Next Provider', modelName: 'model-next' },
      sentProvider,
      providerChanged: true,
      judgment: { ...local.judgment, sentEvidenceCount: 3, inputTruncated: true },
    };
    const { props, rerender } = renderPanel(ready(result));
    const receipt = screen.getByRole('status');
    expect(receipt.textContent).toContain('Test Provider model-a');
    expect(receipt.textContent).toContain('readingMemory.sentEvidence 3');
    expect(screen.getByRole('alert').textContent).toBe('readingMemory.providerChanged');
    expect(
      screen.getByRole('button', {
        name: 'readingMemory.relations.judgeWith Next Provider model-next',
      }),
    ).toBeTruthy();

    rerender(<ReadingRelationsPanel {...props} state={ready(result, 'judging')} />);
    expect(screen.queryByText('readingMemory.sentEvidence 3', { exact: false })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByText('readingMemory.privacy.recipient Next Provider model-next'),
    ).toBeTruthy();
  });

  it('keeps local cards without a previous receipt or provider warning when a retry is rejected', async () => {
    const local = { ...session(), remoteConsentRequired: false };
    const changed: ReadingRelationsJudgeResult = {
      ...local,
      provider: { ...local.provider!, id: 'next', name: 'Next Provider', modelName: 'model-next' },
      sentProvider: local.provider!,
      providerChanged: true,
      judgment: {
        state: 'local',
        reason: 'failed',
        evidence: local.evidence,
        inputTruncated: false,
        sentEvidenceCount: 3,
      },
    };
    type ReadingMemoryApi = YomitomoDesktopApi['readingMemory'];
    const api = {
      confirmPrivacy: vi.fn<ReadingMemoryApi['confirmPrivacy']>().mockResolvedValue(undefined),
      relations: {
        search: vi.fn<ReadingMemoryApi['relations']['search']>().mockResolvedValue(local),
        judge: vi
          .fn<ReadingMemoryApi['relations']['judge']>()
          .mockResolvedValueOnce(changed)
          .mockRejectedValueOnce(new Error('READING_MEMORY_SESSION_EXPIRED')),
        cancel: vi.fn<ReadingMemoryApi['relations']['cancel']>().mockResolvedValue(undefined),
      },
    } satisfies Pick<ReadingMemoryApi, 'confirmPrivacy' | 'relations'>;
    vi.stubGlobal('yomitomoDesktop', { readingMemory: api });

    function Harness() {
      const relations = useReadingRelations(request.articleId);
      return (
        <>
          <button onClick={() => void relations.search(request.context)}>Open relations</button>
          {relations.state ? (
            <ReadingRelationsPanel
              state={relations.state}
              returnFocus={{ current: null }}
              onClose={relations.close}
              onSearch={(question) => void relations.search(request.context, question)}
              onJudge={(confirm) => void relations.judge(confirm)}
              onDismissPrivacy={relations.dismissPrivacy}
            />
          ) : null}
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open relations' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'readingMemory.relations.judgeWith Test Provider model-a',
      }),
    );
    const retry = await screen.findByRole('button', {
      name: 'readingMemory.relations.judgeWith Next Provider model-next',
    });
    const card = screen.getByRole('article');
    expect(screen.getByRole('status').textContent).toContain('readingMemory.sentEvidence 3');
    expect(screen.getByRole('alert').textContent).toBe('readingMemory.providerChanged');

    fireEvent.click(retry);
    await waitFor(() => expect(api.relations.judge).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', {
      name: 'readingMemory.relations.judgeWith Next Provider model-next',
    });

    expect(screen.getByRole('article')).toBe(card);
    expect
      .soft(screen.getByRole('status').textContent)
      .not.toContain('readingMemory.sentEvidence 3');
    expect.soft(screen.getByRole('status').textContent).not.toContain('Test Provider model-a');
    expect.soft(screen.getByRole('alert').textContent).toBe('readingMemory.generationFailed');
    expect(api.confirmPrivacy).not.toHaveBeenCalled();
  });

  it('binds generated relations to evidence ids and keeps evidence when the model abstains', () => {
    const result = session([evidence(), evidence({ id: 'evidence-2', content: '另一条判断' })]);
    const judgment: ReadingJudgmentResult = {
      state: 'generated',
      evidence: result.evidence,
      output: {
        kind: 'reading-relations',
        relations: [
          { evidenceId: 'evidence-2', relation: 'complementary', explanation: '补充了适用条件。' },
        ],
      },
      inputTruncated: true,
      sentEvidenceCount: 2,
    };
    const { props, rerender } = renderPanel(ready({ ...result, judgment }));
    const cards = screen.getAllByRole('article');

    expect(within(cards[0]).queryByText('readingEvidence.relations.complementary')).toBeNull();
    expect(within(cards[1]).getByText('readingEvidence.relations.complementary')).toBeTruthy();
    expect(within(cards[1]).getByText('补充了适用条件。')).toBeTruthy();
    expect(screen.getByText('readingMemory.inputTruncated')).toBeTruthy();
    expect(screen.getByText('readingMemory.sentEvidence 2', { exact: false })).toBeTruthy();

    rerender(
      <ReadingRelationsPanel
        {...props}
        state={ready({
          ...result,
          judgment: { ...judgment, output: { kind: 'reading-relations', relations: [] } },
        })}
      />,
    );

    expect(screen.getAllByRole('article')).toEqual(cards);
    expect(screen.getByText('readingMemory.relations.abstained')).toBeTruthy();
    expect(screen.queryByText('readingEvidence.relations.complementary')).toBeNull();
    expect(props.onJudge).not.toHaveBeenCalled();
  });

  it('blocks duplicate search and judgment while busy but keeps cancellation available', () => {
    const { props } = renderPanel(ready(session(), 'judging'));
    const input = screen.getByRole('textbox');

    expect(input.hasAttribute('disabled')).toBe(true);
    expect(
      screen
        .getByRole('button', { name: 'readingMemory.relations.search' })
        .hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.submit(input.closest('form')!);
    expect(props.onSearch).not.toHaveBeenCalled();
    expect(props.onJudge).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /readingMemory.relations.judgeWith/ })).toBeNull();
    expect(screen.getAllByRole('status').map((element) => element.textContent)).toContain(
      'readingMemory.relations.judging',
    );
    expect(screen.getByRole('article')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('focuses its title and returns focus to the opener when Escape closes the real dialog', async () => {
    function Harness() {
      const returnFocus = useRef<HTMLButtonElement>(null);
      const [open, setOpen] = useState(false);
      return (
        <>
          <button ref={returnFocus} onClick={() => setOpen(true)}>
            Open relations
          </button>
          {open ? (
            <ReadingRelationsPanel
              state={ready()}
              returnFocus={returnFocus}
              onClose={() => setOpen(false)}
              onSearch={() => undefined}
              onJudge={() => undefined}
              onDismissPrivacy={() => undefined}
            />
          ) : null}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open relations' });
    fireEvent.click(opener);

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'readingMemory.relations.title' }),
      ),
    );
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'readingMemory.relations.title' }), {
      key: 'Escape',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('moves focus into privacy disclosure and back to judgment after staying local', async () => {
    const { props, rerender } = renderPanel();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'readingMemory.relations.title' }),
      ),
    );
    const judge = screen.getByRole('button', {
      name: 'readingMemory.relations.judgeWith Test Provider model-a',
    });
    await act(async () => {
      judge.focus();
      fireEvent.click(judge);
      rerender(<ReadingRelationsPanel {...props} state={ready(session(), 'privacy')} />);
    });

    const privacy = screen.getByRole('region', { name: 'readingMemory.privacy.title' });
    expect
      .soft(privacy.contains(document.activeElement), `Privacy opened: ${activeFocusDescription()}`)
      .toBe(true);
    const stayLocal = within(privacy).getByRole('button', {
      name: 'readingMemory.privacy.stayLocal',
    });
    await act(async () => {
      stayLocal.focus();
      fireEvent.click(stayLocal);
      rerender(<ReadingRelationsPanel {...props} state={ready()} />);
    });

    expect(props.onDismissPrivacy).toHaveBeenCalledOnce();
    expect
      .soft(
        document.activeElement ===
          screen.getByRole('button', {
            name: 'readingMemory.relations.judgeWith Test Provider model-a',
          }),
        `Privacy dismissed: ${activeFocusDescription()}`,
      )
      .toBe(true);
  });

  it('keeps focus through judgment and failure when privacy was already confirmed', async () => {
    const local = { ...session(), remoteConsentRequired: false };
    const { props, rerender } = renderPanel(ready(local));
    const title = screen.getByRole('heading', { name: 'readingMemory.relations.title' });
    await waitFor(() => expect(document.activeElement).toBe(title));
    const judge = screen.getByRole('button', {
      name: 'readingMemory.relations.judgeWith Test Provider model-a',
    });
    await act(async () => {
      judge.focus();
      fireEvent.click(judge);
      rerender(<ReadingRelationsPanel {...props} state={ready(local, 'judging')} />);
    });

    expect
      .soft(document.activeElement, `Judgment pending: ${activeFocusDescription()}`)
      .toBe(title);
    await act(async () => {
      rerender(<ReadingRelationsPanel {...props} state={ready(local, 'failed')} />);
    });

    expect.soft(document.activeElement, `Judgment failed: ${activeFocusDescription()}`).toBe(
      screen.getByRole('button', {
        name: 'readingMemory.relations.judgeWith Test Provider model-a',
      }),
    );
  });

  it('returns focus to the reader canvas div when Escape closes the real dialog', async () => {
    function Harness() {
      const returnFocus = useRef<HTMLDivElement>(null);
      const [open, setOpen] = useState(true);
      return (
        <>
          <div ref={returnFocus} tabIndex={-1} aria-label="reading-memory-test-canvas">
            readingMemory.test.canvas
          </div>
          {open ? (
            <ReadingRelationsPanel
              state={ready()}
              returnFocus={returnFocus}
              onClose={() => setOpen(false)}
              onSearch={() => undefined}
              onJudge={() => undefined}
              onDismissPrivacy={() => undefined}
            />
          ) : null}
        </>
      );
    }
    render(<Harness />);
    const canvas = screen.getByLabelText('reading-memory-test-canvas');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: 'readingMemory.relations.title' }),
      ),
    );
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog', { name: 'readingMemory.relations.title' }), {
        key: 'Escape',
      });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect
      .soft(document.activeElement === canvas, `Reader canvas return: ${activeFocusDescription()}`)
      .toBe(true);
  });
});
