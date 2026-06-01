import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('annotation discussion styles', () => {
  it('keeps the add thought modal editor integrated with the modal shell', () => {
    expect(styles).toMatch(
      /\.floating-composer\.annotation-discussion-add-editor \{[\s\S]*border: 0;[\s\S]*border-radius: 0 0 16px 16px;[\s\S]*box-shadow: none;[\s\S]*\}/,
    );
  });

  it('keeps discussion assistant avatar stacks connected to proximity hover variables', () => {
    expect(styles).toMatch(
      /\.annotation-discussion-add-agents \.reader-agent-avatar-stack-item \{[\s\S]*transform: translateY\(var\(--avatar-shift, 0px\)\) scale\(var\(--avatar-scale-active, 1\)\);[\s\S]*transition:[\s\S]*transform var\(--avatar-dur, 320ms\) var\(--avatar-ease-in, cubic-bezier\(0\.22, 1, 0\.36, 1\)\)[\s\S]*will-change: transform;[\s\S]*\}/,
    );
    expect(styles).toMatch(
      /\.annotation-discussion-agent-dock \.reader-agent-avatar-stack-item \{[\s\S]*transform: translateY\(var\(--avatar-shift, 0px\)\) scale\(var\(--avatar-scale-active, 1\)\);[\s\S]*transition:[\s\S]*transform var\(--avatar-dur, 320ms\) var\(--avatar-ease-in, cubic-bezier\(0\.22, 1, 0\.36, 1\)\)[\s\S]*will-change: transform;[\s\S]*\}/,
    );
  });
});
