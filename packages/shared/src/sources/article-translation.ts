export function normalizeArticleTranslationTargetLanguage(value?: string) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'en' || normalized === 'english') return 'English';
  if (normalized === 'ja' || normalized === 'japanese' || normalized === '日本語') return '日本語';
  return '简体中文';
}
