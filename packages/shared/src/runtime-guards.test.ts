import { describe, expect, it } from 'vitest';
import {
  errorMessage,
  errorMessageOrFallback,
  finiteNumberField,
  finiteNumberFieldOrZero,
  isRecord,
  numberField,
  recordField,
  stringField,
  trimmedStringField,
  uniqueNonEmptyStrings,
  uniqueStrings,
  uniqueTrimmedStrings,
} from './runtime-guards';

describe('runtime guards', () => {
  it('accepts object records but rejects arrays and null', () => {
    expect(isRecord({ id: 'article_1' })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(recordField({ id: 'article_1' }, 'id')).toBe('article_1');
    expect(recordField([], 'id')).toBeUndefined();
  });

  it('keeps raw and trimmed string semantics explicit', () => {
    expect(stringField('  text  ')).toBe('  text  ');
    expect(trimmedStringField('  text  ')).toBe('text');
    expect(stringField(null)).toBe('');
  });

  it('keeps number validation and fallback semantics explicit', () => {
    expect(numberField(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(finiteNumberField(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(finiteNumberField(4.5)).toBe(4.5);
    expect(finiteNumberFieldOrZero('4.5')).toBe(0);
  });

  it('keeps stable deduplication policies explicit', () => {
    expect(uniqueStrings(['', 'a', '', 'a'])).toEqual(['', 'a']);
    expect(uniqueNonEmptyStrings(['', 'a', null, ' a ', 'a'])).toEqual(['a', ' a ']);
    expect(uniqueTrimmedStrings(['', 'a', undefined, ' a ', 'b'])).toEqual(['a', 'b']);
  });

  it('uses fallback text for empty user-facing error messages', () => {
    expect(errorMessage(new Error(''))).toBe('');
    expect(errorMessage('provider_failed')).toBe('provider_failed');
    expect(errorMessageOrFallback(new Error(''), '操作失败')).toBe('操作失败');
    expect(errorMessageOrFallback(new Error('详细错误'), '操作失败')).toBe('详细错误');
    expect(errorMessageOrFallback('provider_failed', '操作失败')).toBe('操作失败');
  });
});
