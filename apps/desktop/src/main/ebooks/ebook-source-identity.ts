import type { ArticleRecord } from '@yomitomo/shared';
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
  if (legacy?.sourceType === 'ebook' && matchesLegacyEbook(legacy, imported)) return legacy;
  return record;
}

export function matchesLegacyEbook(
  legacy: Pick<ArticleRecord, 'id' | 'ebook'>,
  imported: ImportedEbookArticle,
) {
  return (
    legacy.id === imported.legacyId &&
    legacy.ebook?.metadata.format === imported.ebook.metadata.format &&
    JSON.stringify(legacy.ebook.chapters) === JSON.stringify(imported.ebook.chapters)
  );
}
