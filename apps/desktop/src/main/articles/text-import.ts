import { hashText, renderMarkdown, type TextSourceFormat } from '@yomitomo/shared';
import { sanitizeArticleContent } from '@yomitomo/core/article-extraction';

export type TextDecodeResult =
  | { ok: true; text: string; encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030' }
  | { ok: false; reason: 'binary' | 'undecodable' };

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const SNIFF_BYTES = 4096;

// 文件可能名为 .txt/.md 但内容名不副实：先嗅探二进制，再按编码解码并统一转 UTF-8。
export function decodeTextContent(data: Uint8Array): TextDecodeResult {
  if (data.length === 0) return { ok: true, text: '', encoding: 'utf-8' };

  if (hasPrefix(data, [0xff, 0xfe]))
    return decodeWith(data.subarray(2), 'utf-16le') ?? { ok: false, reason: 'undecodable' };
  if (hasPrefix(data, [0xfe, 0xff]))
    return decodeWith(data.subarray(2), 'utf-16be') ?? { ok: false, reason: 'undecodable' };

  const body = hasPrefix(data, UTF8_BOM) ? data.subarray(UTF8_BOM.length) : data;
  if (looksBinary(body)) return { ok: false, reason: 'binary' };

  try {
    return {
      ok: true,
      text: new TextDecoder('utf-8', { fatal: true }).decode(body),
      encoding: 'utf-8',
    };
  } catch {
    const fallback = decodeWith(body, 'gb18030');
    return fallback ?? { ok: false, reason: 'undecodable' };
  }
}

function decodeWith(
  data: Uint8Array,
  encoding: 'utf-16le' | 'utf-16be' | 'gb18030',
): TextDecodeResult | null {
  try {
    return { ok: true, text: new TextDecoder(encoding, { fatal: true }).decode(data), encoding };
  } catch {
    return null;
  }
}

function hasPrefix(data: Uint8Array, prefix: number[]) {
  if (data.length < prefix.length) return false;
  return prefix.every((byte, index) => data[index] === byte);
}

// NUL 字节是文本里不会出现的可靠二进制信号。
function looksBinary(data: Uint8Array) {
  const limit = Math.min(data.length, SNIFF_BYTES);
  for (let index = 0; index < limit; index += 1) {
    if (data[index] === 0) return true;
  }
  return false;
}

export type FrontMatter = Record<string, string>;

const FRONT_MATTER_PATTERN = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontMatter(text: string): { frontMatter: FrontMatter; body: string } {
  const match = FRONT_MATTER_PATTERN.exec(text);
  if (!match) return { frontMatter: {}, body: text };
  return { frontMatter: parseFlatYaml(match[1]), body: text.slice(match[0].length) };
}

function parseFlatYaml(block: string): FrontMatter {
  const result: FrontMatter = {};
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key) continue;
    result[key] = stripQuotes(line.slice(separator + 1).trim());
  }
  return result;
}

function stripQuotes(value: string) {
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'"))) {
    const quote = value[0];
    if (value.endsWith(quote)) return value.slice(1, -1);
  }
  return value;
}

const FRONT_MATTER_TITLE_KEYS = ['title', 'Title'];
const FRONT_MATTER_AUTHOR_KEYS = ['author', 'Author', 'authors', 'by'];

export type TextTitleInput = {
  format: TextSourceFormat;
  body: string;
  frontMatter: FrontMatter;
  fileName?: string;
};

// 标题缺失兜底：md 用 front matter > H1 > 文件名 > 首行；plain 用 文件名 > 首行。
export function inferTextTitle(input: TextTitleInput): string {
  if (input.format === 'markdown') {
    const fromFrontMatter = pickFrontMatter(input.frontMatter, FRONT_MATTER_TITLE_KEYS);
    if (fromFrontMatter) return fromFrontMatter;
    const heading = firstMarkdownHeading(input.body);
    if (heading) return heading;
  }
  return fileNameToTitle(input.fileName) || firstNonEmptyLine(input.body) || '';
}

export function inferTextAuthor(frontMatter: FrontMatter): string | undefined {
  return pickFrontMatter(frontMatter, FRONT_MATTER_AUTHOR_KEYS) || undefined;
}

function pickFrontMatter(frontMatter: FrontMatter, keys: string[]) {
  for (const key of keys) {
    const value = frontMatter[key]?.trim();
    if (value) return value;
  }
  return '';
}

function firstMarkdownHeading(body: string) {
  for (const line of body.split(/\r?\n/)) {
    const heading = /^(#{1,6})[ \t]+(.+?)[ \t]*#*$/.exec(line.trim());
    if (heading) return heading[2].trim();
  }
  return '';
}

function firstNonEmptyLine(body: string) {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function fileNameToTitle(fileName: string | undefined) {
  if (!fileName) return '';
  const base = fileName.split(/[\\/]/).pop() || fileName;
  return base.replace(/\.(txt|md|markdown|text)$/i, '').trim();
}

export function plainTextToHtml(text: string) {
  return text
    .split(/\r?\n[ \t]*\r?\n/)
    .map((block) => block.replace(/\r?\n/g, '\n').trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// plain 转义后分段、md 经 renderMarkdown；front matter 渲染为正文顶部元数据块。
// 三者都过 DOMPurify 净化防注入（class 与 dl/dt/dd 在默认白名单内）。
export function renderTextBodyHtml(
  body: string,
  format: TextSourceFormat,
  articleDocument: Document,
  baseUrl: string,
  frontMatter?: FrontMatter,
) {
  const bodyHtml = format === 'markdown' ? renderMarkdown(body) : plainTextToHtml(body);
  const rawHtml = `${frontMatterBlockHtml(frontMatter)}${bodyHtml}`;
  return sanitizeArticleContent(articleDocument, rawHtml, baseUrl).html;
}

function frontMatterBlockHtml(frontMatter: FrontMatter | undefined) {
  if (!frontMatter) return '';
  const rows = Object.entries(frontMatter)
    .filter(([key, value]) => key && value)
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join('');
  return rows ? `<dl class="text-frontmatter">${rows}</dl>` : '';
}

export function textContentHash(format: TextSourceFormat, body: string) {
  return hashText(`text:${format}:${body.slice(0, 12000)}`);
}

export function textFormatFromFileName(fileName: string): TextSourceFormat {
  return /\.(md|markdown)$/i.test(fileName) ? 'markdown' : 'plain';
}

export type PreparedTextSource = {
  format: TextSourceFormat;
  fileName?: string;
  suggestedTitle: string;
  suggestedAuthor?: string;
  body: string;
  frontMatter?: FrontMatter;
};

// 解码后的文本 → 拆 front matter（仅 md）、推断标题/作者，供导入确认表单预填。
export function prepareTextSource(input: {
  content: string;
  format: TextSourceFormat;
  fileName?: string;
}): PreparedTextSource {
  const { frontMatter, body } =
    input.format === 'markdown'
      ? splitFrontMatter(input.content)
      : { frontMatter: {} as FrontMatter, body: input.content };
  return {
    format: input.format,
    fileName: input.fileName,
    suggestedTitle: inferTextTitle({
      format: input.format,
      body,
      frontMatter,
      fileName: input.fileName,
    }),
    suggestedAuthor: inferTextAuthor(frontMatter),
    body,
    frontMatter: Object.keys(frontMatter).length > 0 ? frontMatter : undefined,
  };
}
