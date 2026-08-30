import { readingMemoryEnabled } from '../../reading-memory-release';
import type { DesktopIpcInvokeArgs } from '../../ipc-contract';
import type { ReadingMemoryControls } from '../reading-memory/reading-memory-controls';
import type { ReadingRelationsRuntime } from '../reading-memory/reading-relations-runtime';
import type { ReadingLibraryRuntime } from '../reading-memory/reading-library-runtime';
import type { ReadingReviewRuntime } from '../reading-memory/reading-review-runtime';
import { handleDesktopIpc } from './ipc';

type ReadingMemoryIpcContext = {
  relations: ReadingRelationsRuntime;
  library: ReadingLibraryRuntime;
  review: ReadingReviewRuntime;
  controls: ReadingMemoryControls;
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

export function registerReadingMemoryIpc({
  relations,
  library,
  review,
  controls,
  recordUsage,
}: ReadingMemoryIpcContext) {
  handleReadingMemoryIpc('reading-memory:record-usage', (_event, key) => recordUsage(key));
  handleReadingMemoryIpc('reading-memory:review:queue', () => review.queue());
  handleReadingMemoryIpc('reading-memory:review:start', (event, input) =>
    review.start(event.sender, input),
  );
  handleReadingMemoryIpc('reading-memory:review:reveal', (event, input) =>
    review.reveal(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:review:history', (event, input) =>
    review.history(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:review:submit', (event, input) =>
    review.submit(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:review:cancel', (event, input) =>
    review.cancel(event.sender.id, input.requestId, input.comparisonId),
  );
  handleReadingMemoryIpc('reading-memory:review:search-evidence', (event, input) =>
    review.searchEvidence(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:review:compare-evidence', (event, input) =>
    review.compareEvidence(event.sender.id, input),
  );
  handleReadingMemoryIpc('reading-memory:library:context', (_event, input) =>
    library.context(input),
  );
  handleReadingMemoryIpc('reading-memory:library:search', (event, input) =>
    library.search(event.sender, input),
  );
  handleReadingMemoryIpc('reading-memory:library:answer', (event, input) =>
    library.answer(event.sender.id, input.requestId),
  );
  handleReadingMemoryIpc('reading-memory:library:cancel', (event, input) =>
    library.cancel(event.sender.id, input.requestId),
  );
  handleReadingMemoryIpc('reading-memory:relations:search', (event, input) =>
    relations.search(event.sender, input),
  );
  handleReadingMemoryIpc('reading-memory:relations:judge', (event, input) =>
    relations.judge(event.sender.id, input.requestId),
  );
  handleReadingMemoryIpc('reading-memory:relations:cancel', (event, input) =>
    relations.cancel(event.sender.id, input.requestId),
  );
  handleReadingMemoryIpc('reading-memory:confirm-privacy', () => relations.confirmPrivacy());
  handleReadingMemoryIpc('reading-memory:model:status', () => controls.status());
  handleReadingMemoryIpc('reading-memory:model:download', () => controls.download());
  handleReadingMemoryIpc('reading-memory:model:cancel', () => controls.cancel());
  handleReadingMemoryIpc('reading-memory:model:remove', () => controls.remove());
  handleReadingMemoryIpc('reading-memory:index:pause', () => controls.pause());
  handleReadingMemoryIpc('reading-memory:index:resume', () => controls.resume());
  handleReadingMemoryIpc('reading-memory:index:rebuild', () => controls.rebuild());
}
