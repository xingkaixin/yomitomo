import { describe, expect, it } from 'vitest';

import { readRendererStyles } from './css-test-utils';

const styles = readRendererStyles();

describe('app lock shimmer styles', () => {
  it('drives shimmer through CSS and disables it for reduced motion', () => {
    expect(styles).toContain('.shimmering-text::before {');
    expect(styles).toContain(
      'animation: app-lock-shimmer var(--shimmer-dur) var(--shimmer-ease) infinite;',
    );
    expect(styles).toContain(".shimmering-text[data-shimmer='paused']::before {");
    expect(styles).toContain('@keyframes app-lock-shimmer');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.shimmering-text::before \{[\s\S]*animation: none !important;[\s\S]*opacity: 0;[\s\S]*\}/,
    );
    expect(styles).not.toContain('.shimmering-text-char');
  });
});
