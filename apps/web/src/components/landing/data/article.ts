/** A single comment in a discussion thread. */
export type Comment = {
  id: string;
  authorId: string;
  content: string;
};

/** A "thought" (idea) attached to an annotation. */
export type Thought = {
  id: string;
  authorId: string;
  content: string;
  comments: Comment[];
};

/** A highlight annotation in the article. */
export type Annotation = {
  id: string;
  quote: string;
  authorId: string;
  type: 'discussion' | 'distillation';
  createdAt: string;
  agentIds: string[];
  thoughts: Thought[];
  content?: string;
  /** Distillation cards reuse an existing highlight id so the line can be drawn. */
  highlightId?: string;
};

export type Segment =
  | { type: 'text'; content: string }
  | { type: 'highlight'; content: string; annotationId: string };

export type Paragraph = {
  id: string;
  segments: Segment[];
};

export type Agent = {
  id: string;
  nickname: string;
  avatar: string;
  annotationColor: string;
};

export type LandingMeta = {
  title: string;
  byline: string;
  date: string;
  readingTime: string;
};

/** Resolved download links (computed from the desktop app version). */
export type Downloads = {
  version: string;
  mac: string;
  windows: string;
};

/** Localized UI labels used by the landing components. */
export type UiStrings = {
  eyebrow: string;
  railHeader: string;
  download: {
    title: string;
    desc: string;
    mac: string;
    macArch: string;
    win: string;
    winArch: string;
  };
  enterDiscussion: string;
  quoteLabel: string;
  ideasLabel: string;
  discussionLabel: string;
  selectThought: string;
  replies: (n: number) => string;
  footer: string;
};

export type LandingContent = {
  agents: Agent[];
  annotations: Annotation[];
  paragraphs: Paragraph[];
  meta: LandingMeta;
  ui: UiStrings;
};

export type Locale = 'zh-CN' | 'en';

// ── Agent colors (shared) + locale-specific avatars ──────

const agentColors: Record<string, string> = {
  yomitomo: '#2c4a7c',
  'reading-partner': '#6fa48f',
  'root-reviewer': '#4f7f9f',
  'question-mentor': '#a7b8e8',
  'insight-editor': '#d58b63',
  'concept-translator': '#c8b88a',
};

/** Landing uses small persona thumbnails; full-size art stays in public for richer pages. */
function avatarFor(id: string, lang: Locale): string {
  if (id === 'yomitomo') return '/assets/landing-avatars/common/yomitomo.webp';
  return `/assets/landing-avatars/${lang}/${id}.webp`;
}

function buildAgents(lang: Locale, nicknames: Record<string, string>): Agent[] {
  return Object.keys(agentColors).map((id) => ({
    id,
    nickname: nicknames[id],
    avatar: avatarFor(id, lang),
    annotationColor: agentColors[id],
  }));
}

// ── Chinese content ──────────────────────────────────────

const zhAgents = buildAgents('zh-CN', {
  yomitomo: 'Yomitomo',
  'reading-partner': '林知微',
  'root-reviewer': '周砚',
  'question-mentor': '许问渠',
  'insight-editor': '陈砚书',
  'concept-translator': '沈清源',
});

