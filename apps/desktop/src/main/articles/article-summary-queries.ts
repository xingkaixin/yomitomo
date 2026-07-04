import { desc } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { StoreDatabase, StoreReadProfileEntry } from '../store/store-db';
import { measureStoreRead } from '../store/store-read-profile';
import { articleSummaryColumns } from './article-repository-columns';

export function readArticleSummaryRowsForStore(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
) {
  return measureStoreRead(profile, 'read_article_summaries', () =>
    database
      .select(articleSummaryColumns)
      .from(schema.articles)
      .orderBy(desc(schema.articles.updatedAt))
      .all(),
  );
}
