export function extractJsonObjects(input: string): { objects: string[]; rest: string } {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let restStart = input.length;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (start < 0) {
      if (char === '{') {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        objects.push(input.slice(start, index + 1).trim());
        start = -1;
        restStart = index + 1;
      }
    }
  }

  return { objects, rest: input.slice(start >= 0 ? start : restStart) };
}

export function hasIncompleteJson(input: string) {
  return input
    .replace(/^```(?:json)?/m, '')
    .replace(/```$/m, '')
    .trim()
    .startsWith('{');
}

export function parseJsonObject(value: string): Record<string, unknown> {
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
    throw new Error('审稿结果不是有效 JSON');
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
    throw new Error('助手任务拆解结果不是有效 JSON');
  }
}

export function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function uniqueStrings(values: string[]) {
  return values.filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
}

export function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

export function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text ? [text.slice(0, 500)] : [];
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
