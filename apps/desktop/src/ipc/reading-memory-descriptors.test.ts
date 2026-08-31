import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ReadingEvidenceScope } from '@yomitomo/shared';
import type {
  DesktopIpcInvokeApi,
  DesktopIpcInvokeArgs,
  ReadingLibraryAnswerResult,
  ReadingLibraryContext,
  ReadingLibrarySearchInput,
  ReadingLibrarySession,
  ReadingMemoryStatusSnapshot,
  ReadingRelationsJudgeResult,
  ReadingRelationsSearchInput,
  ReadingRelationsSession,
  ReadingReviewQueue,
  ReadingReviewStartInput,
  ReadingReviewSession,
  ReadingReviewRevealResult,
  ReadingReviewHistoryCursor,
  ReadingReviewHistoryPage,
  ReadingReviewSubmitInput,
  ReadingReviewSubmitResult,
  ReadingReviewEvidenceSearchInput,
  ReadingReviewEvidenceSession,
  ReadingReviewEvidenceResult,
} from '../ipc-contract';
import { desktopIpcInvokeDescriptors, desktopIpcInvokeRoutes } from '../ipc-contract';
import { readingMemoryIpcInvokeDescriptors } from './reading-memory-descriptors';
import { readingMemoryIpcInvokeSchemas } from './reading-memory-schemas';

describe('reading memory IPC descriptors', () => {
  it('derives the complete preload API from the independent protocol unit', () => {
    expectTypeOf<DesktopIpcInvokeApi['readingMemory']>().toMatchTypeOf<{
      relations: {
        search: (input: ReadingRelationsSearchInput) => Promise<ReadingRelationsSession>;
        judge: (input: { requestId: string }) => Promise<ReadingRelationsJudgeResult>;
        cancel: (input: { requestId: string }) => Promise<void>;
      };
      library: {
        context: (input: { scope: ReadingEvidenceScope }) => Promise<ReadingLibraryContext>;
        search: (input: ReadingLibrarySearchInput) => Promise<ReadingLibrarySession>;
        answer: (input: { requestId: string }) => Promise<ReadingLibraryAnswerResult>;
        cancel: (input: { requestId: string }) => Promise<void>;
      };
      review: {
        queue: () => Promise<ReadingReviewQueue>;
        start: (input: ReadingReviewStartInput) => Promise<ReadingReviewSession>;
        reveal: (input: {
          requestId: string;
          answer: string;
        }) => Promise<ReadingReviewRevealResult>;
        history: (input: {
          requestId: string;
          cursor?: ReadingReviewHistoryCursor;
        }) => Promise<ReadingReviewHistoryPage>;
        submit: (input: ReadingReviewSubmitInput) => Promise<ReadingReviewSubmitResult>;
        cancel: (input: { requestId: string; comparisonId?: string }) => Promise<void>;
        searchEvidence: (
          input: ReadingReviewEvidenceSearchInput,
        ) => Promise<ReadingReviewEvidenceSession>;
        compareEvidence: (input: {
          requestId: string;
          comparisonId: string;
        }) => Promise<ReadingReviewEvidenceResult>;
      };
      confirmPrivacy: () => Promise<void>;
      model: {
        status: () => Promise<ReadingMemoryStatusSnapshot>;
        download: (source: 'modelscope' | 'huggingface') => Promise<ReadingMemoryStatusSnapshot>;
        cancel: () => Promise<ReadingMemoryStatusSnapshot>;
        remove: () => Promise<ReadingMemoryStatusSnapshot>;
      };
      index: {
        pause: () => Promise<ReadingMemoryStatusSnapshot>;
        resume: () => Promise<ReadingMemoryStatusSnapshot>;
        rebuild: () => Promise<ReadingMemoryStatusSnapshot>;
      };
    }>();

    expectTypeOf<DesktopIpcInvokeArgs<'reading-memory:relations:search'>>().toEqualTypeOf<
      [ReadingRelationsSearchInput]
    >();
    expectTypeOf<DesktopIpcInvokeArgs<'reading-memory:library:search'>>().toEqualTypeOf<
      [ReadingLibrarySearchInput]
    >();
    expectTypeOf<DesktopIpcInvokeArgs<'reading-memory:library:context'>>().toEqualTypeOf<
      [{ scope: ReadingEvidenceScope }]
    >();
  });

  it('limits every route to the unlocked main window and declares validation explicitly', () => {
    for (const [channel, descriptor] of Object.entries(readingMemoryIpcInvokeDescriptors)) {
      expect(descriptor.roles).toEqual(['main']);
      expect(descriptor).not.toHaveProperty('appLockBypass');
      expect(desktopIpcInvokeDescriptors).toHaveProperty(channel, descriptor);
      expect(desktopIpcInvokeRoutes).toHaveProperty(channel, descriptor.route);
      if (descriptor.validation === 'schema') {
        expect(readingMemoryIpcInvokeSchemas).toHaveProperty(channel);
      } else {
        expect(descriptor.validation).toEqual({ exempt: 'no-args' });
        expect(readingMemoryIpcInvokeSchemas).not.toHaveProperty(channel);
      }
    }
  });

  it('leaves database lease ownership with the runtime', () => {
    for (const descriptor of Object.values(readingMemoryIpcInvokeDescriptors)) {
      expect(descriptor).toHaveProperty('databaseIndependent', true);
    }
  });
});
