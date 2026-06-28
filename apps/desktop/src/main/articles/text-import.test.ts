// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  decodeTextContent,
  inferTextAuthor,
  inferTextTitle,
  plainTextToHtml,
  renderTextBodyHtml,
  splitFrontMatter,
} from './text-import';

describe('decodeTextContent', () => {
  it('decodes UTF-8 and strips the BOM', () => {
    const data = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('你好 hi')]);
    const result = decodeTextContent(data);
    expect(result).toEqual({ ok: true, text: '你好 hi', encoding: 'utf-8' });
  });

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

  it('returns the original text when there is no front matter', () => {
    const { frontMatter, body } = splitFrontMatter('# 标题\n正文');
    expect(frontMatter).toEqual({});
    expect(body).toBe('# 标题\n正文');
  });
});

describe('inferTextTitle / inferTextAuthor', () => {
  it('prefers front matter title for markdown', () => {
    expect(
      inferTextTitle({
        format: 'markdown',
        body: '# 一级标题',
        frontMatter: { title: '元数据标题' },
        fileName: 'note.md',
      }),
    ).toBe('元数据标题');
  });

  it('falls back to the first markdown heading', () => {
    expect(
      inferTextTitle({ format: 'markdown', body: '前言\n\n# 真正的标题', frontMatter: {} }),
    ).toBe('真正的标题');
  });

  it('uses the file name for plain text', () => {
    expect(
      inferTextTitle({
        format: 'plain',
        body: '第一行',
        frontMatter: {},
        fileName: '深夜随笔.txt',
      }),
    ).toBe('深夜随笔');
  });

  it('falls back to the first non-empty line without a file name', () => {
    expect(inferTextTitle({ format: 'plain', body: '\n\n开篇一句\n更多', frontMatter: {} })).toBe(
      '开篇一句',
    );
  });

  it('reads the author from front matter', () => {
    expect(inferTextAuthor({ author: '周明' })).toBe('周明');
    expect(inferTextAuthor({})).toBeUndefined();
  });
});

describe('rendering', () => {
  it('escapes plain text and splits paragraphs', () => {
    expect(plainTextToHtml('a <b>\n续行\n\n第二段')).toBe(
      '<p>a &lt;b&gt;<br>续行</p><p>第二段</p>',
    );
  });

  it('sanitizes markdown by stripping script injection', () => {
    const html = renderTextBodyHtml(
      '# 标题\n\n<script>alert(1)</script>正文',
      'markdown',
      document,
      'text://local',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('标题');
  });

  it('prepends a front matter metadata block', () => {
    const html = renderTextBodyHtml('正文', 'markdown', document, 'text://local', {
      title: '札记',
      author: '周明',
    });
    expect(html).toContain('class="text-frontmatter"');
    expect(html).toContain('<dt>title</dt><dd>札记</dd>');
    expect(html).toContain('<dt>author</dt><dd>周明</dd>');
  });
});
