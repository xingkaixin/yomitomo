export type FaqItem = {
  question: string;
  answer: string;
};

const zhFaq: FaqItem[] = [
  {
    question: 'Yomitomo 是什么？',
    answer:
      'Yomitomo 是一款本地优先的 AI 伴读桌面应用，支持 macOS 和 Windows。你可以在原文上划线、记录想法、和 AI 助手讨论，把阅读判断锚定在原文现场，所有数据都保存在本地。',
  },
  {
    question: 'Yomitomo 支持哪些阅读来源？',
    answer:
      'Yomitomo 支持网页文章、PDF、EPUB 和微信读书四类来源。不同来源的内容、划线和讨论都汇集在同一个工作台，同步过来的笔记会保留原文锚点。',
  },
  {
    question: '我的阅读数据会上传到云端吗？',
    answer:
      '不会。文章、批注、讨论和 API Key 全部保存在你自己的电脑上，Yomitomo 不会把任何阅读数据上传到云端。',
  },
  {
    question: 'Yomitomo 收费吗？',
    answer:
      '不收费。Yomitomo 完全免费，并在 MIT 协议下开源。它不向你推送内容，不替你排序，也不出售你的阅读数据。',
  },
  {
    question: 'AI 伴读会替我做阅读判断吗？',
    answer:
      '不会。Yomitomo 提供六位 AI 伴读，分别负责提问、追根、翻译和编辑，它们陪你一起读，但最终的判断始终留给你自己。',
  },
  {
    question: '使用 Yomitomo 需要配置 API Key 吗？',
    answer:
      '需要。AI 功能依赖你自己的大模型 API Key，配置后会安全保存在本地系统中，仅用于在你的设备上调用 AI 助手。',
  },
];

const enFaq: FaqItem[] = [
  {
    question: 'What is Yomitomo?',
    answer:
      'Yomitomo is a local-first AI reading companion for macOS and Windows. You highlight text, capture thoughts, and discuss with AI assistants—keeping every reading judgment anchored to the source, with all data stored locally.',
  },
  {
    question: 'What sources does Yomitomo support?',
    answer:
      'Yomitomo supports web articles, PDF, EPUB, and WeRead. Content, highlights, and discussions from every source land on one workbench, and synced notes keep their original anchors.',
  },
  {
    question: 'Is my reading data uploaded to the cloud?',
    answer:
      'No. Your articles, annotations, discussions, and API keys all stay on your own computer. Yomitomo never uploads any of your reading data to the cloud.',
  },
  {
    question: 'Is Yomitomo free?',
    answer:
      'Yes. Yomitomo is completely free and open source under the MIT license. It never pushes content, never reorders your reading, and never sells your data.',
  },
  {
    question: 'Do the AI companions read for me?',
    answer:
      'No. Yomitomo offers six AI companions that question, dig deeper, translate, and edit. They read with you, but the final judgment always stays yours.',
  },
  {
    question: 'Do I need an API key to use Yomitomo?',
    answer:
      'Yes. AI features use your own LLM API key, which is stored securely on your local system and used only to call AI assistants on your device.',
  },
];

export function getFaqItems(lang: 'zh-CN' | 'en'): FaqItem[] {
  return lang === 'en' ? enFaq : zhFaq;
}
