import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { logError } from '../app/logger';
import { getDatabase, type StoreDatabase, type StoreExecutor } from '../store/store-db';
import { deleteStoredSecret } from './provider-secrets';

let recovery: { database: StoreDatabase; promise: Promise<void> } | undefined;

export function queueSecretDeletion(database: StoreExecutor, secretRef: string) {
  database
    .insert(schema.secretDeletionTasks)
    .values({ secretRef, createdAt: new Date().toISOString() })
    .onConflictDoNothing()
    .run();
}

export function cancelSecretDeletion(database: StoreExecutor, secretRef: string) {
  database
    .delete(schema.secretDeletionTasks)
    .where(eq(schema.secretDeletionTasks.secretRef, secretRef))
    .run();
}

export async function completeSecretDeletion(secretRef: string) {
  await deleteStoredSecret(secretRef);
  getDatabase()
    .delete(schema.secretDeletionTasks)
    .where(eq(schema.secretDeletionTasks.secretRef, secretRef))
    .run();
}

export function recoverPendingSecretDeletions() {
  const database = getDatabase();
  if (recovery?.database === database) return recovery.promise;

  const promise = recoverSecretDeletions(database);
  recovery = { database, promise };
  return promise;
}

export function resetSecretDeletionRecovery() {
  recovery = undefined;
}

async function recoverSecretDeletions(database: StoreDatabase) {
  const pending = database.select().from(schema.secretDeletionTasks).all();
  for (const task of pending) {
    try {
      await completeSecretDeletion(task.secretRef);
    } catch (error) {
      logError('secret_deletion.recovery_failed', error, { secretRef: task.secretRef });
    }
  }
}
