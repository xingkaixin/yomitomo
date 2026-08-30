import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { digestBytes } from './content-digest.ts';
import {
  publishReadingMemoryModel,
  type ImmutableObjectStore,
  type ObjectCreation,
} from './model-publication.ts';
import type { ReadingMemoryReleasePlan, ReleaseObjectSpec } from './model-release.ts';

describe('model publication', () => {
  it('does not create any object when a source fails validation', async () => {
    const valid = releaseObject('valid.bin', 'valid');
    const invalid = releaseObject('invalid.bin', 'expected', {
      type: 'remote',
      url: 'https://example.com/invalid.bin',
    });
    const store = new MemoryObjectStore();
    const fetch = vi.fn(async () => new Response('differnt'));

    await expect(
      publishReadingMemoryModel(releasePlan([valid, invalid]), store, { fetch }),
    ).rejects.toThrow('invalid.bin SHA-256 mismatch');

    expect(store.events).toEqual([]);
    expect(fetch).toHaveBeenCalledWith('https://example.com/invalid.bin', {
      headers: { 'Accept-Encoding': 'identity' },
    });
  });

  it('validates decoded response bytes when an origin returns encoded content', async () => {
    const object = releaseObject('remote.bin', 'expected', {
      type: 'remote',
      url: 'https://example.com/remote.bin',
    });
    const store = new MemoryObjectStore();
    const fetch = vi.fn(
      async () =>
        new Response('expected', {
          headers: { 'Content-Encoding': 'gzip', 'Content-Length': '4' },
        }),
    );

    await expect(
      publishReadingMemoryModel(releasePlan([object]), store, { fetch }),
    ).resolves.toEqual({ created: 2, verified: 2 });
  });

  it('creates and verifies every immutable object before the manifest', async () => {
    const first = releaseObject('first.bin', 'first');
    const second = releaseObject('second.bin', 'second');
    const plan = releasePlan([first, second]);
    const store = new MemoryObjectStore();

    const result = await publishReadingMemoryModel(plan, store);

    expect(result).toEqual({ created: 3, verified: 3 });
    const manifestCreation = store.events.indexOf(`create:${plan.manifest.key}`);
    expect(manifestCreation).toBeGreaterThan(store.events.lastIndexOf(`read:${first.key}`));
    expect(manifestCreation).toBeGreaterThan(store.events.lastIndexOf(`read:${second.key}`));
  });

  it('rejects different stored content without overwriting it or publishing the manifest', async () => {
    const object = releaseObject('asset.bin', 'asset');
    const plan = releasePlan([object]);
    const store = new MemoryObjectStore();
    store.seed(object.key, 'other', object.sha256);

    await expect(publishReadingMemoryModel(plan, store)).rejects.toThrow(
      'asset.bin stored content SHA-256 mismatch',
    );

    expect(store.events).not.toContain(`create:${object.key}`);
    expect(store.events).not.toContain(`create:${plan.manifest.key}`);
    expect(new TextDecoder().decode(store.content(object.key))).toBe('other');
  });

  it('rejects an existing object with the wrong content type', async () => {
    const object = releaseObject('asset.bin', 'asset');
    const plan = releasePlan([object]);
    const store = new MemoryObjectStore();
    store.seed(object.key, 'asset', object.sha256, 'text/plain');

    await expect(publishReadingMemoryModel(plan, store)).rejects.toThrow(
      'asset.bin stored content type does not match the release contract',
    );

    expect(store.events).not.toContain(`create:${plan.manifest.key}`);
  });

  it('rejects an existing encoded object', async () => {
    const object = releaseObject('asset.bin', 'asset');
    const plan = releasePlan([object]);
    const store = new MemoryObjectStore();
    store.seed(object.key, 'asset', object.sha256, object.contentType, 'gzip');

    await expect(publishReadingMemoryModel(plan, store)).rejects.toThrow(
      'asset.bin stored content encoding does not match the release contract',
    );

    expect(store.events).not.toContain(`create:${plan.manifest.key}`);
  });

  it('accepts identical content created by a concurrent publisher', async () => {
    const object = releaseObject('asset.bin', 'asset');
    const plan = releasePlan([object]);
    const store = new MemoryObjectStore();
    store.raceOnCreate('asset', object.sha256, object.contentType);

    await expect(publishReadingMemoryModel(plan, store)).resolves.toEqual({
      created: 1,
      verified: 2,
    });

    expect(store.events).toContain(`create:${plan.manifest.key}`);
  });

  it('rejects different content created during a conditional write race', async () => {
    const object = releaseObject('asset.bin', 'asset');
    const plan = releasePlan([object]);
    const store = new MemoryObjectStore();
    store.raceOnCreate('other', object.sha256, object.contentType);

    await expect(publishReadingMemoryModel(plan, store)).rejects.toThrow(
      'asset.bin stored content SHA-256 mismatch',
    );

    expect(store.events).not.toContain(`create:${plan.manifest.key}`);
    expect(new TextDecoder().decode(store.content(object.key))).toBe('other');
  });

  it('treats a repeated identical publication as an idempotent verification', async () => {
    const plan = releasePlan([releaseObject('asset.bin', 'asset')]);
    const store = new MemoryObjectStore();

    await expect(publishReadingMemoryModel(plan, store)).resolves.toEqual({
      created: 2,
      verified: 2,
    });
    store.events.length = 0;
    await expect(publishReadingMemoryModel(plan, store)).resolves.toEqual({
      created: 0,
      verified: 2,
    });

    expect(store.events.every((event) => !event.startsWith('create:'))).toBe(true);
  });
});

