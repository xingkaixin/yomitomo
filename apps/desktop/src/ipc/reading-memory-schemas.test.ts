import { describe, expect, it } from 'vitest';
import { readingMemoryIpcInvokeSchemas } from './reading-memory-schemas';

it('accepts only supported model download sources over IPC', () => {
  const schema = readingMemoryIpcInvokeSchemas['reading-memory:model:download'];
  expect(schema.parse(['modelscope'])).toEqual(['modelscope']);
  expect(schema.parse(['huggingface'])).toEqual(['huggingface']);
  for (const input of [
    [],
    ['unknown'],
    ['https://example.com/model'],
    ['modelscope', 'huggingface'],
  ]) {
    expect(schema.safeParse(input).success).toBe(false);
  }
});

describe('reading memory usage IPC', () => {
  it('accepts only a single closed interaction key without content or review decisions', () => {
    const schema = readingMemoryIpcInvokeSchemas['reading-memory:record-usage'];
    expect(schema.parse(['source_jump'])).toEqual(['source_jump']);
    for (const input of [
      [],
      ['unknown'],
      ['review_changed'],
      ['source_jump', { articleId: 'private-id' }],
      [{ key: 'query_completed', question: 'private question' }],
      [{ counts: { query_completed: 1 } }],
    ]) {
      expect(schema.safeParse(input).success).toBe(false);
    }
  });
});
