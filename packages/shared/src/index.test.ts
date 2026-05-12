import { describe, expect, it } from 'vitest';
import {
  agentPersonalities,
  agentReadingIntentDisplayLabel,
  createTextAnchor,
  defaultSelectionActionShortcuts,
  normalizeSelectionActionShortcutDraft,
  normalizeSelectionActionShortcuts,
  renderMarkdown,
  resolveTextAnchor,
  selectionActionShortcutsConflict,
} from './index';

describe('shared text anchors', () => {
  it('resolves repeated exact text with prefix and suffix context', () => {
    const text = 'alpha target omega. beta target gamma.';
    const anchor = createTextAnchor(text, 25, 31);

    expect(resolveTextAnchor(text, { ...anchor, start: 0, end: 6 })).toEqual({
      start: 25,
      end: 31,
    });
  });
});

describe('shared markdown rendering', () => {
  it('escapes inline html while rendering simple markdown', () => {
    const html = renderMarkdown('Hello **world** <script>alert(1)</script>');

    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('keeps unsafe markdown links as escaped text', () => {
    const html = renderMarkdown('[click](javascript:alert(1)) [mail](mailto:test@example.com)');

    expect(html).toContain('click');
    expect(html).not.toContain('javascript:alert');
    expect(html).toContain('href="mailto:test@example.com"');
  });
});

describe('agent presets', () => {
  it('enables every preset assistant by default', () => {
    expect(agentPersonalities.every((personality) => personality.defaultEnabled)).toBe(true);
  });

  it('formats reading intent labels with icons', () => {
    expect(agentReadingIntentDisplayLabel('challenge')).toBe('⚔️ 挑战');
  });
});

describe('selection action shortcuts', () => {
  it('normalizes single letter shortcuts', () => {
    expect(normalizeSelectionActionShortcutDraft({ copy: 'x', annotate: ' z ' })).toEqual({
      copy: 'X',
      annotate: 'Z',
    });
    expect(normalizeSelectionActionShortcutDraft({ copy: '1', annotate: 'Enter' })).toEqual(
      defaultSelectionActionShortcuts,
    );
  });

  it('detects and resets conflicting shortcuts', () => {
    const shortcuts = normalizeSelectionActionShortcutDraft({ copy: 'b', annotate: 'B' });

    expect(selectionActionShortcutsConflict(shortcuts)).toBe(true);
    expect(normalizeSelectionActionShortcuts(shortcuts)).toEqual(defaultSelectionActionShortcuts);
  });
});
