import { closeDatabase as closeStoreDatabase } from './store-db';
import { resetProviderApiKeyMigration } from './store-provider-key-migration';
import { resetAnnotationMemoryBackfill } from './store-reading-memory-lifecycle';

export function closeDatabase() {
  closeStoreDatabase();
  resetProviderApiKeyMigration();
  resetAnnotationMemoryBackfill();
}
