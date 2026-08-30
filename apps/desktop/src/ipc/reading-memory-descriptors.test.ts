import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  DesktopIpcInvokeApi,
  DesktopIpcInvokeArgs,
  ReadingMemoryStatusSnapshot,
  ReadingRelationsJudgeResult,
  ReadingRelationsSearchInput,
  ReadingRelationsSession,
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
      confirmPrivacy: () => Promise<void>;
      model: {
        status: () => Promise<ReadingMemoryStatusSnapshot>;
        download: () => Promise<ReadingMemoryStatusSnapshot>;
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
