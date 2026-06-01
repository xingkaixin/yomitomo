import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('annotation discussion styles', () => {
  it('keeps the add thought modal editor integrated with the modal shell', () => {
    expect(styles).toMatch(
      /\.floating-composer\.annotation-discussion-add-editor \{[\s\S]*border: 0;[\s\S]*border-radius: 0 0 16px 16px;[\s\S]*box-shadow: none;[\s\S]*\}/,
    );
  });
});
