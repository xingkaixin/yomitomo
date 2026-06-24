import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ShimmeringText source', () => {
  it('does not use Framer Motion loops for shimmer text', () => {
    const source = readFileSync(
      new URL('../components/ui/shimmering-text.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('framer-motion');
    expect(source).not.toContain('motion.span');
    expect(source).not.toContain('repeat: Infinity');
  });
});
