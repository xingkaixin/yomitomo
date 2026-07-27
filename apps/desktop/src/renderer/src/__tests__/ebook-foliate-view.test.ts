// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readerBodyLineHeight } from '@yomitomo/reader-ui/reader-settings';
import {
  configureFoliateView,
  formatEbookPageLabel,
  isEbookPageNavigationReady,
  isEbookPaginationReady,
  waitForFoliatePageInfo,
  type FoliatePageInfoWaitTiming,
  type FoliateViewElement,
} from '../source/ebook/ebook-foliate-view';
import { defaultTheme, inkBlackTheme } from '../theme/app-theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

function pageInfoWaitTiming(): FoliatePageInfoWaitTiming {
  return {
    assetWaitMs: 0,
    fontWaitMs: 0,
    imageWaitMs: 0,
    pendingImageCount: 0,
    frameWaitMs: 0,
    frameWaitCount: 0,
    matched: false,
    matchedAfterAssets: false,
    synthesized: false,
    observedPageInfo: null,
    contentIndexes: [],
    elapsedMs: 0,
  };
}

describe('ebook foliate view', () => {
  it('returns matching Foliate page info without waiting for an animation frame', async () => {
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    window.requestAnimationFrame = requestAnimationFrame;
    const pageInfo = { sectionIndex: 2, pageIndex: 3, pageCount: 8 };
    const view = {
      getPageInfo: vi.fn(() => pageInfo),
    } as unknown as FoliateViewElement;
    const timing = pageInfoWaitTiming();

    await expect(waitForFoliatePageInfo(view, 2, timing)).resolves.toBe(pageInfo);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(timing).toMatchObject({
      frameWaitCount: 0,
      matched: true,
      matchedAfterAssets: true,
      synthesized: false,
      observedPageInfo: pageInfo,
    });
  });

  it('records Foliate page info animation frame waits', async () => {
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    window.requestAnimationFrame = requestAnimationFrame;
    const pageInfo = { sectionIndex: 2, pageIndex: 3, pageCount: 8 };
    const view = {
      getPageInfo: vi.fn().mockReturnValueOnce(null).mockReturnValue(pageInfo),
    } as unknown as FoliateViewElement;
    const timing = pageInfoWaitTiming();

    await expect(waitForFoliatePageInfo(view, 2, timing)).resolves.toBe(pageInfo);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(timing).toMatchObject({
      frameWaitCount: 1,
      matched: true,
      matchedAfterAssets: false,
      synthesized: false,
      observedPageInfo: pageInfo,
    });
  });

  it('synthesizes one page when Foliate loads a section without page info', async () => {
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    window.requestAnimationFrame = requestAnimationFrame;
    const view = {
      getPageInfo: vi.fn(() => null),
      renderer: {
        getContents: vi.fn(() => [{ index: 2 }]),
      },
    } as unknown as FoliateViewElement;
    const timing = pageInfoWaitTiming();

    await expect(waitForFoliatePageInfo(view, 2, timing)).resolves.toEqual({
      sectionIndex: 2,
      pageIndex: 0,
      pageCount: 1,
    });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(timing).toMatchObject({
      contentIndexes: [2],
      frameWaitCount: 0,
      matched: true,
      matchedAfterAssets: true,
      synthesized: true,
      observedPageInfo: { sectionIndex: 2, pageIndex: 0, pageCount: 1 },
    });
  });

  it('requires complete EPUB section page counts before showing the page label', () => {
    const pageInfo = { sectionIndex: 1, pageIndex: 2, pageCount: 5 };

    expect(isEbookPageNavigationReady(pageInfo)).toBe(true);
    expect(isEbookPaginationReady(pageInfo, [null, 5, null])).toBe(false);
    expect(formatEbookPageLabel(pageInfo, [])).toBe('');
    expect(formatEbookPageLabel(pageInfo, [null, 5, null])).toBe('');
    expect(formatEbookPageLabel(pageInfo, [10, 5, 20])).toBe('13 / 35');
  });
});

describe('configureFoliateView', () => {
  it('keeps foliate page turns immediate', () => {
    const renderer = document.createElement('div') as unknown as HTMLElement & {
      setStyles: (styles: string | string[]) => void;
    };
    renderer.setAttribute('animated', '');
    renderer.setStyles = vi.fn();

    configureFoliateView(
      { renderer } as Parameters<typeof configureFoliateView>[0],
      {
        fontSize: 18,
        contentWidth: 720,
        backgroundColor: '#f7eddc',
      },
      defaultTheme.reader,
    );

    expect(renderer.hasAttribute('animated')).toBe(false);
    expect(renderer.getAttribute('flow')).toBe('paginated');
  });

  it('applies reader font size through the ebook body', () => {
    const renderer = document.createElement('div') as unknown as HTMLElement & {
      setStyles: (styles: string | string[]) => void;
    };
    renderer.setStyles = vi.fn();

    configureFoliateView(
      { renderer } as Parameters<typeof configureFoliateView>[0],
      {
        fontSize: 22,
        contentWidth: 720,
        backgroundColor: '#eef4e8',
      },
      defaultTheme.reader,
    );

    const styles = vi.mocked(renderer.setStyles).mock.calls[0]?.[0];
    expect(styles).toContain('font-size: 22px;');
    expect(styles).toContain('background: #eef4e8;');
    expect(styles).toContain('body {\n      background: #eef4e8;');
    expect(styles).toContain('font-size: inherit;');
    expect(styles).toContain(`line-height: ${readerBodyLineHeight};`);
  });

  it('keeps ebook text readable on dark reader paper', () => {
    const renderer = document.createElement('div') as unknown as HTMLElement & {
      setStyles: (styles: string | string[]) => void;
    };
    renderer.setStyles = vi.fn();

    configureFoliateView(
      { renderer } as Parameters<typeof configureFoliateView>[0],
      {
        fontSize: 18,
        contentWidth: 720,
        backgroundColor: '#242019',
      },
      inkBlackTheme.reader,
    );

    const styles = vi.mocked(renderer.setStyles).mock.calls[0]?.[0];
    expect(styles).toContain(`color: ${inkBlackTheme.reader.ink};`);
    expect(styles).toContain(`color: ${inkBlackTheme.reader.muted};`);
    expect(styles).toContain(
      `text-decoration-color: color-mix(in srgb, ${inkBlackTheme.reader.ink} 36%, transparent);`,
    );
    expect(styles).toContain('color-scheme: dark;');
    expect(styles).toContain('body {\n      background: #242019;\n      color: inherit;');
  });
});
