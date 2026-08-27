import { createHash } from 'node:crypto';
import type { ArticleSourceImportRepository } from '../articles/article-source-import';
import type { ImportedEbookArticle } from './ebook-import-types';

export function ebookSourceIdentity(data: ArrayBuffer) {
  const contentHash = createHash('sha256').update(new Uint8Array(data)).digest('hex');
  return { id: `ebook_${contentHash}`, contentHash };
}

export async function resolveEbookImportRecord(
  imported: ImportedEbookArticle,
  repository: Pick<ArticleSourceImportRepository, 'findArticleByIdentity' | 'readArticle'>,
) {
  const { legacyId, ...record } = imported;
  if (repository.findArticleByIdentity(record)) return record;

  // Old prefix hashes locate candidates; only full chapter equality permits reusing an old ID.
  const legacy = await repository.readArticle(legacyId);
  if (
    legacy?.sourceType === 'ebook' &&
    legacy.title === record.title &&
    legacy.byline === record.byline &&
    legacy.ebook.metadata.format === record.ebook.metadata.format &&
    JSON.stringify(legacy.ebook.chapters) === JSON.stringify(record.ebook.chapters)
  ) {
    return legacy;
  }
  return record;
}
