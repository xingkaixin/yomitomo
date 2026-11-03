import { describe, expect, it } from 'vitest';
import {
  fileImportErrorMessage,
  runFileImportQueue,
} from '../reading-library/app-reading-library-imports';

describe('file import errors', () => {
  it('does not expose unknown internal error messages', () => {
    expect(fileImportErrorMessage(new Error('database path leaked'), 'fallback', fileKeyT)).toBe(
      'fallback',
    );
  });
});

describe('file import queue', () => {
  it('keeps selection order and runs an oversized file alone', async () => {
    const limits = { maxConcurrent: 3, maxInFlightBytes: 100 };
    const { finish, started, queue } = startQueue([10, 20, 80, 30, 200], limits);

    expect(started).toEqual([10, 20]);
    finish(20);
    await settle();
    expect(started).toEqual([10, 20, 80]);
    finish(10);
    await settle();
    expect(started).toEqual([10, 20, 80]);
    finish(80);
    await settle();
    expect(started).toEqual([10, 20, 80, 30]);
    finish(30);
    await settle();
    expect(started).toEqual([10, 20, 80, 30, 200]);
    finish(200);
    await queue;
  });
});

function startQueue(sizes: number[], limits: Parameters<typeof runFileImportQueue>[1]) {
  const started: number[] = [];
  const pending = new Map<number, () => void>();
  const queue = runFileImportQueue(
    sizes.map((size) => ({ file: { size } })),
    limits,
    ({ file }) => {
      started.push(file.size);
      return new Promise<void>((resolve) => pending.set(file.size, resolve));
    },
  );
  return { finish: (size: number) => pending.get(size)?.(), started, queue };
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve));
}

const fileKeyT = ((key: string) => key) as Parameters<typeof fileImportErrorMessage>[2];
