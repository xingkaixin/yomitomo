import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ReaderDemo from '../components/landing/ReaderDemo';

type TestingLibrary = typeof import('@testing-library/react');

let dom: JSDOM;
let testingLibrary: TestingLibrary;

beforeAll(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://yomitomo.app/',
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
  window.requestAnimationFrame = requestAnimationFrame;
  window.cancelAnimationFrame = cancelAnimationFrame;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  document.documentElement.style.setProperty('--modal-close-dur', '0ms');
  testingLibrary = await import('@testing-library/react');
});

afterEach(() => testingLibrary.cleanup());

afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});

describe('reader demo discussion modal', () => {
  it('opens with focus and restores focus after the closing state', async () => {
    const { fireEvent, render, screen, waitFor } = testingLibrary;
    render(<ReaderDemo lang="zh-CN" />);
    const trigger = screen.getAllByRole('button', { name: /进入讨论区/ })[0];

    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    const closeButton = screen.getByRole('button', { name: '关闭' });
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    expect(dialog.closest('.dm-overlay')?.getAttribute('data-state')).toBe('open');

    fireEvent.click(closeButton);

    const overlay = dialog.closest('.dm-overlay');
    expect(overlay?.getAttribute('data-state')).toBe('closing');
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    expect(overlay?.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull());
  });
});
