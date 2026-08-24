// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionMenu } from './reader-selection-menu';
import { ReaderFloatingToolbar, ReaderToolbar } from './reader-toolbar';
import { defaultReaderUiLabels } from './reader-app-view-types';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function renderSearchToolbar({
  initialQuery = '目标',
  matches = [{ id: 'm1', start: 0, end: 4, preview: '目标' }],
}: {
  initialQuery?: string;
  matches?: { id: string; start: number; end: number; preview: string }[];
} = {}) {
  const onClose = vi.fn();
  const onQueryChange = vi.fn();

  function SearchToolbarHarness() {
    const [query, setQuery] = React.useState(initialQuery);

    function handleQueryChange(nextQuery: string) {
      onQueryChange(nextQuery);
      setQuery(nextQuery);
    }

    return (
      <ReaderFloatingToolbar
        annotationNavigation={{ previousId: 'a1', nextId: 'a2', totalCount: 2, currentIndex: 1 }}
        controls={<button type="button">Aa</button>}
        hasToc
        search={{
          activeMatchIndex: 0,
          limited: true,
          matches,
          open: true,
          query,
          onClose,
          onNextMatch: vi.fn(),
          onOpen: vi.fn(),
          onPreviousMatch: vi.fn(),
          onQueryChange: handleQueryChange,
        }}
        showAnnotationNavigation
        tocOpen={false}
        onNavigateAnnotation={vi.fn()}
        onToggleToc={vi.fn()}
      />
    );
  }

  const result = render(<SearchToolbarHarness />);
  return { ...result, onClose, onQueryChange };
}

describe('ReaderToolbar', () => {
  it('renders a library back button and clamps reading progress', () => {
    const onClose = vi.fn();

    const { container } = render(
      <ReaderToolbar
        extracted={{ title: 'Agentic Coding 的边界', byline: 'tison', content: '' }}
        labels={{
          ...defaultReaderUiLabels,
          backToLibrary: '返回阅读库',
          readingProgress: '阅读进度',
          readerLibrary: '阅读库',
        }}
        readingProgress={1.42}
        toolbarArticleAction={<button type="button">打开</button>}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '返回阅读库' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Agentic Coding 的边界')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: '阅读进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect(container.querySelector('.reader-toolbar-progress span')?.getAttribute('style')).toBe(
      'transform: scaleX(1);',
    );
  });

  it('keeps cover visuals separate from right-side actions', () => {
    const { container } = render(
      <ReaderToolbar
        articleLeadingVisual={<span data-testid="cover">封面</span>}
        extracted={{ title: '电子书', content: '' }}
        headerMeta={{ title: '电子书', byline: '作者', hasCover: true }}
        toolbarArticleAction={<button type="button">右侧操作</button>}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('cover')).toBeTruthy();
    expect(container.querySelector('.reader-toolbar-article-visual')?.textContent).toBe('封面');
    expect(container.querySelector('.reader-toolbar-actions')?.textContent).toBe('右侧操作');
  });
});

function renderFloatingToolbarWithToc(tocOpen: boolean, hasToc = true) {
  return render(
    <ReaderFloatingToolbar
      annotationNavigation={{ previousId: null, nextId: null, totalCount: 0, currentIndex: 0 }}
      hasToc={hasToc}
      showAnnotationNavigation={false}
      tocOpen={tocOpen}
      onNavigateAnnotation={vi.fn()}
      onToggleToc={vi.fn()}
    />,
  );
}

describe('ReaderFloatingToolbar toc toggle', () => {
  it('reflects the toc open state on the animated toggle icon', () => {
    const { container, rerender } = renderFloatingToolbarWithToc(false);

    const toggle = screen.getByRole('button', { name: '切换目录' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.classList.contains('is-active')).toBe(false);
    expect(container.querySelector('.reader-toc-toggle-icon')?.getAttribute('data-state')).toBe(
      'closed',
    );

    rerender(
      <ReaderFloatingToolbar
        annotationNavigation={{ previousId: null, nextId: null, totalCount: 0, currentIndex: 0 }}
        hasToc
        showAnnotationNavigation={false}
        tocOpen
        onNavigateAnnotation={vi.fn()}
        onToggleToc={vi.fn()}
      />,
    );

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.classList.contains('is-active')).toBe(true);
    expect(container.querySelector('.reader-toc-toggle-icon')?.getAttribute('data-state')).toBe(
      'open',
    );
  });

  it('keeps the toggle disabled and visually closed without toc items', () => {
    const { container } = renderFloatingToolbarWithToc(true, false);

    const toggle = screen.getByRole('button', { name: '切换目录' });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.reader-toc-toggle-icon')?.getAttribute('data-state')).toBe(
      'closed',
    );
  });
});

