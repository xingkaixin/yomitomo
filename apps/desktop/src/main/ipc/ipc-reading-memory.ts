import type { ReadingMemoryControls } from '../reading-memory/reading-memory-controls';
import type { ReadingRelationsRuntime } from '../reading-memory/reading-relations-runtime';
import type { ReadingLibraryRuntime } from '../reading-memory/reading-library-runtime';
import { handleDesktopIpc } from './ipc';

type ReadingMemoryIpcContext = {
  relations: ReadingRelationsRuntime;
  library: ReadingLibraryRuntime;
  controls: ReadingMemoryControls;
};

export function registerReadingMemoryIpc({
  relations,
  library,
  controls,
}: ReadingMemoryIpcContext) {
  handleDesktopIpc('reading-memory:library:context', (_event, input) => library.context(input));
  handleDesktopIpc('reading-memory:library:search', (event, input) =>
    library.search(event.sender, input),
  );
  handleDesktopIpc('reading-memory:library:answer', (event, input) =>
    library.answer(event.sender.id, input.requestId),
  );
  handleDesktopIpc('reading-memory:library:cancel', (event, input) =>
    library.cancel(event.sender.id, input.requestId),
  );
  handleDesktopIpc('reading-memory:relations:search', (event, input) =>
    relations.search(event.sender, input),
  );
  handleDesktopIpc('reading-memory:relations:judge', (event, input) =>
    relations.judge(event.sender.id, input.requestId),
  );
  handleDesktopIpc('reading-memory:relations:cancel', (event, input) =>
    relations.cancel(event.sender.id, input.requestId),
  );
  handleDesktopIpc('reading-memory:confirm-privacy', () => relations.confirmPrivacy());
  handleDesktopIpc('reading-memory:model:status', () => controls.status());
  handleDesktopIpc('reading-memory:model:download', () => controls.download());
  handleDesktopIpc('reading-memory:model:cancel', () => controls.cancel());
  handleDesktopIpc('reading-memory:model:remove', () => controls.remove());
  handleDesktopIpc('reading-memory:index:pause', () => controls.pause());
  handleDesktopIpc('reading-memory:index:resume', () => controls.resume());
  handleDesktopIpc('reading-memory:index:rebuild', () => controls.rebuild());
}
