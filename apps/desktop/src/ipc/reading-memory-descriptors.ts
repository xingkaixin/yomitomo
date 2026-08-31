import { desktopIpcInvoke, mainOnly } from './desktop-ipc-descriptor';
import type {
  ReadingLibraryAnswerResult,
  ReadingLibraryContext,
  ReadingLibrarySession,
  ReadingMemoryStatusSnapshot,
  ReadingRelationsJudgeResult,
  ReadingRelationsSession,
  ReadingReviewQueue,
  ReadingReviewSession,
  ReadingReviewRevealResult,
  ReadingReviewHistoryPage,
  ReadingReviewSubmitResult,
  ReadingReviewEvidenceSession,
  ReadingReviewEvidenceResult,
} from './reading-memory-domain';
import type { ReadingMemoryIpcSchemaArgs } from './reading-memory-schemas';

export const readingMemoryIpcInvokeDescriptors = {
  'reading-memory:record-usage': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:record-usage'>,
    void
  >()({
    route: ['readingMemory', 'recordUsage'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:relations:search': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:relations:search'>,
    ReadingRelationsSession
  >()({
    route: ['readingMemory', 'relations', 'search'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:relations:judge': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:relations:judge'>,
    ReadingRelationsJudgeResult
  >()({
    route: ['readingMemory', 'relations', 'judge'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:relations:cancel': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:relations:cancel'>,
    void
  >()({
    route: ['readingMemory', 'relations', 'cancel'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:library:context': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:library:context'>,
    ReadingLibraryContext
  >()({
    route: ['readingMemory', 'library', 'context'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:library:search': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:library:search'>,
    ReadingLibrarySession
  >()({
    route: ['readingMemory', 'library', 'search'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:library:answer': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:library:answer'>,
    ReadingLibraryAnswerResult
  >()({
    route: ['readingMemory', 'library', 'answer'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:library:cancel': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:library:cancel'>,
    void
  >()({
    route: ['readingMemory', 'library', 'cancel'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:confirm-privacy': desktopIpcInvoke<[], void>()({
    route: ['readingMemory', 'confirmPrivacy'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseIndependent: true,
  }),
  'reading-memory:review:queue': desktopIpcInvoke<[], ReadingReviewQueue>()({
    route: ['readingMemory', 'review', 'queue'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseIndependent: true,
  }),
  'reading-memory:review:start': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:review:start'>,
    ReadingReviewSession
  >()({
    route: ['readingMemory', 'review', 'start'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:review:reveal': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:review:reveal'>,
    ReadingReviewRevealResult
  >()({
    route: ['readingMemory', 'review', 'reveal'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:review:history': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:review:history'>,
    ReadingReviewHistoryPage
  >()({
    route: ['readingMemory', 'review', 'history'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:review:submit': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:review:submit'>,
    ReadingReviewSubmitResult
  >()({
    route: ['readingMemory', 'review', 'submit'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:review:cancel': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:review:cancel'>,
    void
  >()({
    route: ['readingMemory', 'review', 'cancel'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:review:search-evidence': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:review:search-evidence'>,
    ReadingReviewEvidenceSession
  >()({
    route: ['readingMemory', 'review', 'searchEvidence'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:review:compare-evidence': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:review:compare-evidence'>,
    ReadingReviewEvidenceResult
  >()({
    route: ['readingMemory', 'review', 'compareEvidence'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:model:status': desktopIpcInvoke<[], ReadingMemoryStatusSnapshot>()({
    route: ['readingMemory', 'model', 'status'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseIndependent: true,
  }),
  'reading-memory:model:download': desktopIpcInvoke<
    ReadingMemoryIpcSchemaArgs<'reading-memory:model:download'>,
    ReadingMemoryStatusSnapshot
  >()({
    route: ['readingMemory', 'model', 'download'],
    roles: mainOnly,
    validation: 'schema',
    databaseIndependent: true,
  }),
  'reading-memory:model:cancel': desktopIpcInvoke<[], ReadingMemoryStatusSnapshot>()({
    route: ['readingMemory', 'model', 'cancel'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseIndependent: true,
  }),
  'reading-memory:model:remove': desktopIpcInvoke<[], ReadingMemoryStatusSnapshot>()({
    route: ['readingMemory', 'model', 'remove'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseIndependent: true,
  }),
  'reading-memory:index:pause': desktopIpcInvoke<[], ReadingMemoryStatusSnapshot>()({
    route: ['readingMemory', 'index', 'pause'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseIndependent: true,
  }),
  'reading-memory:index:resume': desktopIpcInvoke<[], ReadingMemoryStatusSnapshot>()({
    route: ['readingMemory', 'index', 'resume'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseIndependent: true,
  }),
  'reading-memory:index:rebuild': desktopIpcInvoke<[], ReadingMemoryStatusSnapshot>()({
    route: ['readingMemory', 'index', 'rebuild'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseIndependent: true,
  }),
} as const;
