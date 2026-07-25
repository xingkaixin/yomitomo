import { closeDatabase as closeStoreDatabase } from './store-db';
import { resetProviderApiKeyMigration } from './store-provider-key-migration';
import { resetAnnotationMemoryBackfill } from './store-reading-memory-lifecycle';
import { resetSecretDeletionRecovery } from '../providers/secret-deletion-repository';
import { resetArticleSourceCleanupRecovery } from '../articles/article-source-cleanup';

export function closeDatabase() {
  closeStoreDatabase();
  resetProviderApiKeyMigration();
  resetAnnotationMemoryBackfill();
  resetSecretDeletionRecovery();
  resetArticleSourceCleanupRecovery();
}
