import { readingMemoryEnabled } from '../../reading-memory-release';
import type { DesktopIpcInvokeArgs } from '../../ipc-contract';
import type { ReadingMemoryControls } from '../reading-memory/reading-memory-controls';
import type { ReadingRelationsRuntime } from '../reading-memory/reading-relations-runtime';
import type { ReadingLibraryRuntime } from '../reading-memory/reading-library-runtime';
import type { ReadingReviewRuntime } from '../reading-memory/reading-review-runtime';
import { handleDesktopIpc } from './ipc';

type ReadingMemoryRuntimes = {
  relations: ReadingRelationsRuntime;
  library: ReadingLibraryRuntime;
  review: ReadingReviewRuntime;
  controls: ReadingMemoryControls;
};

type ReadingMemoryIpcContext =
  | (ReadingMemoryRuntimes & {
      recordUsage: (key: DesktopIpcInvokeArgs<'reading-memory:record-usage'>[0]) => void;
    })
  | {
      getRuntimes: () => Promise<ReadingMemoryRuntimes>;
      recordUsage: (key: DesktopIpcInvokeArgs<'reading-memory:record-usage'>[0]) => void;
    };

const handleReadingMemoryIpc: typeof handleDesktopIpc = (channel, handler) =>
  handleDesktopIpc(
    channel,
    readingMemoryEnabled
      ? handler
      : () => {
          throw new Error('Reading memory is not available in this release.');
        },
  );

export function registerReadingMemoryIpc(context: ReadingMemoryIpcContext) {
  const { recordUsage } = context;
  const resolveRuntimes =
    'getRuntimes' in context ? context.getRuntimes : () => Promise.resolve(context);
  handleReadingMemoryIpc('reading-memory:record-usage', (_event, key) => recordUsage(key));
  handleReadingMemoryIpc('reading-memory:review:queue', async () =>
    (await resolveRuntimes()).review.queue(),
  );
  handleReadingMemoryIpc('reading-memory:review:start', async (event, input) =>
    (await resolveRuntimes()).review.start(event.sender, input),
  );
  handleReadingMemoryIpc('reading-memory:review:reveal', async (event, input) =>
    (await resolveRuntimes()).review.reveal(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:review:history', async (event, input) =>
    (await resolveRuntimes()).review.history(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:review:submit', async (event, input) =>
    (await resolveRuntimes()).review.submit(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:review:cancel', async (event, input) =>
    (await resolveRuntimes()).review.cancel(event.sender.id, input.requestId, input.comparisonId),
  );
  handleReadingMemoryIpc('reading-memory:review:search-evidence', async (event, input) =>
    (await resolveRuntimes()).review.searchEvidence(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:review:compare-evidence', async (event, input) =>
    (await resolveRuntimes()).review.compareEvidence(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:library:context', async (_event, input) =>
    (await resolveRuntimes()).library.context(input),
  );
  handleReadingMemoryIpc('reading-memory:library:search', async (event, input) =>
    (await resolveRuntimes()).library.search(event.sender, input),
  );
  handleReadingMemoryIpc('reading-memory:library:answer', async (event, input) =>
    (await resolveRuntimes()).library.answer(event.sender.id, input.requestId),
  );
  handleReadingMemoryIpc('reading-memory:library:cancel', async (event, input) =>
    (await resolveRuntimes()).library.cancel(event.sender.id, input.requestId),
  );
  handleReadingMemoryIpc('reading-memory:relations:search', async (event, input) =>
    (await resolveRuntimes()).relations.search(event.sender, input),
  );
  handleReadingMemoryIpc('reading-memory:relations:judge', async (event, input) =>
    (await resolveRuntimes()).relations.judge(event.sender.id, input.requestId),
  );
  handleReadingMemoryIpc('reading-memory:relations:cancel', async (event, input) =>
    (await resolveRuntimes()).relations.cancel(event.sender.id, input.requestId),
  );
  handleReadingMemoryIpc('reading-memory:confirm-privacy', async () =>
    (await resolveRuntimes()).relations.confirmPrivacy(),
  );
  handleReadingMemoryIpc('reading-memory:model:status', async () =>
    (await resolveRuntimes()).controls.status(),
  );
  handleReadingMemoryIpc('reading-memory:model:download', async (_event, source) =>
    (await resolveRuntimes()).controls.download(source),
  );
  handleReadingMemoryIpc('reading-memory:model:cancel', async () =>
    (await resolveRuntimes()).controls.cancel(),
  );
  handleReadingMemoryIpc('reading-memory:model:remove', async () =>
    (await resolveRuntimes()).controls.remove(),
  );
  handleReadingMemoryIpc('reading-memory:index:pause', async () =>
    (await resolveRuntimes()).controls.pause(),
  );
  handleReadingMemoryIpc('reading-memory:index:resume', async () =>
    (await resolveRuntimes()).controls.resume(),
  );
  handleReadingMemoryIpc('reading-memory:index:rebuild', async () =>
    (await resolveRuntimes()).controls.rebuild(),
  );
}
