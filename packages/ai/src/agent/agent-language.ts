import { normalizeUiLanguage, type UiLanguage } from '@yomitomo/shared';

const responseLanguageLabels: Record<UiLanguage, string> = {
  'zh-CN': '简体中文',
  en: 'English',
};

export function responseLanguageSystemPrompt(language: unknown) {
  const normalized = normalizeUiLanguage(language);
  return `\n\n回复语言：最终面向读者的自然语言内容必须使用${responseLanguageLabels[normalized]}。引用原文、用户名、助手名、代码、JSON 字段名和工具参数保持原样，不要为了语言设置翻译这些内容。`;
}

export function finalResponseLanguageReminder(language: unknown) {
  const normalized = normalizeUiLanguage(language);
  return `最终面向读者的自然语言内容必须使用${responseLanguageLabels[normalized]}；引用原文、用户名、助手名、代码、JSON 字段名和工具参数保持原样。`;
}
