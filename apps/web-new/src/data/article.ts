export type Comment = {
  id: string;
  author: {
    name: string;
    initials: string;
    color: string;
    isAgent?: boolean;
  };
  content: string;
};

export type AnnotationType = 'note' | 'discussion' | 'distillation';

export type Annotation = {
  id: string;
  quote: string;
  author: {
    name: string;
    initials: string;
    color: string;
  };
  content: string;
  type: AnnotationType;
  comments?: Comment[];
  createdAt: string;
};

export type Segment =
  | { type: 'text'; content: string }
  | { type: 'highlight'; content: string; annotationId: string };

export type Paragraph = {
  id: string;
  segments: Segment[];
};

export const annotations: Annotation[] = [
  {
    id: 'ann-1',
    quote: '什么都没留下',
    author: { name: 'Yomitomo', initials: 'Y', color: '#a43f37' },
    content:
      '这个想法，就是我们做 Yomitomo 的起点。我们观察到大多数阅读工具帮你「保存」文章，却很少帮你「保存」你真正想了什么。',
    type: 'note',
    createdAt: '2025-01-15',
  },
  {
    id: 'ann-2',
    quote: '本地优先',
    author: { name: 'Yomitomo', initials: 'Y', color: '#a43f37' },
    content:
      '本地优先意味着你的文章、批注、讨论，全部保存在你的电脑上。我们不会上传你的阅读数据到任何云端。API Key 使用系统 keyring 保存。',
    type: 'note',
    createdAt: '2025-01-15',
  },
  {
    id: 'ann-3',
    quote: '在让你停下来的段落划一条线',
    author: { name: '阅读助手', initials: '阅', color: '#4a7c59' },
    content: '',
    type: 'discussion',
    comments: [
      {
        id: 'c1',
        author: { name: '你', initials: '你', color: '#a43f37' },
        content: '为什么「划线」比其他标记方式更好？',
      },
      {
        id: 'c2',
        author: { name: '阅读助手', initials: '阅', color: '#4a7c59', isAgent: true },
        content:
          '划线把判断锚定在原文的具体位置上。高亮块容易变成视觉噪音，而一条精确的线让你回到「这句话让我停下来的那一刻」。',
      },
    ],
    createdAt: '2025-01-15',
  },
  {
    id: 'ann-4',
    quote: '多个想法、回复和助手评论',
    author: { name: '审阅助手', initials: '审', color: '#5a6d8a' },
    content: '',
    type: 'discussion',
    comments: [
      {
        id: 'c3',
        author: { name: '你', initials: '你', color: '#a43f37' },
        content: '这里说「持续生长」是什么意思？',
      },
      {
        id: 'c4',
        author: { name: '审阅助手', initials: '审', color: '#5a6d8a', isAgent: true },
        content:
          '你今天写下一个疑问，下周读到一个相关的段落，可以回到原来的划线追加新的联想。助手也可以在任何时候加入讨论。',
      },
      {
        id: 'c5',
        author: { name: '你', initials: '你', color: '#a43f37' },
        content: '那会不会变得很乱？',
      },
      {
        id: 'c6',
        author: { name: '审阅助手', initials: '审', color: '#5a6d8a', isAgent: true },
        content: '不会。你可以随时把讨论沉淀成一段清晰的总结，像下面这样。',
      },
    ],
    createdAt: '2025-01-15',
  },
  {
    id: 'ann-5',
    quote: '可保留的沉淀',
    author: { name: '沉淀', initials: '沉', color: '#b8860b' },
    content:
      '沉淀不是替代原文，而是你对原文的判断的结晶。它保留了回到证据现场的路径，同时把分散的讨论收敛成一段清晰的结论。当你三个月后重读这篇文章，沉淀卡片会让你瞬间恢复当时的思考脉络。',
    type: 'distillation',
    createdAt: '2025-01-15',
  },
];

export const paragraphs: Paragraph[] = [
  {
    id: 'p1',
    segments: [
      { type: 'text', content: '我们读了那么多，最后' },
      { type: 'highlight', content: '什么都没留下', annotationId: 'ann-1' },
      {
        type: 'text',
        content:
          '。收藏夹越来越满，稍后读队列越来越长，但真正沉淀下来的判断却少得可怜。',
      },
    ],
  },
  {
    id: 'p2',
    segments: [
      { type: 'highlight', content: 'Yomitomo', annotationId: 'ann-2' },
      { type: 'text', content: ' 是一款' },
      { type: 'highlight', content: '本地优先', annotationId: 'ann-2' },
      {
        type: 'text',
        content:
          ' 的 AI 伴读桌面应用。它不是又一个云端阅读器，而是你电脑上的一个阅读工作台。',
      },
    ],
  },
  {
    id: 'p3',
    segments: [
      { type: 'text', content: '在阅读中，' },
      {
        type: 'highlight',
        content: '在让你停下来的段落划一条线',
        annotationId: 'ann-3',
      },
      {
        type: 'text',
        content:
          '。这条线不是装饰，而是证据锚点。当你三个月后回来看时，你能立刻回到当时的上下文。',
      },
    ],
  },
  {
    id: 'p4',
    segments: [
      { type: 'text', content: '一条划线的下方可以挂' },
      {
        type: 'highlight',
        content: '多个想法、回复和助手评论',
        annotationId: 'ann-4',
      },
      {
        type: 'text',
        content:
          '。它不是一条静态的笔记，而是一个可以持续生长的讨论现场。',
      },
    ],
  },
  {
    id: 'p5',
    segments: [
      { type: 'text', content: '当讨论足够丰富时，你可以把它们整理成一段' },
      { type: 'highlight', content: '可保留的沉淀', annotationId: 'ann-5' },
      {
        type: 'text',
        content: '。沉淀不是替代原文，而是你对原文的判断的结晶。',
      },
    ],
  },
  {
    id: 'p6',
    segments: [
      {
        type: 'text',
        content:
          'Yomitomo 完全免费、开源，你的数据永远在你自己的电脑上。支持网页文章、PDF、EPUB 和微信读书同步。',
      },
    ],
  },
];

export const articleMeta = {
  title: '关于 Yomitomo',
  byline: 'Yomitomo Team',
  date: '2025年1月15日',
  readingTime: '3 分钟',
};
