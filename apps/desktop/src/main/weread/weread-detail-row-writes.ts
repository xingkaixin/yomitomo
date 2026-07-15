import type {
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadThought,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreExecutor } from '../store/store-db';

// 999 stays valid across SQLite builds even though the bundled binaries allow more variables.
const SQLITE_SAFE_VARIABLE_LIMIT = 999;

export type WeReadDetailRows = {
  chapters: Array<typeof schema.wereadChapters.$inferInsert>;
  highlights: Array<typeof schema.wereadHighlights.$inferInsert>;
  thoughts: Array<typeof schema.wereadThoughts.$inferInsert>;
};

export function buildWeReadDetailRows(details: WeReadBookDetail[]): WeReadDetailRows {
  return {
    chapters: details.flatMap((detail) => detail.chapters.map(weReadChapterRow)),
    highlights: details.flatMap((detail) => detail.highlights.map(weReadHighlightRow)),
    thoughts: details.flatMap((detail) => detail.thoughts.map(weReadThoughtRow)),
  };
}

export function insertWeReadDetailRows(database: StoreExecutor, rows: WeReadDetailRows) {
  return (
    insertRowsInBatches(rows.chapters, (batch) =>
      database.insert(schema.wereadChapters).values(batch).run(),
    ) +
    insertRowsInBatches(rows.highlights, (batch) =>
      database.insert(schema.wereadHighlights).values(batch).run(),
    ) +
    insertRowsInBatches(rows.thoughts, (batch) =>
      database.insert(schema.wereadThoughts).values(batch).run(),
    )
  );
}

function insertRowsInBatches<Row extends object>(rows: Row[], insert: (batch: Row[]) => void) {
  if (rows.length === 0) return 0;

  const parameterCount = Object.keys(rows[0]).length;
  const batchSize = Math.floor(SQLITE_SAFE_VARIABLE_LIMIT / parameterCount);
  if (batchSize < 1) throw new Error('WEREAD_DETAIL_ROW_EXCEEDS_SQLITE_PARAMETER_LIMIT');

  let statementCount = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    insert(rows.slice(index, index + batchSize));
    statementCount += 1;
  }
  return statementCount;
}

function weReadChapterRow(chapter: WeReadChapter): typeof schema.wereadChapters.$inferInsert {
  return {
    bookId: chapter.bookId,
    chapterUid: chapter.chapterUid,
    chapterIdx: chapter.chapterIdx,
    title: chapter.title,
    level: chapter.level,
    wordCount: chapter.wordCount ?? null,
  };
}

function weReadHighlightRow(
  highlight: WeReadHighlight,
): typeof schema.wereadHighlights.$inferInsert {
  return {
    bookmarkId: highlight.bookmarkId,
    bookId: highlight.bookId,
    chapterUid: highlight.chapterUid,
    chapterIdx: highlight.chapterIdx ?? null,
    range: highlight.range || null,
    markText: highlight.markText,
    colorStyle: highlight.colorStyle ?? null,
    createTime: highlight.createTime,
  };
}

function weReadThoughtRow(thought: WeReadThought): typeof schema.wereadThoughts.$inferInsert {
  return {
    reviewId: thought.reviewId,
    bookId: thought.bookId,
    userVid: thought.userVid ?? null,
    author: thought.author || null,
    chapterUid: thought.chapterUid ?? null,
    chapterIdx: thought.chapterIdx ?? null,
    chapterName: thought.chapterName || null,
    range: thought.range || null,
    abstract: thought.abstract || null,
    content: thought.content,
    createTime: thought.createTime,
  };
}
