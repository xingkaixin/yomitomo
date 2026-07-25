import { randomUUID } from 'node:crypto';
import { logError } from '../app/logger';
import { getDatabase, type StoreExecutor } from '../store/store-db';
import {
  cancelSecretDeletion,
  completeSecretDeletion,
  queueSecretDeletion,
} from './secret-deletion-repository';
import { deleteStoredSecret, saveStoredSecret } from './provider-secrets';

export type PreparedCredentialChange = {
  apiKeyRef?: string;
  preparedSecretRef?: string;
  secretRefToDelete?: string;
};

type PrepareCredentialChangeInput = {
  currentRef?: string;
  defaultRef: string;
  remove?: boolean;
  secret?: string;
};

export async function prepareCredentialChange(
  input: PrepareCredentialChangeInput,
): Promise<PreparedCredentialChange> {
  const secret = input.secret?.trim();
  if (secret) {
    const preparedSecretRef = `${input.defaultRef}:version:${randomUUID()}`;
    await saveStoredSecret(preparedSecretRef, secret);
    return {
      apiKeyRef: preparedSecretRef,
      preparedSecretRef,
      secretRefToDelete: input.currentRef,
    };
  }

  if (input.remove) {
    return { secretRefToDelete: input.currentRef || input.defaultRef };
  }

  return { apiKeyRef: input.currentRef };
}

export function commitCredentialChange(database: StoreExecutor, change: PreparedCredentialChange) {
  if (change.secretRefToDelete) queueSecretDeletion(database, change.secretRefToDelete);
  if (change.apiKeyRef) cancelSecretDeletion(database, change.apiKeyRef);
}

export async function abortCredentialChange(change: PreparedCredentialChange) {
  if (!change.preparedSecretRef) return;

  try {
    await deleteStoredSecret(change.preparedSecretRef);
  } catch (error) {
    queueSecretDeletion(getDatabase(), change.preparedSecretRef);
    logError('credential_swap.abort_cleanup_deferred', error, {
      secretRef: change.preparedSecretRef,
    });
  }
}

export async function completeCredentialChange(change: PreparedCredentialChange) {
  if (change.secretRefToDelete) await completeSecretDeletion(change.secretRefToDelete);
}
