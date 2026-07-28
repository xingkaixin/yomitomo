import { getTableColumns, inArray, sql } from 'drizzle-orm';
import type {
  WeReadBook,
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
  books: Array<typeof schema.wereadBooks.$inferInsert>;
  chapters: Array<typeof schema.wereadChapters.$inferInsert>;
  highlights: Array<typeof schema.wereadHighlights.$inferInsert>;
  thoughts: Array<typeof schema.wereadThoughts.$inferInsert>;
};

export function buildWeReadDetailRows(details: WeReadBookDetail[]): WeReadDetailRows {
  return {
    books: details.map((detail) => weReadBookRow(detail.book)),
    chapters: details.flatMap((detail) => detail.chapters.map(weReadChapterRow)),
    highlights: details.flatMap((detail) => detail.highlights.map(weReadHighlightRow)),
    thoughts: details.flatMap((detail) => detail.thoughts.map(weReadThoughtRow)),
  };
}

export function weReadBookRow(book: WeReadBook): typeof schema.wereadBooks.$inferInsert {
  return {
    bookId: book.bookId,
    title: book.title,
    author: book.author || null,
    cover: book.cover || null,
    intro: book.intro || null,
    reviewCount: book.reviewCount,
    noteCount: book.noteCount,
    bookmarkCount: book.bookmarkCount,
    readingProgress: book.readingProgress,
    markedStatus: book.markedStatus ?? null,
    sort: book.sort ?? null,
    currentChapterUid: book.currentChapterUid ?? null,
    currentChapterOffset: book.currentChapterOffset ?? null,
    readingTime: book.readingTime ?? null,
    recordReadingTime: book.recordReadingTime ?? null,
    lastReadAt: book.lastReadAt ?? null,
    syncedAt: book.syncedAt || new Date().toISOString(),
    updatedAt: book.updatedAt,
  };
}

/** Replaces the book rows of a snapshot in batches, keeping one statement per chunk instead of per book. */
export function upsertWeReadBookRows(
  database: StoreExecutor,
  books: Array<typeof schema.wereadBooks.$inferInsert>,
) {
  return writeRowsInBatches(books, (batch) =>
    database
      .insert(schema.wereadBooks)
      .values(batch)
      .onConflictDoUpdate({ target: schema.wereadBooks.bookId, set: weReadBookExcludedSet() })
      .run(),
  );
}

/** Clears the child rows of the given books so each detail is fully replaced, one statement per id chunk. */
export function deleteWeReadDetailRowsForBooks(database: StoreExecutor, bookIds: string[]) {
  if (bookIds.length === 0) return 0;

  let statementCount = 0;
  for (let index = 0; index < bookIds.length; index += SQLITE_SAFE_VARIABLE_LIMIT) {
    const chunk = bookIds.slice(index, index + SQLITE_SAFE_VARIABLE_LIMIT);
    database
      .delete(schema.wereadChapters)
      .where(inArray(schema.wereadChapters.bookId, chunk))
      .run();
    database
      .delete(schema.wereadHighlights)
      .where(inArray(schema.wereadHighlights.bookId, chunk))
      .run();
    database
      .delete(schema.wereadThoughts)
      .where(inArray(schema.wereadThoughts.bookId, chunk))
      .run();
    statementCount += 3;
  }
  return statementCount;
}

function weReadBookExcludedSet() {
  const { bookId: _bookId, ...updatable } = getTableColumns(schema.wereadBooks);
  return Object.fromEntries(
    Object.entries(updatable).map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)]),
  );
}

export function insertWeReadDetailRows(database: StoreExecutor, rows: WeReadDetailRows) {
  return (
    writeRowsInBatches(rows.chapters, (batch) =>
      database.insert(schema.wereadChapters).values(batch).run(),
    ) +
    writeRowsInBatches(rows.highlights, (batch) =>
      database.insert(schema.wereadHighlights).values(batch).run(),
    ) +
    writeRowsInBatches(rows.thoughts, (batch) =>
      database.insert(schema.wereadThoughts).values(batch).run(),
    )
  );
}

function writeRowsInBatches<Row extends object>(rows: Row[], write: (batch: Row[]) => void) {
  if (rows.length === 0) return 0;

  const parameterCount = Object.keys(rows[0]).length;
  const batchSize = Math.floor(SQLITE_SAFE_VARIABLE_LIMIT / parameterCount);
  if (batchSize < 1) throw new Error('WEREAD_DETAIL_ROW_EXCEEDS_SQLITE_PARAMETER_LIMIT');

  let statementCount = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    write(rows.slice(index, index + batchSize));
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