describe('ReaderFloatingToolbar search mode', () => {
  it('replaces the normal toolbar controls while searching', () => {
    const onClose = vi.fn();

    render(
      <ReaderFloatingToolbar
        annotationNavigation={{ previousId: 'a1', nextId: 'a2', totalCount: 2, currentIndex: 1 }}
        controls={<button type="button">Aa</button>}
        hasToc
        search={{
          activeMatchIndex: 0,
          limited: true,
          matches: [{ id: 'm1', start: 0, end: 4, preview: '目标' }],
          open: true,
          query: '目标',
          onClose,
          onNextMatch: vi.fn(),
          onOpen: vi.fn(),
          onPreviousMatch: vi.fn(),
          onQueryChange: vi.fn(),
        }}
        showAnnotationNavigation
        tocOpen={false}
        onNavigateAnnotation={vi.fn()}
        onToggleToc={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('搜索正文')).toBeTruthy();
    expect(screen.getByText('1/1+')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '切换目录' })).toBeNull();
    expect(screen.queryByRole('button', { name: '上一个划线' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aa' })).toBeNull();

    fireEvent.keyDown(screen.getByLabelText('正文搜索'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows a preparing search state before delayed indexes are ready', () => {
    render(
      <ReaderFloatingToolbar
        annotationNavigation={{ previousId: null, nextId: null, totalCount: 0, currentIndex: 0 }}
        hasToc={false}
        search={{
          activeMatchIndex: 0,
          limited: false,
          matches: [],
          open: true,
          preparing: true,
          query: '目标',
          onClose: vi.fn(),
          onNextMatch: vi.fn(),
          onOpen: vi.fn(),
          onPreviousMatch: vi.fn(),
          onQueryChange: vi.fn(),
        }}
        showAnnotationNavigation={false}
        tocOpen={false}
        onNavigateAnnotation={vi.fn()}
        onToggleToc={vi.fn()}
      />,
    );

    expect(screen.getByText(defaultReaderUiLabels.searchPreparing)).toBeTruthy();
    expect(screen.queryByText('0/0')).toBeNull();
  });

  it('clears the search query without closing the toolbar when motion is reduced', () => {
    stubReducedMotion(true);
    const { onClose, onQueryChange } = renderSearchToolbar({ matches: [] });
    const input = screen.getByLabelText('搜索正文') as HTMLInputElement;

    expect(input).toBe(document.activeElement);

    const clearButton = screen.getByRole('button', { name: '清空搜索' });
    fireEvent.mouseDown(clearButton);
    fireEvent.click(clearButton);

    expect(onQueryChange).toHaveBeenCalledWith('');
    expect(onClose).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(input).toBe(document.activeElement);
    expect(screen.queryByText('0/0')).toBeNull();
  });

  it('keeps the cleared text in the dissolve mirror while clearing', () => {
    stubReducedMotion(false);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { container, onQueryChange } = renderSearchToolbar({ initialQuery: 'alpha beta' });

    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

    const clearShell = container.querySelector('.reader-search-input-shell');
    if (!clearShell) throw new Error('Expected the search clear shell to render');
    const glow = clearShell.querySelector<HTMLElement>('.t-clear-glow');
    if (!glow) throw new Error('Expected the search clear glow to render');

    expect(onQueryChange).toHaveBeenCalledWith('');
    expect(clearShell.classList.contains('is-clearing')).toBe(true);
    expect(clearShell.querySelector('.t-clear-mirror')?.textContent).toBe('alpha\u00a0beta');
    expect(glow.style.background).toContain('radial-gradient');
  });

  it('keeps production-minified clear durations in milliseconds', async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    let frameTime = 0;
    const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => frameTime);
    const frameTimes = [16, 1000, 1016];
    const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) =>
      window.setTimeout(() => {
        frameTime = frameTimes.shift() ?? frameTime + 16;
        callback(frameTime);
      }, 0),
    );
    const cancelAnimationFrameMock = vi.fn((handle: number) => window.clearTimeout(handle));
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
    window.requestAnimationFrame = requestAnimationFrameMock;
    window.cancelAnimationFrame = cancelAnimationFrameMock;
    const { container } = renderSearchToolbar({ initialQuery: 'alpha beta' });
    const clearShell = container.querySelector<HTMLElement>('.reader-search-input-shell');
    if (!clearShell) throw new Error('Expected the search clear shell to render');
    clearShell.style.setProperty('--clear-dur', '1s');
    clearShell.style.setProperty('--clear-out-dur', '.4s');
    clearShell.style.setProperty('--clear-in-dur', '.4s');
    clearShell.style.setProperty('--glow-delay', '50ms');

    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(clearShell.classList.contains('is-clearing')).toBe(true);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
      await vi.runOnlyPendingTimersAsync();
    });

    expect(clearShell.classList.contains('is-clearing')).toBe(false);
    performanceNow.mockRestore();
  });
});