const zhAnnotations: Annotation[] = [
  {
    id: 'ann-d1',
    quote: '什么都没留下',
    authorId: 'yomitomo',
    content:
      '划线不是装饰，是判断。每一条线都锚定在原文的具体位置，三个月后你还能回到当时的上下文。',
    type: 'distillation',
    createdAt: '2025-01-15',
    agentIds: ['yomitomo'],
    thoughts: [],
  },
  {
    id: 'ann-2',
    quote: '本地优先',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['question-mentor'],
    thoughts: [
      {
        id: 't2-1',
        authorId: 'question-mentor',
        content: '阅读数据保存在本地，会不会不方便同步？万一换了电脑怎么办？',
        comments: [
          {
            id: 't2-1-c1',
            authorId: 'yomitomo',
            content:
              '本地优先不等于不用云。你的阅读数据存在本机，API Key 走系统 keyring，不经过我们的服务器。',
          },
          {
            id: 't2-1-c2',
            authorId: 'question-mentor',
            content: '那如果我确实想在两台电脑之间同步呢？',
          },
          {
            id: 't2-1-c3',
            authorId: 'yomitomo',
            content:
              '你可以用自己的同步盘或导出文件，主动权在你手里。我们不会替你把数据偷偷上传到任何地方。',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-d2',
    quote: '云端阅读器',
    authorId: 'yomitomo',
    content:
      '你的文章、批注、讨论、API Key 全部保存在你的电脑上。我们不会上传你的阅读数据到任何云端。',
    type: 'distillation',
    createdAt: '2025-01-15',
    agentIds: ['yomitomo'],
    thoughts: [],
  },
  {
    id: 'ann-3',
    quote: '在让你停下来的段落划一条线',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['insight-editor', 'concept-translator'],
    thoughts: [
      {
        id: 't3-1',
        authorId: 'insight-editor',
        content: '为什么是「停下来」才划线？不能整篇都划吗？',
        comments: [
          {
            id: 't3-1-c1',
            authorId: 'yomitomo',
            content:
              '划线不是高亮，它是一个判断。整篇高亮等于没高亮。只有让你停下来的地方，才值得记录。',
          },
          {
            id: 't3-1-c2',
            authorId: 'concept-translator',
            content: '而且划线之后可以挂想法、讨论、沉淀，它是一个入口，不是一个终点。',
          },
          {
            id: 't3-1-c3',
            authorId: 'insight-editor',
            content: '这样一篇文章里真正被划下的，反而是最值得回看的那几句。',
          },
        ],
      },
      {
        id: 't3-2',
        authorId: 'concept-translator',
        content: '划完线之后呢？光一条线能记住什么？',
        comments: [
          {
            id: 't3-2-c1',
            authorId: 'yomitomo',
            content:
              '划线记住的是「位置」。你的判断当时很清晰，三个月后会模糊。但只要划线还在，你就能回到原文重新接上。',
          },
          {
            id: 't3-2-c2',
            authorId: 'insight-editor',
            content: '所以划线比书签精确得多？',
          },
          {
            id: 't3-2-c3',
            authorId: 'yomitomo',
            content:
              '对。书签标记的是页面，划线标记的是具体的段落和句子。加上旁边的批注卡片，你能同时看到原文和自己的判断。',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-4',
    quote: '多个想法、回复和助手评论',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['root-reviewer', 'question-mentor', 'reading-partner'],
    thoughts: [
      {
        id: 't4-1',
        authorId: 'root-reviewer',
        content: '这里说「持续生长」是什么意思？一条划线能长出什么？',
        comments: [
          {
            id: 't4-1-c1',
            authorId: 'yomitomo',
            content:
              '你今天写下一个疑问，下周读到相关的段落，可以回到原来的划线追加新的联想。助手也可以随时加入讨论。',
          },
          {
            id: 't4-1-c2',
            authorId: 'question-mentor',
            content: '所以它不是一个快照，而是一个活的过程？',
          },
          {
            id: 't4-1-c3',
            authorId: 'yomitomo',
            content: '对，而且可以随时把讨论沉淀成一段清晰的总结，像下面那张卡片一样。',
          },
          {
            id: 't4-1-c4',
            authorId: 'root-reviewer',
            content: '沉淀之后，原来的讨论还在吗？',
          },
          {
            id: 't4-1-c5',
            authorId: 'yomitomo',
            content:
              '都在。沉淀是结论，讨论是过程，两者并存。你随时可以展开看当初是怎么得出结论的。',
          },
        ],
      },
      {
        id: 't4-2',
        authorId: 'reading-partner',
        content: '讨论会不会变得很乱？最后什么都找不到了？',
        comments: [
          {
            id: 't4-2-c1',
            authorId: 'yomitomo',
            content:
              '不会。想法按时间排列，每条想法下面是线性的讨论线程。你可以折叠、展开，也可以把最终的结论沉淀下来。',
          },
          {
            id: 't4-2-c2',
            authorId: 'reading-partner',
            content: '那助手会不会插太多话，把我的思路打断？',
          },
          {
            id: 't4-2-c3',
            authorId: 'yomitomo',
            content:
              '助手只在你需要时出现。你可以指定让哪位伴读参与，也可以让它们安静，整片讨论始终以你为主。',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-5',
    quote: '可保留的沉淀',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['concept-translator', 'insight-editor'],
    thoughts: [
      {
        id: 't5-1',
        authorId: 'concept-translator',
        content: '沉淀和笔记的区别是什么？为什么不直接叫「总结」？',
        comments: [
          {
            id: 't5-1-c1',
            authorId: 'yomitomo',
            content:
              '因为沉淀包含了你的判断。笔记是客观的记录，总结是事实的压缩，而沉淀是「你对原文的判断的结晶」。',
          },
          {
            id: 't5-1-c2',
            authorId: 'insight-editor',
            content: '而且沉淀可以回到原文，它不是孤立存在的。',
          },
          {
            id: 't5-1-c3',
            authorId: 'concept-translator',
            content: '所以沉淀更像是「带着出处的观点」，而不是干巴巴的摘要。',
          },
          {
            id: 't5-1-c4',
            authorId: 'yomitomo',
            content:
              '正是。每一段沉淀背后都连着原文和讨论，它是你思考过的证据，而不是别人替你写好的结论。',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-d3',
    quote: '六位性格各异的 AI 伴读',
    authorId: 'yomitomo',
    content:
      '伴读不是替你读，而是陪你读。六种视角各自提问、追根、翻译和编辑，但最终的判断始终留给你。',
    type: 'distillation',
    createdAt: '2025-01-15',
    agentIds: ['yomitomo'],
    thoughts: [],
  },
  {
    id: 'ann-7',
    quote: '网页文章、PDF、EPUB 和微信读书',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['insight-editor', 'concept-translator'],
    thoughts: [
      {
        id: 't7-1',
        authorId: 'insight-editor',
        content: '不同来源的内容，划线和讨论是统一管理的吗？',
        comments: [
          {
            id: 't7-1-c1',
            authorId: 'yomitomo',
            content: '是。无论网页、PDF、EPUB 还是微信读书，划线和讨论都落在同一个工作台里。',
          },
          {
            id: 't7-1-c2',
            authorId: 'concept-translator',
            content: '那从微信读书同步过来的笔记，会不会丢掉原来的位置？',
          },
          {
            id: 't7-1-c3',
            authorId: 'yomitomo',
            content: '不会。同步会保留原文锚点，让你在这里继续追加想法和沉淀，而不是从零开始。',
          },
        ],
      },
    ],
  },
];

const zhParagraphs: Paragraph[] = [
  {
    id: 'p1',
    segments: [
      { type: 'text', content: '我们读了那么多，最后' },
      { type: 'highlight', content: '什么都没留下', annotationId: 'ann-d1' },
      {
        type: 'text',
        content: '。收藏夹越来越满，稍后读队列越来越长，但真正沉淀下来的判断却少得可怜。',
      },
    ],
  },
  {
    id: 'p2',
    segments: [
      { type: 'text', content: 'Yomitomo 是一款' },
      { type: 'highlight', content: '本地优先', annotationId: 'ann-2' },
      {
        type: 'text',
        content: ' 的 AI 伴读桌面应用。它不是又一个',
      },
      { type: 'highlight', content: '云端阅读器', annotationId: 'ann-d2' },
      { type: 'text', content: '，而是你电脑上的一个阅读工作台。' },
    ],
  },
  {
    id: 'p3',
    segments: [
      { type: 'text', content: '在阅读中，' },
      { type: 'highlight', content: '在让你停下来的段落划一条线', annotationId: 'ann-3' },
      {
        type: 'text',
        content: '。这条线不是装饰，而是证据锚点。当你三个月后回来看时，你能立刻回到当时的上下文。',
      },
    ],
  },
  {
    id: 'p3b',
    segments: [
      {
        type: 'text',
        content:
          '大多数阅读工具只让你把文章「存起来」，却没人帮你「想清楚」。存下来的越多，回看的负担越重，最后整个收藏夹都成了一种心理债务。Yomitomo 想反过来：少存一点，但把读过的真正变成你的判断。',
      },
    ],
  },
  {
    id: 'p4',
    segments: [
      { type: 'text', content: '一条划线的下方可以挂' },
      { type: 'highlight', content: '多个想法、回复和助手评论', annotationId: 'ann-4' },
      { type: 'text', content: '。它不是一条静态的笔记，而是一个可以持续生长的讨论现场。' },
    ],
  },
  {
    id: 'p5',
    segments: [
      { type: 'text', content: '当讨论足够丰富时，你可以把它们整理成一段' },
      { type: 'highlight', content: '可保留的沉淀', annotationId: 'ann-5' },
      {
        type: 'text',
        content: '。沉淀不是替代原文，而是你对原文的判断的结晶。它带着出处，也带着你的角度。',
      },
    ],
  },
  {
    id: 'p5b',
    segments: [
      {
        type: 'text',
        content:
          '划线、想法、沉淀，构成了一条从「标记」到「判断」再到「结论」的路径。每一层都能回到上一层：从沉淀回到讨论，从讨论回到划线，从划线回到原文。任何时候你都不会面对一个想不起来由来的结论。',
      },
    ],
  },
  {
    id: 'p6',
    segments: [
      { type: 'text', content: '陪你完成这条路径的，是' },
      { type: 'highlight', content: '六位性格各异的 AI 伴读', annotationId: 'ann-d3' },
      {
        type: 'text',
        content:
          '。有人帮你提问，有人帮你追根，有人帮你翻译晦涩的概念，也有人帮你把零散的想法编辑成文。',
      },
    ],
  },
  {
    id: 'p6b',
    segments: [
      {
        type: 'text',
        content:
          '它们不会替你读，也不会替你下结论。你可以为每一条划线指定让谁参与，也可以让它们全部安静下来，独自面对原文。伴读的价值不在于给你答案，而在于逼你把自己的判断说清楚。',
      },
    ],
  },
  {
    id: 'p7',
    segments: [
      { type: 'text', content: 'Yomitomo 支持' },
      { type: 'highlight', content: '网页文章、PDF、EPUB 和微信读书', annotationId: 'ann-7' },
      {
        type: 'text',
        content:
          '。不同来源的内容，划线和讨论都落在同一个工作台里，同步过来的笔记也会保留原文锚点。',
      },
    ],
  },
  {
    id: 'p8',
    segments: [
      {
        type: 'text',
        content:
          'Yomitomo 完全免费、开源，你的数据永远在你自己的电脑上。它不向你推送，不替你排序，也不把你的阅读卖给任何人。它只做一件事：帮你把读过的，变成留得下的。',
      },
    ],
  },
];

const zhContent: LandingContent = {
  agents: zhAgents,
  annotations: zhAnnotations,
  paragraphs: zhParagraphs,
  meta: {
    title: '关于 Yomitomo',
    byline: 'Yomitomo Team',
    date: '2025年1月15日',
    readingTime: '5 分钟',
  },
  ui: {
    eyebrow: 'Yomitomo / 产品介绍',
    railHeader: '划线与讨论',
    download: {
      title: '下载 Yomitomo',
      desc: '完全免费、开源，阅读数据保存在本地。',
      mac: 'macOS',
      macArch: 'Apple Silicon',
      win: 'Windows',
      winArch: 'x64',
    },
    enterDiscussion: '进入讨论区',
    quoteLabel: '引文',
    ideasLabel: '想法',
    discussionLabel: '讨论',
    selectThought: '选择一条想法查看讨论',
    replies: (n) => `${n} 条回复`,
    footer: '© 2025 Yomitomo. 开源在 MIT 协议下。',
  },
};

// ── English content ──────────────────────────────────────

const enAgents = buildAgents('en', {
  yomitomo: 'Yomitomo',
  'reading-partner': 'June Hartley',
  'root-reviewer': 'Gideon Frost',
  'question-mentor': 'Maya Brooks',
  'insight-editor': 'Marcus Reed',
  'concept-translator': 'Iris Chen',
});

const enAnnotations: Annotation[] = [
  {
    id: 'ann-d1',
    quote: 'almost nothing stays',
    authorId: 'yomitomo',
    content:
      "A line isn't decoration, it's judgment. Every line is anchored to a specific spot in the source, so three months later you can return to the original context.",
    type: 'distillation',
    createdAt: '2025-01-15',
    agentIds: ['yomitomo'],
    thoughts: [],
  },
  {
    id: 'ann-2',
    quote: 'local-first',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['question-mentor'],
    thoughts: [
      {
        id: 't2-1',
        authorId: 'question-mentor',
        content: "If reading data stays local, isn't syncing a hassle? What if I switch computers?",
        comments: [
          {
            id: 't2-1-c1',
            authorId: 'yomitomo',
            content:
              "Local-first doesn't mean no cloud. Your reading data lives on your machine, your API key goes through the system keyring, and nothing passes through our servers.",
          },
          {
            id: 't2-1-c2',
            authorId: 'question-mentor',
            content: 'And if I really do want to sync between two computers?',
          },
          {
            id: 't2-1-c3',
            authorId: 'yomitomo',
            content:
              "You can use your own sync drive or export files — the control stays with you. We won't quietly upload your data anywhere.",
          },
        ],
      },
    ],
  },
  {
    id: 'ann-d2',
    quote: 'cloud reader',
    authorId: 'yomitomo',
    content:
      'Your articles, annotations, discussions and API keys are all kept on your own computer. We never upload your reading data to any cloud.',
    type: 'distillation',
    createdAt: '2025-01-15',
    agentIds: ['yomitomo'],
    thoughts: [],
  },
  {
    id: 'ann-3',
    quote: 'draw a line under the paragraph that makes you stop',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['insight-editor', 'concept-translator'],
    thoughts: [
      {
        id: 't3-1',
        authorId: 'insight-editor',
        content: 'Why draw a line only when you "stop"? Why not underline the whole thing?',
        comments: [
          {
            id: 't3-1-c1',
            authorId: 'yomitomo',
            content:
              "A line isn't a highlighter — it's a judgment. Highlighting everything is the same as highlighting nothing. Only the spots that make you stop are worth recording.",
          },
          {
            id: 't3-1-c2',
            authorId: 'concept-translator',
            content:
              "And after the line you can hang thoughts, discussion, distillation — it's an entry point, not an endpoint.",
          },
          {
            id: 't3-1-c3',
            authorId: 'insight-editor',
            content:
              'So the few sentences you actually underline turn out to be the ones most worth revisiting.',
          },
        ],
      },
      {
        id: 't3-2',
        authorId: 'concept-translator',
        content: "And after you've drawn the line? What can a single line remember?",
        comments: [
          {
            id: 't3-2-c1',
            authorId: 'yomitomo',
            content:
              'A line remembers the place. Your judgment is clear now and blurry in three months — but as long as the line is there, you can return to the source and reconnect.',
          },
          {
            id: 't3-2-c2',
            authorId: 'insight-editor',
            content: 'So a line is far more precise than a bookmark?',
          },
          {
            id: 't3-2-c3',
            authorId: 'yomitomo',
            content:
              'Yes. A bookmark marks a page; a line marks the specific paragraph and sentence. With the annotation card beside it, you see the source and your judgment at once.',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-4',
    quote: 'multiple thoughts, replies, and assistant comments',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['root-reviewer', 'question-mentor', 'reading-partner'],
    thoughts: [
      {
        id: 't4-1',
        authorId: 'root-reviewer',
        content: 'What does "keeps growing" mean here? What can a single line grow into?',
        comments: [
          {
            id: 't4-1-c1',
            authorId: 'yomitomo',
            content:
              'You write a question today; next week you read a related passage and return to the old line to add a new association. Assistants can join the discussion anytime too.',
          },
          {
            id: 't4-1-c2',
            authorId: 'question-mentor',
            content: "So it's not a snapshot but a living process?",
          },
          {
            id: 't4-1-c3',
            authorId: 'yomitomo',
            content:
              'Yes, and you can distill the discussion into a clear summary at any time, like the card below.',
          },
          {
            id: 't4-1-c4',
            authorId: 'root-reviewer',
            content: 'After distilling, is the original discussion still there?',
          },
          {
            id: 't4-1-c5',
            authorId: 'yomitomo',
            content:
              'All of it. The distillation is the conclusion, the discussion is the process — both stay. You can expand it anytime to see how the conclusion was reached.',
          },
        ],
      },
      {
        id: 't4-2',
        authorId: 'reading-partner',
        content: "Won't the discussion get messy, until you can't find anything?",
        comments: [
          {
            id: 't4-2-c1',
            authorId: 'yomitomo',
            content:
              'No. Thoughts are ordered by time, and under each thought is a linear discussion thread. You can fold, expand, and distill the final conclusion.',
          },
          {
            id: 't4-2-c2',
            authorId: 'reading-partner',
            content: "And won't the assistants butt in too much and break my train of thought?",
          },
          {
            id: 't4-2-c3',
            authorId: 'yomitomo',
            content:
              'Assistants only appear when you want them. You decide which companions join, and you can keep them quiet — the discussion always stays yours.',
          },
        ],
      },
    ],
  },
  {
    id: 'ann-5',
    quote: 'a distillation worth keeping',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['concept-translator', 'insight-editor'],
    thoughts: [
      {
        id: 't5-1',
        authorId: 'concept-translator',
        content:
          'What\'s the difference between a distillation and a note? Why not just call it a "summary"?',
        comments: [
          {
            id: 't5-1-c1',
            authorId: 'yomitomo',
            content:
              'Because a distillation contains your judgment. A note is an objective record, a summary compresses facts — a distillation is the crystallization of your judgment about the source.',
          },
          {
            id: 't5-1-c2',
            authorId: 'insight-editor',
            content: "And a distillation can return to the source; it doesn't exist in isolation.",
          },
          {
            id: 't5-1-c3',
            authorId: 'concept-translator',
            content:
              'So a distillation is more like "an opinion that carries its source" than a dry abstract.',
          },
          {
            id: 't5-1-c4',
            authorId: 'yomitomo',
            content:
              "Exactly. Behind every distillation is the source and the discussion — it's evidence that you've thought, not a conclusion someone wrote for you.",
          },
        ],
      },
    ],
  },
  {
    id: 'ann-d3',
    quote: 'six AI companions, each with a different temperament',
    authorId: 'yomitomo',
    content:
      "Companions don't read for you — they read with you. Six perspectives ask, dig, translate and edit, but the final judgment always stays with you.",
    type: 'distillation',
    createdAt: '2025-01-15',
    agentIds: ['yomitomo'],
    thoughts: [],
  },
  {
    id: 'ann-7',
    quote: 'web articles, PDF, EPUB and WeRead',
    authorId: 'yomitomo',
    type: 'discussion',
    createdAt: '2025-01-15',
    agentIds: ['insight-editor', 'concept-translator'],
    thoughts: [
      {
        id: 't7-1',
        authorId: 'insight-editor',
        content: 'For content from different sources, are lines and discussions managed together?',
        comments: [
          {
            id: 't7-1-c1',
            authorId: 'yomitomo',
            content:
              'Yes. Whether web, PDF, EPUB or WeRead, lines and discussions land in the same workbench.',
          },
          {
            id: 't7-1-c2',
            authorId: 'concept-translator',
            content: 'And notes synced from WeRead — do they lose their original position?',
          },
          {
            id: 't7-1-c3',
            authorId: 'yomitomo',
            content:
              'No. Syncing keeps the source anchors, so you can keep adding thoughts and distillations here instead of starting from scratch.',
          },
        ],
      },
    ],
  },
];

const enParagraphs: Paragraph[] = [
  {
    id: 'p1',
    segments: [
      { type: 'text', content: 'We read so much, and in the end ' },
      { type: 'highlight', content: 'almost nothing stays', annotationId: 'ann-d1' },
      {
        type: 'text',
        content:
          '. Your bookmarks keep filling up, your read-later queue keeps growing, but the judgments that actually stay are pitifully few.',
      },
    ],
  },
  {
    id: 'p2',
    segments: [
      { type: 'text', content: 'Yomitomo is a ' },
      { type: 'highlight', content: 'local-first', annotationId: 'ann-2' },
      {
        type: 'text',
        content: " AI reading companion for desktop. It isn't yet another ",
      },
      { type: 'highlight', content: 'cloud reader', annotationId: 'ann-d2' },
      {
        type: 'text',
        content: " — it's a reading workbench that lives on your own computer.",
      },
    ],
  },
  {
    id: 'p3',
    segments: [
      { type: 'text', content: 'While reading, ' },
      {
        type: 'highlight',
        content: 'draw a line under the paragraph that makes you stop',
        annotationId: 'ann-3',
      },
      {
        type: 'text',
        content:
          ". That line isn't decoration; it's an evidence anchor. Three months later you can return straight to the original context.",
      },
    ],
  },
  {
    id: 'p3b',
    segments: [
      {
        type: 'text',
        content:
          'Most reading tools only let you save an article; no one helps you think it through. The more you save, the heavier the backlog, until the whole bookmark folder becomes a kind of debt. Yomitomo flips it around: save less, but turn what you read into your own judgment.',
      },
    ],
  },
  {
    id: 'p4',
    segments: [
      { type: 'text', content: 'Beneath a single line you can hang ' },
      {
        type: 'highlight',
        content: 'multiple thoughts, replies, and assistant comments',
        annotationId: 'ann-4',
      },
      { type: 'text', content: ". It isn't a static note, but a discussion that keeps growing." },
    ],
  },
  {
    id: 'p5',
    segments: [
      { type: 'text', content: 'When the discussion is rich enough, you can distill it into ' },
      { type: 'highlight', content: 'a distillation worth keeping', annotationId: 'ann-5' },
      {
        type: 'text',
        content:
          ". A distillation doesn't replace the source — it's the crystallization of your judgment about it, carrying both its origin and your angle.",
      },
    ],
  },
  {
    id: 'p5b',
    segments: [
      {
        type: 'text',
        content:
          "Lines, thoughts and distillations form a path from marking to judgment to conclusion. Each layer can return to the one before: from distillation back to discussion, from discussion back to the line, from the line back to the source. You're never left facing a conclusion whose origin you can't recall.",
      },
    ],
  },
  {
    id: 'p6',
    segments: [
      { type: 'text', content: 'Walking that path with you are ' },
      {
        type: 'highlight',
        content: 'six AI companions, each with a different temperament',
        annotationId: 'ann-d3',
      },
      {
        type: 'text',
        content:
          '. One helps you ask, one digs to the root, one translates dense concepts, one edits scattered thoughts into prose.',
      },
    ],
  },
  {
    id: 'p6b',
    segments: [
      {
        type: 'text',
        content:
          "They won't read for you, nor decide for you. You can pick who joins each line, or silence them all and face the source alone. A companion's value isn't giving you answers — it's making you state your own judgment clearly.",
      },
    ],
  },
  {
    id: 'p7',
    segments: [
      { type: 'text', content: 'Yomitomo supports ' },
      {
        type: 'highlight',
        content: 'web articles, PDF, EPUB and WeRead',
        annotationId: 'ann-7',
      },
      {
        type: 'text',
        content:
          '. Content from different sources lands in the same workbench, and synced notes keep their original anchors.',
      },
    ],
  },
  {
    id: 'p8',
    segments: [
      {
        type: 'text',
        content:
          "Yomitomo is completely free and open source, and your data always stays on your own computer. It doesn't push to you, doesn't reorder for you, and doesn't sell your reading to anyone. It does one thing: help you turn what you read into something that stays.",
      },
    ],
  },
];

const enContent: LandingContent = {
  agents: enAgents,
  annotations: enAnnotations,
  paragraphs: enParagraphs,
  meta: {
    title: 'About Yomitomo',
    byline: 'Yomitomo Team',
    date: 'Jan 15, 2025',
    readingTime: '5 min read',
  },
  ui: {
    eyebrow: 'Yomitomo / Product',
    railHeader: 'Lines & Discussion',
    download: {
      title: 'Download Yomitomo',
      desc: 'Free, open source, all data stays on your machine.',
      mac: 'macOS',
      macArch: 'Apple Silicon',
      win: 'Windows',
      winArch: 'x64',
    },
    enterDiscussion: 'Open discussion',
    quoteLabel: 'Quote',
    ideasLabel: 'Ideas',
    discussionLabel: 'Discussion',
    selectThought: 'Select a thought to see the discussion',
    replies: (n) => `${n} ${n === 1 ? 'reply' : 'replies'}`,
    footer: '© 2025 Yomitomo. Open source under the MIT license.',
  },
};

// ── Public selector ──────────────────────────────────────

export function getLandingContent(lang: Locale): LandingContent {
  return lang === 'en' ? enContent : zhContent;
}
