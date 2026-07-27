export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

export function stringField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function trimmedStringField(value: unknown) {
  return stringField(value).trim();
}

export function numberField(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

export function finiteNumberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function finiteNumberFieldOrZero(value: unknown) {
  return finiteNumberField(value) ?? 0;
}

export function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values));
}

export function uniqueNonEmptyStrings(values: readonly (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function uniqueTrimmedStrings(values: readonly (string | null | undefined)[]) {
  const uniqueValues = new Set<string>();
  for (const value of values) {
    const trimmedValue = value?.trim();
    if (trimmedValue) uniqueValues.add(trimmedValue);
  }
  return Array.from(uniqueValues);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function errorMessageOrFallback(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