describe('SelectionMenu', () => {
  it('renders configured action shortcut keys', () => {
    render(
      <SelectionMenu
        action={{ x: 10, y: 20 }}
        shortcuts={{ copy: 'X', annotate: 'B', ask: 'Y' }}
        onAnnotate={vi.fn()}
        onAsk={vi.fn()}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByText('X')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('Y')).toBeTruthy();
  });

  it('shows copy success before closing the menu', async () => {
    vi.useFakeTimers();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const onCopySettled = vi.fn();

    render(
      <SelectionMenu
        action={{ x: 10, y: 20 }}
        onAnnotate={vi.fn()}
        onCopy={onCopy}
        onCopySettled={onCopySettled}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /复制/ }));
      await Promise.resolve();
    });

    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /复制/ }).className).toContain('is-copied');
    expect(screen.queryByText('已复制')).toBeNull();
    expect(screen.getByText('C').className).not.toContain('is-hidden');
    expect(onCopySettled).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(520);
    });

    expect(onCopySettled).toHaveBeenCalledOnce();
  });

  it('shows copy success when copy is requested by shortcut state', async () => {
    vi.useFakeTimers();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const onCopySettled = vi.fn();
    const { rerender } = render(
      <SelectionMenu
        action={{ x: 10, y: 20 }}
        copyRequestKey={0}
        onAnnotate={vi.fn()}
        onCopy={onCopy}
        onCopySettled={onCopySettled}
      />,
    );

    await act(async () => {
      rerender(
        <SelectionMenu
          action={{ x: 10, y: 20 }}
          copyRequestKey={1}
          onAnnotate={vi.fn()}
          onCopy={onCopy}
          onCopySettled={onCopySettled}
        />,
      );
      await Promise.resolve();
    });

    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /复制/ }).className).toContain('is-copied');
    expect(screen.queryByText('已复制')).toBeNull();
    expect(screen.getByText('C').className).not.toContain('is-hidden');
    expect(onCopySettled).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(520);
    });

    expect(onCopySettled).toHaveBeenCalledOnce();
  });
});
