import type { LibraryPageSize } from './library-query-session';

type SavePageSize = () => Promise<void> | void;

class LibraryPageSizePersistenceCoordinator {
  #confirmedPageSize: LibraryPageSize = 12;
  #latestGeneration = 0;
  #settledGeneration = 0;
  #queue: Promise<void> = Promise.resolve();

  observeConfirmed(pageSize: LibraryPageSize) {
    this.#confirmedPageSize = pageSize;
  }

  hasPendingSave() {
    return this.#latestGeneration > this.#settledGeneration;
  }

  enqueue(
    pageSize: LibraryPageSize,
    save: SavePageSize,
    onLatestFailure: (confirmedPageSize: LibraryPageSize) => void,
  ) {
    const generation = this.#latestGeneration + 1;
    this.#latestGeneration = generation;
    this.#queue = this.#queue
      .then(async () => {
        try {
          await save();
          this.#confirmedPageSize = pageSize;
        } catch {
          if (generation === this.#latestGeneration) onLatestFailure(this.#confirmedPageSize);
        } finally {
          this.#settledGeneration = Math.max(this.#settledGeneration, generation);
        }
      })
      .catch(() => undefined);
  }
}

export const libraryPageSizePersistence = new LibraryPageSizePersistenceCoordinator();
