export function sortByCreatedAt<T extends { createdAt: string }>(items: T[]) {
  return [...items].toSorted(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
}

export function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function normalizeNonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

export function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function recordValue(value: object): Record<string, unknown> {
  return Object.entries(value).reduce<Record<string, unknown>>((record, [key, entryValue]) => {
    record[key] = entryValue;
    return record;
  }, {});
}

export function normalizePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function normalizeFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
