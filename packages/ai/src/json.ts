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

function cleanJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}
