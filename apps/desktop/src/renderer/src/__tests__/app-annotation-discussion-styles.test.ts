import { readRendererStyles } from './css-test-utils';
import { describe, expect, it } from 'vitest';

const styles = readRendererStyles();

describe('annotation discussion styles', () => {
  it('keeps editable mention chips layout-isomorphic with textarea text', () => {
    const body = styles.match(/\.floating-composer-mention-chip \{(?<body>[^}]+)\}/)?.groups?.body;

    expect(body).toContain('display: inline;');
    expect(body).toContain('font: inherit;');
    expect(body).toContain('font-size: inherit;');
    expect(body).toContain('font-weight: inherit;');
    expect(body).toContain('line-height: inherit;');
    expect(body).toContain('margin: 0;');
    expect(body).toContain('padding: 0;');
    expect(body).toContain('transform: none;');
    expect(body).toContain('white-space: inherit;');
    expect(body).not.toContain('display: inline-flex;');
    expect(body).not.toContain('padding: 2px 7px;');
  });
});
