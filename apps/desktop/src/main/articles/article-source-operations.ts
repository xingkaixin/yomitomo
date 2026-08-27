const pendingOperations = new Map<string, Promise<void>>();

export async function withArticleSourceOperation<T>(articleId: string, run: () => Promise<T>) {
  const previous = pendingOperations.get(articleId) || Promise.resolve();
  const result = previous.then(run);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  pendingOperations.set(articleId, settled);
  try {
    return await result;
  } finally {
    if (pendingOperations.get(articleId) === settled) pendingOperations.delete(articleId);
  }
}
