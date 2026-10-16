export function parseJsonObject(
  value: string,
  parseFailureMessage = 'AI_JSON_OBJECT_PARSE_FAILED',
): Record<string, unknown> {
  const cleaned = cleanJsonFence(value);
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    throw new Error(parseFailureMessage);
  }
}

export function parseJsonArray(value: string): unknown[] {
  const cleaned = cleanJsonFence(value);
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    }
    throw new Error('AI_JSON_ARRAY_PARSE_FAILED');
  }
}

export function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

export function stringArray(value: unknown, maxItemLength = 500) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text ? [text.slice(0, maxItemLength)] : [];
      })
    : [];
}

export function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];
}

function cleanJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}
