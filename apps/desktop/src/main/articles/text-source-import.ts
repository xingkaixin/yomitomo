import { JSDOM } from 'jsdom';
import { makeId, type ArticleRecord, type ArticleUpsertPatch } from '@yomitomo/shared';
import type {
  TextImportCommitInput,
  TextImportCommitItem,
  TextImportCommitResult,
  TextImportPrepareInput,
  TextImportPreparedItem,
  TextImportPrepareResult,
} from '../../ipc-contract';
import type { ArticleSourceImportRepository } from './article-source-import';
import { importArticleSource } from './article-source-import';
import {
  decodeTextContent,
  prepareTextSource,
  renderTextBodyHtml,
  textContentHash,
  textFormatFromFileName,
} from './text-import';

export function prepareTextSourceItems(input: TextImportPrepareInput): TextImportPrepareResult {
  if (input.kind === 'paste') {
    if (!input.content.trim()) return { items: [{ ok: false, reason: 'empty' }] };
    return {
      items: [{ ok: true, ...prepareTextSource({ content: input.content, format: input.format }) }],
    };
  }
  return { items: input.files.map(prepareTextFileItem) };
}

function prepareTextFileItem(file: {
  fileName: string;
  data: ArrayBuffer;
}): TextImportPreparedItem {
  const decoded = decodeTextContent(new Uint8Array(file.data));
  if (!decoded.ok) return { ok: false, fileName: file.fileName, reason: decoded.reason };
  if (!decoded.text.trim()) return { ok: false, fileName: file.fileName, reason: 'empty' };
  return {
    ok: true,
    ...prepareTextSource({
      content: decoded.text,
      format: textFormatFromFileName(file.fileName),
      fileName: file.fileName,
    }),
  };
}

export async function commitTextSources(
  input: TextImportCommitInput,
  repository: ArticleSourceImportRepository,
): Promise<TextImportCommitResult> {
  const { document } = new JSDOM('').window;
  const articles: ArticleRecord[] = [];
  const patches: ArticleUpsertPatch[] = [];
  for (const item of input.items) {
    const result = await importArticleSource({
      record: buildTextArticleRecord(item, document),
      repository,
    });
    if (result.status === 'imported') {
      articles.push(result.article);
      patches.push(result.patch);
    }
  }
  return { articles, patches };
}

export function buildTextArticleRecord(
  item: TextImportCommitItem,
  articleDocument: Document,
): ArticleRecord {
  const id = makeId('text');
  const url = `text:${id}`;
  const now = new Date().toISOString();
  return {
    id,
    url,
    canonicalUrl: url,
    sourceType: 'text',
    title: item.title.trim(),
    byline: item.author?.trim() || undefined,
    contentHash: textContentHash(item.format, item.body),
    text: { format: item.format },
    contentHtml: renderTextBodyHtml(item.body, item.format, articleDocument, url),
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}
