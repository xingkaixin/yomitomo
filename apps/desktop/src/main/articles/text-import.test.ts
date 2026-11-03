import { describe, expect, it } from 'vitest';
import { decodeTextContent, plainTextToHtml, splitFrontMatter } from './text-import';

describe('decodeTextContent', () => {
  it('falls back to GB18030 when UTF-8 decoding is invalid', () => {
    const result = decodeTextContent(new Uint8Array([0xd6, 0xd0])); // GBK 中
    expect(result).toEqual({ ok: true, text: '中', encoding: 'gb18030' });
  });

  it('decodes UTF-16LE via BOM', () => {
    const result = decodeTextContent(new Uint8Array([0xff, 0xfe, 0x2d, 0x4e]));
    expect(result).toEqual({ ok: true, text: '中', encoding: 'utf-16le' });
  });

  it('rejects binary content containing NUL bytes', () => {
    const result = decodeTextContent(new Uint8Array([0x68, 0x00, 0x69]));
    expect(result).toEqual({ ok: false, reason: 'binary' });
  });
});

describe('splitFrontMatter', () => {
  it('extracts a YAML front matter block', () => {
    const { frontMatter, body } = splitFrontMatter(
      '---\ntitle: 架构札记\nauthor: "周明"\n---\n# 正文\n内容',
    );
    expect(frontMatter).toEqual({ title: '架构札记', author: '周明' });
    expect(body).toBe('# 正文\n内容');
  });
});

describe('rendering', () => {
  it('escapes plain text and splits paragraphs', () => {
    expect(plainTextToHtml('a <b>\n续行\n\n第二段')).toBe(
      '<p>a &lt;b&gt;<br>续行</p><p>第二段</p>',
    );
  });
});
