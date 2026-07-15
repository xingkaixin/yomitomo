import { performance } from 'node:perf_hooks';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import type {
  WeReadBook,
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadOpenMethod,
  WeReadReadingStats,
  WeReadReadingStatsSnapshot,
  WeReadReadingStatsState,
  WeReadSettings,
  WeReadSyncMode,
  WeReadThought,
  WeReadUser,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
import { readWeReadApiKey, saveWeReadApiKey, wereadApiKeyRef } from '../providers/provider-secrets';
import {
  cancelSecretDeletion,
  completeSecretDeletion,
  queueSecretDeletion,
} from '../providers/secret-deletion-repository';
import { getDatabase, type StoreExecutor } from '../store/store-db';
import {
  buildWeReadDetailRows,
  insertWeReadDetailRows,
  type WeReadDetailRows,
} from './weread-detail-row-writes';

const WEREAD_ACCOUNT_ID = 'default';
const WEREAD_SKILL_VERSION = '1.0.3';

type WeReadRepositoryLogInfo = (event: string, data?: Record<string, unknown>) => void;

export async function readStoredWeReadApiKey() {
  const account = readWeReadAccountRow();
  return readWeReadApiKey(account?.apiKeyRef);
}

export async function readWeReadState() {
  return {
    settings: await readWeReadSettings(),
    books: readWeReadBooks(),
  };
}

export async function readWeReadSettings(): Promise<WeReadSettings> {
  const account = readWeReadAccountRow();
  return {
    configured: Boolean(account?.apiKeyRef && (await readWeReadApiKey(account.apiKeyRef))),
    openMethod: normalizeWeReadOpenMethod(account?.openMethod),
    syncMode: normalizeWeReadSyncMode(account?.syncMode),
    status: normalizeWeReadStatus(account?.status),
    lastSyncAt: account?.lastSyncAt || undefined,
    lastTestAt: account?.lastTestAt || undefined,
    message: account?.message || undefined,
  };
}

export async function saveWeReadSettings(input: {
  apiKey?: string;
  removeApiKey?: boolean;
  openMethod?: WeReadOpenMethod;
  syncMode?: WeReadSyncMode;
}) {
  const existing = readWeReadAccountRow();
  let apiKeyRef = existing?.apiKeyRef || null;
  let secretRefToDelete: string | undefined;
  if (input.apiKey?.trim()) apiKeyRef = await saveWeReadApiKey(input.apiKey.trim());
  else if (input.removeApiKey) {
    secretRefToDelete = apiKeyRef || wereadApiKeyRef();
    apiKeyRef = null;
  }
  const account = {
    apiKeyRef,
    openMethod: normalizeWeReadOpenMethod(input.openMethod ?? existing?.openMethod),
    syncMode: normalizeWeReadSyncMode(input.syncMode ?? existing?.syncMode),
    status: apiKeyRef ? existing?.status || 'idle' : 'idle',
    message: apiKeyRef ? existing?.message : null,
    lastSyncAt: existing?.lastSyncAt,
    lastTestAt: existing?.lastTestAt,
  };
  const database = getDatabase();
  database.transaction((tx) => {
    upsertWeReadAccountRow(tx, account);
    if (secretRefToDelete) queueSecretDeletion(tx, secretRefToDelete);
    else if (apiKeyRef) cancelSecretDeletion(tx, apiKeyRef);
  });
  if (secretRefToDelete) await completeSecretDeletion(secretRefToDelete);
  return readWeReadState();
}

export async function saveWeReadTestResult(ok: boolean, message: string) {
  const existing = readWeReadAccountRow();
  upsertWeReadAccount({
    apiKeyRef: existing?.apiKeyRef || null,
    openMethod: normalizeWeReadOpenMethod(existing?.openMethod),
    syncMode: normalizeWeReadSyncMode(existing?.syncMode),
    status: ok ? 'connected' : 'error',
    message,
    lastSyncAt: existing?.lastSyncAt,
    lastTestAt: new Date().toISOString(),
  });
  return readWeReadState();
}

export async function saveWeReadBooks(books: WeReadBook[]) {
  const database = getDatabase();
  database.transaction((tx) => {
    for (const book of books) upsertWeReadBook(tx, book);
    removeStaleWeReadBooks(
      tx,
      books.map((book) => book.bookId),
    );
    const existing = tx
      .select()
      .from(schema.wereadAccounts)
      .where(eq(schema.wereadAccounts.id, WEREAD_ACCOUNT_ID))
      .get();
    upsertWeReadAccountRow(tx, {
      apiKeyRef: existing?.apiKeyRef || null,
      openMethod: normalizeWeReadOpenMethod(existing?.openMethod),
      syncMode: normalizeWeReadSyncMode(existing?.syncMode),
      status: 'connected',
      message: null,
      lastSyncAt: new Date().toISOString(),
      lastTestAt: existing?.lastTestAt,
    });
  });
  return readWeReadState();
}

export async function saveWeReadLibrarySnapshot(
  input: {
    details: WeReadBookDetail[];
    authoritativeBookIds: string[];
  },
  logInfo?: WeReadRepositoryLogInfo,
) {
  validateWeReadSyncSnapshot(input);
  const detailRows = buildWeReadDetailRows(input.details);
  const database = getDatabase();
  const startedAt = performance.now();
  let childInsertStatementCount = 0;
  database.transaction((tx) => {
    childInsertStatementCount = replaceWeReadBookDetails(tx, input.details, detailRows);
    removeStaleWeReadBooks(tx, input.authoritativeBookIds);
    const existing = tx
      .select()
      .from(schema.wereadAccounts)
      .where(eq(schema.wereadAccounts.id, WEREAD_ACCOUNT_ID))
      .get();
    upsertWeReadAccountRow(tx, {
      apiKeyRef: existing?.apiKeyRef || null,
      openMethod: normalizeWeReadOpenMethod(existing?.openMethod),
      syncMode: normalizeWeReadSyncMode(existing?.syncMode),
      status: 'connected',
      message: null,
      lastSyncAt: new Date().toISOString(),
      lastTestAt: existing?.lastTestAt,
    });
  });
  logWeReadDetailWrite(logInfo, 'library_snapshot', input.details.length, detailRows, {
    childInsertStatementCount,
    startedAt,
  });
  return readWeReadState();
}

function validateWeReadSyncSnapshot(input: {
  details: WeReadBookDetail[];
  authoritativeBookIds: string[];
}) {
  const authoritativeBookIds = new Set(input.authoritativeBookIds);
  if (
    authoritativeBookIds.size !== input.authoritativeBookIds.length ||
    input.authoritativeBookIds.some((bookId) => !bookId)
  ) {
    throw new Error('WEREAD_SYNC_SNAPSHOT_INVALID_AUTHORITY');
  }

  const detailBookIds = input.details.map((detail) => detail.book.bookId);
  if (
    new Set(detailBookIds).size !== detailBookIds.length ||
    detailBookIds.some((bookId) => !authoritativeBookIds.has(bookId))
  ) {
    throw new Error('WEREAD_SYNC_SNAPSHOT_INCONSISTENT_DETAILS');
  }
}

export async function saveWeReadBookDetail(
  detail: WeReadBookDetail,
  logInfo?: WeReadRepositoryLogInfo,
) {
  const hasNotes = detail.highlights.length + detail.thoughts.length > 0;
  const detailRows = hasNotes
    ? buildWeReadDetailRows([detail])
    : { chapters: [], highlights: [], thoughts: [] };
  const database = getDatabase();
  const startedAt = performance.now();
  let childInsertStatementCount = 0;
  database.transaction((tx) => {
    if (!hasNotes) removeWeReadBookRows(tx, [detail.book.bookId]);
    else childInsertStatementCount = replaceWeReadBookDetails(tx, [detail], detailRows);
  });
  logWeReadDetailWrite(logInfo, 'book_detail', 1, detailRows, {
    childInsertStatementCount,
    startedAt,
  });
  const saved = readWeReadBookDetail(detail.book.bookId);
  return saved;
}

export function readWeReadBooks(): WeReadBook[] {
  return getDatabase()
    .select()
    .from(schema.wereadBooks)
    .orderBy(desc(schema.wereadBooks.updatedAt))
    .all()
    .map(rowToWeReadBook)
    .toSorted(
      (left, right) => (right.lastReadAt || right.sort || 0) - (left.lastReadAt || left.sort || 0),
    );
}

export function readWeReadBookDetail(bookId: string): WeReadBookDetail | null {
  const database = getDatabase();
  const book = database
    .select()
    .from(schema.wereadBooks)
    .where(eq(schema.wereadBooks.bookId, bookId))
    .get();
  if (!book) return null;
  const chapters = database
    .select()
    .from(schema.wereadChapters)
    .where(eq(schema.wereadChapters.bookId, bookId))
    .all()
    .map(rowToWeReadChapter)
    .toSorted((left, right) => left.chapterIdx - right.chapterIdx);
  const highlights = database
    .select()
    .from(schema.wereadHighlights)
    .where(eq(schema.wereadHighlights.bookId, bookId))
    .all()
    .map(rowToWeReadHighlight);
  const thoughts = database
    .select()
    .from(schema.wereadThoughts)
    .where(eq(schema.wereadThoughts.bookId, bookId))
    .all()
    .map(rowToWeReadThought);
  return { book: rowToWeReadBook(book), chapters, highlights, thoughts };
}

export function readWeReadReadingStatsState(): WeReadReadingStatsState {
  return {
    snapshots: getDatabase()
      .select()
      .from(schema.wereadReadingStats)
      .orderBy(desc(schema.wereadReadingStats.fetchedAt))
      .all()
      .map(rowToWeReadReadingStatsSnapshot),
  };
}

export function saveWeReadReadingStatsSnapshot(snapshot: WeReadReadingStatsSnapshot) {
  const row = {
    id: snapshot.id,
    mode: snapshot.mode,
    periodStart: snapshot.periodStart,
    sourceBaseTime: snapshot.sourceBaseTime ?? null,
    payload: snapshot.data,
    fetchedAt: snapshot.fetchedAt,
    updatedAt: new Date().toISOString(),
  };
  getDatabase()
    .insert(schema.wereadReadingStats)
    .values(row)
    .onConflictDoUpdate({ target: schema.wereadReadingStats.id, set: row })
    .run();
  return readWeReadReadingStatsState();
}

function readWeReadAccountRow() {
  return getDatabase()
    .select()
    .from(schema.wereadAccounts)
    .where(eq(schema.wereadAccounts.id, WEREAD_ACCOUNT_ID))
    .get();
}

function upsertWeReadAccount(input: {
  apiKeyRef: string | null;
  openMethod: WeReadOpenMethod;
  syncMode: WeReadSyncMode;
  status: string;
  message?: string | null;
  lastSyncAt?: string | null;
  lastTestAt?: string | null;
}) {
  upsertWeReadAccountRow(getDatabase(), input);
}

function upsertWeReadAccountRow(
  database: StoreExecutor,
  input: {
    apiKeyRef: string | null;
    openMethod: WeReadOpenMethod;
    syncMode: WeReadSyncMode;
    status: string;
    message?: string | null;
    lastSyncAt?: string | null;
    lastTestAt?: string | null;
  },
) {
  const row = {
    id: WEREAD_ACCOUNT_ID,
    apiKeyRef: input.apiKeyRef,
    openMethod: input.openMethod,
    syncMode: input.syncMode,
    skillVersion: WEREAD_SKILL_VERSION,
    status: input.status,
    message: input.message || null,
    lastSyncAt: input.lastSyncAt || null,
    lastTestAt: input.lastTestAt || null,
    updatedAt: new Date().toISOString(),
  };
  database
    .insert(schema.wereadAccounts)
    .values(row)
    .onConflictDoUpdate({ target: schema.wereadAccounts.id, set: row })
    .run();
}

function upsertWeReadBook(database: StoreExecutor, book: WeReadBook) {
  const row = {
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
  database
    .insert(schema.wereadBooks)
    .values(row)
    .onConflictDoUpdate({ target: schema.wereadBooks.bookId, set: row })
    .run();
}

function replaceWeReadBookDetails(
  database: StoreExecutor,
  details: WeReadBookDetail[],
  rows: WeReadDetailRows,
) {
  for (const detail of details) {
    upsertWeReadBook(database, detail.book);
    deleteWeReadBookDetailRows(database, detail.book.bookId);
  }
  return insertWeReadDetailRows(database, rows);
}

function deleteWeReadBookDetailRows(database: StoreExecutor, bookId: string) {
  database.delete(schema.wereadChapters).where(eq(schema.wereadChapters.bookId, bookId)).run();
  database.delete(schema.wereadHighlights).where(eq(schema.wereadHighlights.bookId, bookId)).run();
  database.delete(schema.wereadThoughts).where(eq(schema.wereadThoughts.bookId, bookId)).run();
}

function removeStaleWeReadBooks(database: StoreExecutor, bookIds: string[]) {
  const staleBookRows =
    bookIds.length > 0
      ? database
          .select({ bookId: schema.wereadBooks.bookId })
          .from(schema.wereadBooks)
          .where(notInArray(schema.wereadBooks.bookId, bookIds))
          .all()
      : database.select({ bookId: schema.wereadBooks.bookId }).from(schema.wereadBooks).all();
  const staleBookIds = staleBookRows.map((row) => row.bookId);
  if (staleBookIds.length === 0) return;

  removeWeReadBookRows(database, staleBookIds);
}

function removeWeReadBookRows(database: StoreExecutor, staleBookIds: string[]) {
  database
    .delete(schema.collectionMembers)
    .where(
      and(
        eq(schema.collectionMembers.memberKind, 'weread'),
        inArray(schema.collectionMembers.memberId, staleBookIds),
      ),
    )
    .run();
  database
    .delete(schema.libraryPins)
    .where(
      and(
        eq(schema.libraryPins.targetKind, 'weread'),
        inArray(schema.libraryPins.targetId, staleBookIds),
      ),
    )
    .run();
  database
    .delete(schema.wereadChapters)
    .where(inArray(schema.wereadChapters.bookId, staleBookIds))
    .run();
  database
    .delete(schema.wereadHighlights)
    .where(inArray(schema.wereadHighlights.bookId, staleBookIds))
    .run();
  database
    .delete(schema.wereadThoughts)
    .where(inArray(schema.wereadThoughts.bookId, staleBookIds))
    .run();
  database.delete(schema.wereadBooks).where(inArray(schema.wereadBooks.bookId, staleBookIds)).run();
}

function logWeReadDetailWrite(
  logInfo: WeReadRepositoryLogInfo | undefined,
  scope: 'book_detail' | 'library_snapshot',
  bookCount: number,
  rows: WeReadDetailRows,
  input: { childInsertStatementCount: number; startedAt: number },
) {
  logInfo?.('weread.repository.detail_rows_saved', {
    scope,
    bookCount,
    chapterRowCount: rows.chapters.length,
    highlightRowCount: rows.highlights.length,
    thoughtRowCount: rows.thoughts.length,
    childInsertStatementCount: input.childInsertStatementCount,
    transactionDurationMs: Number((performance.now() - input.startedAt).toFixed(2)),
  });
}

export function rowToWeReadBook(row: typeof schema.wereadBooks.$inferSelect): WeReadBook {
  return {
    bookId: row.bookId,
    title: row.title,
    author: row.author || undefined,
    cover: row.cover || undefined,
    intro: row.intro || undefined,
    reviewCount: row.reviewCount,
    noteCount: row.noteCount,
    bookmarkCount: row.bookmarkCount,
    readingProgress: row.readingProgress,
    markedStatus: row.markedStatus ?? undefined,
    sort: row.sort ?? undefined,
    currentChapterUid: row.currentChapterUid ?? undefined,
    currentChapterOffset: row.currentChapterOffset ?? undefined,
    readingTime: row.readingTime ?? undefined,
    recordReadingTime: row.recordReadingTime ?? undefined,
    lastReadAt: row.lastReadAt ?? undefined,
    syncedAt: row.syncedAt || undefined,
    updatedAt: row.updatedAt,
  };
}

function rowToWeReadReadingStatsSnapshot(
  row: typeof schema.wereadReadingStats.$inferSelect,
): WeReadReadingStatsSnapshot {
  return {
    id: row.id,
    mode:
      row.mode === 'weekly' || row.mode === 'monthly' || row.mode === 'annually'
        ? row.mode
        : 'overall',
    periodStart: row.periodStart,
    sourceBaseTime: row.sourceBaseTime ?? undefined,
    data: normalizeWeReadReadingStats(row.payload, row.mode),
    fetchedAt: row.fetchedAt,
  };
}

function rowToWeReadChapter(row: typeof schema.wereadChapters.$inferSelect): WeReadChapter {
  return {
    bookId: row.bookId,
    chapterUid: row.chapterUid,
    chapterIdx: row.chapterIdx,
    title: row.title,
    level: row.level,
    wordCount: row.wordCount ?? undefined,
  };
}

function rowToWeReadHighlight(row: typeof schema.wereadHighlights.$inferSelect): WeReadHighlight {
  return {
    bookmarkId: row.bookmarkId,
    bookId: row.bookId,
    chapterUid: row.chapterUid,
    chapterIdx: row.chapterIdx ?? undefined,
    range: row.range || undefined,
    markText: row.markText,
    colorStyle: row.colorStyle ?? undefined,
    createTime: row.createTime,
  };
}

function rowToWeReadThought(row: typeof schema.wereadThoughts.$inferSelect): WeReadThought {
  return {
    reviewId: row.reviewId,
    bookId: row.bookId,
    userVid: row.userVid ?? undefined,
    author: normalizeWeReadUser(row.author),
    chapterUid: row.chapterUid ?? undefined,
    chapterIdx: row.chapterIdx ?? undefined,
    chapterName: row.chapterName || undefined,
    range: row.range || undefined,
    abstract: row.abstract || undefined,
    content: row.content,
    createTime: row.createTime,
  };
}

function normalizeWeReadOpenMethod(value: unknown): WeReadOpenMethod {
  return value === 'web' ? 'web' : 'deeplink';
}

function normalizeWeReadSyncMode(value: unknown): WeReadSyncMode {
  return value === 'auto' ? 'auto' : 'manual';
}

function normalizeWeReadUser(value: unknown): WeReadUser | undefined {
  if (!isRecord(value)) return undefined;
  return {
    userVid: numberField(value.userVid),
    name: stringField(value.name) || undefined,
    avatar: stringField(value.avatar) || undefined,
  };
}

export function normalizeWeReadReadingStats(value: unknown, mode: unknown): WeReadReadingStats {
  const data = isRecord(value) ? value : {};
  return {
    mode:
      mode === 'weekly' || mode === 'monthly' || mode === 'annually' || mode === 'overall'
        ? mode
        : 'overall',
    totalReadTime: numberField(data.totalReadTime) ?? 0,
    readDays: numberField(data.readDays),
    dayAverageReadTime: numberField(data.dayAverageReadTime),
    compare: numberField(data.compare),
    readRate: numberField(data.readRate),
    wrReadTime: numberField(data.wrReadTime),
    wrListenTime: numberField(data.wrListenTime),
    readStat: arrayField(data.readStat).map(normalizeWeReadReadingStatsItem),
    readTimes: numberRecordField(data.readTimes),
    readLongest: arrayField(data.readLongest).map(normalizeWeReadReadingStatsBook),
    preferCategory: arrayField(data.preferCategory).map(normalizeWeReadReadingStatsItem),
    preferCategoryWord: stringField(data.preferCategoryWord) || undefined,
    preferTimeWord: stringField(data.preferTimeWord) || undefined,
    preferTime: arrayField(data.preferTime)
      .map(numberField)
      .filter((item): item is number => item !== undefined),
    preferAuthor: stringField(data.preferAuthor) || undefined,
    preferPublisher: stringField(data.preferPublisher) || undefined,
    authorCount: numberField(data.authorCount),
    registTime: numberField(data.registTime),
  };
}

function normalizeWeReadReadingStatsItem(value: unknown) {
  const item = isRecord(value) ? value : {};
  return {
    stat: stringField(item.stat),
    counts: stringField(item.counts),
  };
}

function normalizeWeReadReadingStatsBook(value: unknown) {
  const item = isRecord(value) ? value : {};
  return {
    bookId: stringField(item.bookId) || undefined,
    title: stringField(item.title) || undefined,
    author: stringField(item.author) || undefined,
    cover: stringField(item.cover) || undefined,
    readTime: numberField(item.readTime),
    finishReadingTime: numberField(item.finishReadingTime),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayField(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function numberRecordField(value: unknown) {
  const record = isRecord(value) ? value : {};
  const normalized: Record<string, number> = {};
  for (const [key, item] of Object.entries(record)) {
    const number = numberField(item);
    if (number !== undefined) normalized[key] = number;
  }
  return normalized;
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberField(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

function normalizeWeReadStatus(value: unknown): WeReadSettings['status'] {
  return value === 'connected' || value === 'error' || value === 'idle' ? value : 'idle';
}
