import { describe, expect, it } from 'vitest';
import { digestBytes } from './content-digest.ts';
import { loadReadingMemoryReleasePlan } from './model-release.ts';

describe('reading memory release plan', () => {
  it('derives the first-party distribution from the selected model and legal files', async () => {
    const plan = await loadReadingMemoryReleasePlan();
    const artifacts = plan.objects.filter((object) => object.source.type === 'remote');
    const legalFiles = plan.objects.filter((object) => object.source.type === 'local');

    expect(plan.internalId).toBe('reading-memory-embedding-v1');
    expect(artifacts).toHaveLength(5);
    expect(legalFiles.map((object) => object.path)).toEqual([
      'NOTICE',
      'GEMMA_TERMS_OF_USE.txt',
      'MODIFICATIONS',
    ]);
    expect(
      plan.objects.every((object) =>
        object.key.startsWith(`${plan.internalId}/objects/sha256/${object.sha256}/`),
      ),
    ).toBe(true);
  });

  it('publishes the checked manifest bytes at the fixed version path', async () => {
    const plan = await loadReadingMemoryReleasePlan();

    expect(plan.manifest.key).toBe('reading-memory-embedding-v1/manifest.json');
    expect(plan.manifest.source.type).toBe('bytes');
    if (plan.manifest.source.type !== 'bytes') throw new Error('Expected manifest bytes');
    expect(digestBytes(plan.manifest.source.bytes)).toMatchObject({
      sizeBytes: plan.manifest.sizeBytes,
      sha256: plan.manifest.sha256,
    });
    expect(JSON.parse(new TextDecoder().decode(plan.manifest.source.bytes))).toMatchObject({
      schemaVersion: 1,
      internalId: plan.internalId,
      distributionDownloadSizeBytes: 218_736_459,
    });
  });
});
