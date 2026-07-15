import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { logError } from '../app/logger';
import { getDatabase, type StoreExecutor } from '../store/store-db';
import { deleteStoredSecret } from './provider-secrets';

let recoveryPromise: Promise<void> | undefined;

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
  recoveryPromise ||= recoverSecretDeletions();
  return recoveryPromise;
}

export function resetSecretDeletionRecovery() {
  recoveryPromise = undefined;
}

async function recoverSecretDeletions() {
  const pending = getDatabase().select().from(schema.secretDeletionTasks).all();
  for (const task of pending) {
    try {
      await completeSecretDeletion(task.secretRef);
    } catch (error) {
      logError('secret_deletion.recovery_failed', error, { secretRef: task.secretRef });
    }
  }
}
