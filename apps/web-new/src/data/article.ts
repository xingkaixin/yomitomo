/** A single comment in a discussion thread. */
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

/** A "thought" (idea) attached to an annotation. */
export type Thought = {
  id: string;
  author: {
    name: string;
    initials: string;
    color: string;
    isAgent?: boolean;
  };
  content: string;
  /** Discussion thread for this thought. */
  comments: Comment[];
};

/** A highlight annotation in the article. */
export type Annotation = {
  id: string;
  quote: string;
  author: {
    name: string;
    initials: string;
    color: string;
    isAgent?: boolean;
  };
  type: 'note' | 'discussion' | 'distillation';
  createdAt: string;
  /** Thoughts/ideas attached to this annotation. Shown in discussion modal. */
  thoughts: Thought[];
  /** Distillation content (only for distillation type). */
  content?: string;
};

export type Segment =
  | { type: 'text'; content: string }
  | { type: 'highlight'; content: string; annotationId: string };

export type Paragraph = {
  id: string;
  segments: Segment[];
};

// ── Authors ──────────────────────────────────────────

const yomitomo = { name: 'Yomitomo', initials: 'Y', color: '#a43f37' };
const reader = { name: '阅读助手', initials: '阅', color: '#4a7c59', isAgent: true };
const reviewer = { name: '审阅助手', initials: '审', color: '#5a6d8a', isAgent: true };
const you = { name: '你', initials: '你', color: '#a43f37' };

// ── Annotations ─────────────────────────────────────

export const annotations: Annotation[] = [
  {
    id: 'ann-1',
    quote: '什么都没留下',
    author: reader,
    content: '',
    type: 'discussion',
    createdAt: '2025-01-15',
    thoughts: [
      {
        id: 't1-1',
        author: you,
        content: '收藏夹越来越满，但真正记住的却越来越少。',
        comments: [
          {
            id: 't1-1-c1',
            author: reader,
            content:
              '收藏和记住之间差了一个「主动处理」的环节。Yomitomo 的划线不只是标记，而是让你在划下的瞬间就和原文建立了锚点。',
          },
        ],
      },
      {
        id: 't1-2',
        author: you,
        content: '怎么才能让读过的东西不白读？',
        comments: [
          {
            id: 't1-2-c1',
            author: reader,
            content:
              '关键是给每个判断一个回到原文的路径。划线是锚点，想法是判断，沉淀是结论。三层下来，三个月后你还能接上当时的思路。',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-2',
    quote: '本地优先',
    author: reviewer,
    content: '',
    type: 'discussion',
    createdAt: '2025-01-15',
    thoughts: [
      {
        id: 't2-1',
        author: you,
        content: '数据全在本地，会不会不方便同步？',
        comments: [
          {
            id: 't2-1-c1',
            author: reviewer,
            content:
              '本地优先不等于不用云。你的阅读数据存在本机，API Key 走系统 keyring，不经过我们的服务器。如果未来需要同步，可以按你的节奏来。',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-3',
    quote: '在让你停下来的段落划一条线',
    author: reader,
    content: '',
    type: 'discussion',
    createdAt: '2025-01-15',
    thoughts: [
      {
        id: 't3-1',
        author: you,
        content: '为什么是「停下来」才划线？不能整篇都划吗？',
        comments: [
          {
            id: 't3-1-c1',
            author: reader,
            content:
              '划线不是高亮，它是一个判断。整篇高亮等于没高亮。只有让你停下来的地方，才值得记录。所以划线本质上是你在对文本做判断。',
          },
        ],
      },
      {
        id: 't3-2',
        author: you,
        content: '划完线之后呢？光一条线能记住什么？',
        comments: [
          {
            id: 't3-2-c1',
            author: reader,
            content:
              '划线记住的是「位置」。你的判断可能当时很清晰，三个月后就模糊了。但只要划线还在，你就能回到原文重新接上。',
          },
          {
            id: 't3-2-c2',
            author: you,
            content: '所以划线更像是一个书签？',
          },
          {
            id: 't3-2-c3',
            author: reader,
            content:
              '比书签精确。书签标记的是页面，划线标记的是具体的段落和句子。加上旁边的批注卡片，你能同时看到原文和自己的判断。',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-4',
    quote: '多个想法、回复和助手评论',
    author: reviewer,
    content: '',
    type: 'discussion',
    createdAt: '2025-01-15',
    thoughts: [
      {
        id: 't4-1',
        author: you,
        content: '这里说「持续生长」是什么意思？',
        comments: [
          {
            id: 't4-1-c1',
            author: reviewer,
            content:
              '你今天写下一个疑问，下周读到一个相关的段落，可以回到原来的划线追加新的联想。助手也可以在任何时候加入讨论。',
          },
        ],
      },
      {
        id: 't4-2',
        author: you,
        content: '那会不会变得很乱？',
        comments: [
          {
            id: 't4-2-c1',
            author: reviewer,
            content:
              '不会。你可以随时把讨论沉淀成一段清晰的总结，像下面那张卡片一样。',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-5',
    quote: '可保留的沉淀',
    author: { name: '沉淀', initials: '沉', color: '#b8860b' },
    content: '',
    type: 'distillation',
    createdAt: '2025-01-15',
    thoughts: [],
  },
  // ── Product highlight distillations ──
  {
    id: 'ann-6',
    quote: '',
    author: yomitomo,
    content: '划线不是装饰，是判断。每一条线都锚定在原文的具体位置，三个月后你还能回到当时的上下文。',
    type: 'distillation',
    createdAt: '2025-01-15',
    thoughts: [],
  },
  {
    id: 'ann-7',
    quote: '',
    author: yomitomo,
    content: '你的文章、批注、讨论、API Key 全部保存在你的电脑上。我们不会上传你的阅读数据到任何云端。',
    type: 'distillation',
    createdAt: '2025-01-15',
    thoughts: [],
  },
];

// ── Article Paragraphs ───────────────────────────────

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