class MemoryObjectStore implements ImmutableObjectStore {
  readonly events: string[] = [];
  private readonly objects = new Map<
    string,
    { bytes: Uint8Array; sha256: string; contentType: string; contentEncoding?: string }
  >();
  private pendingRace?: { bytes: Uint8Array; sha256: string; contentType: string };

  async inspect(key: string) {
    this.events.push(`inspect:${key}`);
    const object = this.objects.get(key);
    return object
      ? {
          sizeBytes: object.bytes.byteLength,
          sha256: object.sha256,
          contentType: object.contentType,
          contentEncoding: object.contentEncoding,
        }
      : null;
  }

  async create(input: ObjectCreation): Promise<'created' | 'exists'> {
    this.events.push(`create:${input.key}`);
    if (this.objects.has(input.key)) return 'exists';
    if (this.pendingRace) {
      this.objects.set(input.key, this.pendingRace);
      this.pendingRace = undefined;
      return 'exists';
    }
    this.objects.set(input.key, {
      bytes: await readFile(input.filePath),
      sha256: input.sha256,
      contentType: input.contentType,
    });
    return 'created';
  }

  async read(key: string) {
    this.events.push(`read:${key}`);
    const object = this.objects.get(key);
    if (!object) throw new Error(`${key} is missing`);
    return asyncBytes(object.bytes);
  }

  seed(
    key: string,
    content: string,
    sha256: string,
    contentType = 'application/octet-stream',
    contentEncoding?: string,
  ) {
    this.objects.set(key, {
      bytes: new TextEncoder().encode(content),
      sha256,
      contentType,
      contentEncoding,
    });
  }

  raceOnCreate(content: string, sha256: string, contentType: string) {
    this.pendingRace = {
      bytes: new TextEncoder().encode(content),
      sha256,
      contentType,
    };
  }

  content(key: string) {
    const object = this.objects.get(key);
    if (!object) throw new Error(`${key} is missing`);
    return object.bytes;
  }
}

async function* asyncBytes(bytes: Uint8Array) {
  yield bytes;
}

function releaseObject(
  path: string,
  content: string,
  source: ReleaseObjectSpec['source'] = {
    type: 'bytes',
    bytes: new TextEncoder().encode(content),
  },
): ReleaseObjectSpec {
  const bytes = new TextEncoder().encode(content);
  const digest = digestBytes(bytes);
  return {
    path,
    key: `release/objects/${digest.sha256}/${path}`,
    sizeBytes: digest.sizeBytes,
    sha256: digest.sha256,
    contentType: 'application/octet-stream',
    source,
  };
}

function releasePlan(objects: ReleaseObjectSpec[]): ReadingMemoryReleasePlan {
  const manifest = releaseObject('manifest.json', JSON.stringify({ version: 1 }));
  return { internalId: 'release', objects, manifest };
}
