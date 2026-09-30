export type FaqItem = {
  question: string;
  answer: string;
};

const zhFaq: FaqItem[] = [
  {
    question: 'Yomitomo 是什么？',
    answer:
      'Yomitomo 是一款本地优先的 AI 伴读桌面应用，支持 macOS 和 Windows。你可以在原文上划线、记录想法、和 AI 助手讨论，把阅读判断锚定在原文现场，阅读数据保存在本地。',
  },
  {
    question: 'Yomitomo 支持哪些阅读来源？',
    answer:
      'Yomitomo 支持网页文章、PDF、EPUB 和微信读书四类来源。不同来源的内容、划线和讨论都汇集在同一个工作台，同步过来的笔记会保留原文锚点。',
  },
  {
    question: '我的阅读数据会上传到云端吗？',
    answer:
      '文章、批注与讨论保存在本机，API Key 由系统凭据库保管。使用远程 AI 时，相关内容会发送到你配置的模型端点。',
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
      '普通阅读和手动批注不需要。使用 AI 功能时，需配置模型供应商与任务路由；远程服务通常需要自己的 API Key，也可以连接本地模型。',
  },
];

const enFaq: FaqItem[] = [
  {
    question: 'What is Yomitomo?',
    answer:
      'Yomitomo is a local-first AI reading companion for macOS and Windows. You highlight text, capture thoughts, and discuss with AI assistants—keeping every reading judgment anchored to the source, with reading data stored locally.',
  },
  {
    question: 'What sources does Yomitomo support?',
    answer:
      'Yomitomo supports web articles, PDF, EPUB, and WeRead. Content, highlights, and discussions from every source land on one workbench, and synced notes keep their original anchors.',
  },
  {
    question: 'Is my reading data uploaded to the cloud?',
    answer:
      'Articles, annotations and discussions are stored locally, with API keys in the OS keystore. Remote AI requests send relevant content to your configured model endpoint.',
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
      'Reading and manual annotations do not require an API key. AI features require a configured provider and task routes. Remote services usually need your own API key; you can also connect a local model.',
  },
];

const jaFaq: FaqItem[] = [
  {
    question: 'Yomitomoとは何ですか？',
    answer:
      'YomitomoはmacOSとWindows向けのローカルファーストなAI読書パートナーです。原文に線を引き、考えを残し、AIアシスタントと対話しながら、読書の判断を根拠と結びつけてローカルに保存できます。',
  },
  {
    question: 'どの読書ソースに対応していますか？',
    answer:
      'Web記事、PDF、EPUB、微信読書に対応しています。異なるソースの本文、線、対話を一つのワークスペースに集め、同期したメモも原文の位置を保ちます。',
  },
  {
    question: '読書データはクラウドへ送信されますか？',
    answer:
      '記事、注釈、対話はローカルに保存し、APIキーはOSの資格情報ストアで管理します。リモートAIを使うと、関連する内容が設定したモデルの接続先へ送信されます。',
  },
  {
    question: 'Yomitomoは無料ですか？',
    answer:
      'はい。Yomitomoは完全無料で、MITライセンスのもとでオープンソースとして公開されています。コンテンツの押しつけや並べ替え、読書データの販売は行いません。',
  },
  {
    question: 'AI読書パートナーが代わりに判断しますか？',
    answer:
      'いいえ。六人のAI読書パートナーが問い、掘り下げ、翻訳し、編集しますが、最後の判断はいつもあなた自身に残ります。',
  },
  {
    question: 'Yomitomoを使うにはAPIキーが必要ですか？',
    answer:
      '読書と手動の注釈には不要です。AI機能にはプロバイダーとタスクルートの設定が必要です。リモートサービスには通常ご自身のAPIキーが必要ですが、ローカルモデルにも接続できます。',
  },
];

export function getFaqItems(lang: 'zh-CN' | 'en' | 'ja'): FaqItem[] {
  return lang === 'en' ? enFaq : lang === 'ja' ? jaFaq : zhFaq;
}
