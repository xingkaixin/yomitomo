export function openAIBaseUrl(baseUrl: string) {
  const base = trimSlash(baseUrl);
  return /\/v\d+(?:beta)?$/.test(base) ? base : `${base}/v1`;
}

export function anthropicBaseUrl(baseUrl: string) {
  const base = trimSlash(baseUrl);
  return /\/v\d+$/.test(base) ? base : `${base}/v1`;
}

export function geminiBaseUrl(baseUrl: string) {
  const base = trimSlash(baseUrl).replace(/\/v1beta$/, '');
  return `${base}/v1beta`;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}
