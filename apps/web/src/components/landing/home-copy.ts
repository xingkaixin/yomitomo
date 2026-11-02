export type Lang = 'zh-CN' | 'en' | 'ja';

export const companionIds = [
  'reading-partner',
  'question-mentor',
  'insight-editor',
  'root-reviewer',
  'concept-translator',
  'structure-navigator',
] as const;

export type CompanionId = (typeof companionIds)[number];

type Companion = { name: string; role: string; say: string };
type Book = { title: string; author: string; date: string; kind: string; counts: string };
type View = { id: 'read' | 'think' | 'keep' | 'lib'; label: string; desc: string };
type Tile = { title: string; desc: string };

export type HomeCopy = {
  nav: { docs: string; blog: string; changelogs: string; download: string; label: string };
  hero: {
    titleLead: string;
    titleBefore: string;
    titleEm: string;
    titleAfter: string;
    sub: string;
    ctaMac: string;
    ctaWin: string;
    altMac: string;
    altWin: string;
    note: string;
  };
  flow: { title: string; lead: string; views: View[] };
  bento: {
    title: string;
    src: Tile;
    anchor: Tile;
    ask: Tile;
    keep: Tile;
    lang: Tile;
    mem: Tile;
    lib: Tile;
    review: Tile;
    stats: Tile;
    theme: Tile;
    local: Tile;
    model: Tile;
    open: Tile;
  };
  band: {
    title: [string, string];
    lead: string;
    quote: string;
    noteTab: string;
    companions: Record<CompanionId, Companion>;
  };
  help: { title: string; links: { href: string; title: string }[] };
  download: { title: [string, string]; arch: string };
  window: {
    library: string;
    me: string;
    article: { title: string; byline: string; paragraphs: string[]; quote: string; quote2: string };
    selection: { before: string; text: string; after: string };
    menu: { copy: string; note: string; ask: string; related: string };
    tabs: { distill: string; note: string };
    distillBody: [string, string];
    time: {
      twoDaysAgo: string;
      yesterday: string;
      threeMinutes: string;
      twoMinutes: string;
      justNow: string;
    };
    noteCount: string;
    openDiscussion: string;
    discussionTitle: string;
    discussingLine: string;
    thoughts: string;
    discussion: string;
    layoutSplit: string;
    layoutLeft: string;
    commit: string;
    thoughtList: { me: string; meMeta: string; root: string; rootMeta: string; insight: string };
    messages: { meAsk: string; question: string; root: string; meReply: string };
    composer: string;
    reply: string;
    distillTitle: string;
    distillDraft: string;
    draft: string;
    publish: string;
    doc: {
      title: string;
      first: string;
      before: string;
      removed: string;
      added: string;
      end: string;
      last: string;
      source: string;
    };
    proposal: string;
    accept: string;
    ignore: string;
    reviewTitle: string;
    review: { rootOne: string; rootTwo: string; insight: string };
    reviewComposer: string;
    send: string;
    libraryNav: [string, string, string, string, string];
    all: string;
    search: string;
    total: string;
    perPage: string;
    books: Book[];
  };
};

const zh: HomeCopy = {
  nav: {
    docs: '文档',
    blog: '博客',
    changelogs: '更新日志',
    download: '下载',
    label: '主导航',
  },
  hero: {
    titleLead: '读 PDF、EPUB，',
    titleBefore: '和 ',
    titleEm: 'AI 一起思考',
    titleAfter: '。',
    sub: '在 PDF、EPUB 和网页原文中划线、记笔记、与 AI 讨论，也能同步微信读书笔记。阅读数据保存在本机，AI 可使用自备 API Key 或本地模型。',
    ctaMac: '下载 macOS 版',
    ctaWin: '下载 Windows 版',
    altMac: '也支持 macOS →',
    altWin: '也支持 Windows →',
    note: '免费开源',
  },
  flow: {
    title: 'Yomitomo 把阅读的最小单位，从文章变成判断。',
    lead: '大多数工具只让你把文章「存起来」，却没人帮你「想清楚」。Yomitomo 反过来：少存一点，但把读过的真正变成你的判断。',
    views: [
      {
        id: 'read',
        label: '划线',
        desc: '在让你停下来的段落划一条线。它不是高亮，是证据锚点：精确到句子，永远能回到原文。',
      },
      {
        id: 'think',
        label: '想法',
        desc: '在划线下方写下判断、追问，或让 AI 伴读加入讨论。一条线可以挂多个想法，持续生长。',
      },
      {
        id: 'keep',
        label: '沉淀',
        desc: '当讨论足够丰富，把它整理成一段可保留的沉淀。它带着出处，也带着你的角度。',
      },
      {
        id: 'lib',
        label: '阅读库',
        desc: '不同来源的内容，划线和讨论都落在同一个工作台里，同步过来的笔记也会保留原文锚点。',
      },
    ],
  },
  bento: {
    title: '从收进来，到留下来。',
    src: {
      title: '多来源，一个阅读库',
      desc: '网页、EPUB、AZW3、MOBI、PDF、文本和微信读书收进同一个阅读库，用合集整理。',
    },
    anchor: {
      title: '批注锚定原文',
      desc: '划线精确到句子，想法挂在线下。三个月后打开，高亮和上下文都还在。',
    },
    ask: {
      title: '你 @ 谁，谁才开口',
      desc: '助手不会自己冒出来。只有你点名，它才读这一段，回这一条。',
    },
    keep: {
      title: '讨论沉淀成判断',
      desc: '把一条划线下的讨论整理成一段沉淀，再请审阅助手挑毛病。',
    },
    lang: {
      title: '双语对照',
      desc: '段落级翻译，原文和译文上下对照。写回阅读器时不改动原文。',
    },
    mem: {
      title: '阅读记忆',
      desc: '本地模型为你的划线、想法和沉淀建立索引。读到一段话，就能找到你读过的相关内容。',
    },
    lib: {
      title: '问书库',
      desc: '向自己的全部划线、想法和沉淀提问。回答带着引用，点一下回到原文。',
    },
    review: {
      title: '重新审视',
      desc: '先写下此刻的判断，再查看过去的想法。复审记录不会覆盖原始内容。',
    },
    stats: {
      title: '阅读统计',
      desc: '时长、划线和想法按日累计，也能同步微信读书的阅读数据。',
    },
    theme: {
      title: '主题与纸张',
      desc: '纸白、米色纸、墨黑、黛蓝、蓝墨。网页、电子书和 PDF 用同一张纸。',
    },
    local: {
      title: '数据留在本机',
      desc: '文章、批注和讨论存在本地，API Key 由系统凭据库保管，可完整备份和恢复。',
    },
    model: {
      title: '自带模型',
      desc: '用自己的 API Key，或连接 Ollama 这样的本地模型。Yomitomo 不提供、也不代理 AI 服务。',
    },
    open: {
      title: '开源免费',
      desc: '在 MIT 协议下开源。不向你推送，不替你排序，也不把你的阅读卖给任何人。',
    },
  },
  band: {
    title: ['AI 伴读不替你读，', '而是陪你读。'],
    lead: '六种视角各自提问、追根、翻译和编辑，但最终的判断始终留给你。你可以为每条划线指定谁参与，也可以让它们全部安静下来。',
    quote: '真正留下来的，是你当时停下来的那个判断。',
    noteTab: '助手想法',
    companions: {
      'reading-partner': {
        name: '林知微',
        role: '页边同读者',
        say: '读到这里我也停了一下。作者说的“判断”，是不是比“结论”更早，也更不确定？',
      },
      'question-mentor': {
        name: '许问渠',
        role: '提问者',
        say: '你上一次因为一句话改变看法，是什么时候？那句话现在还找得到吗？',
      },
      'insight-editor': {
        name: '陈砚书',
        role: '洞见整理者',
        say: '这句话把阅读的产出从“内容”换成了“判断”。可以记成：停下来的地方，才是读过的证据。',
      },
      'root-reviewer': {
        name: '周砚',
        role: '根因审读者',
        say: '作者默认判断比内容更持久，但全文没有给证据。如果当时的判断错了，留下它的价值在哪里？',
      },
      'concept-translator': {
        name: '沈清源',
        role: '概念翻译者',
        say: '这里的“判断”更接近读者当时的立场，不是对错评价。就像你在页边写下的那句“我不同意”。',
      },
      'structure-navigator': {
        name: '顾行简',
        role: '结构梳理者',
        say: '这句是第二段的收束。前面铺垫“读完什么都没留下”，后一段转向笔记软件的局限。',
      },
    },
  },
  help: {
    title: '从你的阅读场景开始。',
    links: [
      { href: '/docs/weread-api-key/', title: '获取微信读书 API Key' },
      { href: '/blog/scenarios/weread-migration/', title: '把微信读书划线和想法同步到本地' },
    ],
  },
  download: { title: ['下载 Yomitomo，', '开始把读过的留下来。'], arch: 'Apple 芯片' },
  window: {
    library: '阅读库',
    me: '我',
    article: {
      title: '慢读的理由',
      byline: '林见',
      paragraphs: [
        '我们每天读到的东西，比十年前多了几十倍，能复述出来的却没有变多。收藏夹越来越长，读过的文章像流水一样从眼前过去。',
        '问题不在读得太少。一篇文章读完，合上页面，三天之后还剩什么？往往只剩一个模糊的印象。',
        '三个月后再翻到那条高亮，你看到的只是一句脱离上下文的话，当时的疑问已经找不回来了。',
        '这也是为什么批注必须锚定在原文的具体位置。脱离了原文，想法就失去了证据；回到原文，你才能检查自己当时是否读对了。',
        '慢读不是读得慢，而是在该停的地方停下来。',
      ],
      quote: '真正留下来的，是你当时停下来的那个判断。',
      quote2: '笔记软件保存的是内容，却保存不了你为什么在这里停下。',
    },
    selection: {
      before: '所以阅读工具要解决的，不是存储。',
      text: '它应该让你在原文上留下判断，让这个判断有人追问，有人反驳',
      after: '，然后在讨论结束时，留下一段能带走的话。',
    },
    menu: { copy: '复制', note: '记录想法', ask: '问一问', related: '查找关联' },
    tabs: { distill: '沉淀', note: '批注' },
    distillBody: [
      '读过的证据不是内容，是停下来的位置。一条划线要能回答“我当时为什么停在这里”，否则它只是一段别人的话。',
      '注意：原文只说判断比内容更耐久，没有给出证据，这是我认同的部分，不是作者的结论。',
    ],
    time: {
      twoDaysAgo: '2 天前',
      yesterday: '昨天',
      threeMinutes: '3 分钟前',
      twoMinutes: '2 分钟前',
      justNow: '刚刚',
    },
    noteCount: '3 条想法',
    openDiscussion: '进入讨论区',
    discussionTitle: '批注讨论',
    discussingLine: '正在讨论的划线',
    thoughts: '想法',
    discussion: '讨论区',
    layoutSplit: '左右',
    layoutLeft: '左齐',
    commit: '把这些想法沉淀下来',
    thoughtList: {
      me: '判断比内容更容易丢。是不是因为我们只存了结论，没有存“为什么停下”？',
      meMeta: '3 分钟前 · 4 条回复',
      root: '作者默认判断比内容更持久，全文没有给证据。',
      rootMeta: '2 分钟前 · 1 条回复',
      insight: '可以记成：停下来的地方，才是读过的证据。',
    },
    messages: {
      meAsk: '判断比内容更容易丢。我在想，是不是因为我们只存了结论，没有存“为什么停下”？',
      question:
        '你上一次因为一句话改变看法，是什么时候？那句话现在还找得到吗？如果找不到，你保存的到底是什么？',
      root: '先分开两件事。作者说的是判断比内容更持久，但第二段只给了一个印象，没有证据。“存了结论，没存原因”是你的推断，可以保留，也应该标出来。',
      meReply: '同意，这是我的推断。那就把“为什么停下”作为这条想法的主线。',
    },
    composer: '回复这条想法，输入 @助手 可邀请助手参与讨论',
    reply: '回复',
    distillTitle: '沉淀',
    distillDraft: '沉淀稿',
    draft: '草稿',
    publish: '发布沉淀',
    doc: {
      title: '读过的证据',
      first:
        '读过的证据不是内容，是停下来的位置。一条划线要能回答“我当时为什么停在这里”，否则它只是一段别人的话。',
      before: '原文只说判断比内容更持久，',
      removed: '这一点已经被证明',
      added: '没有给出证据，这是我认同的部分，不是作者的结论',
      end: '。',
      last: '这也解释了我为什么总翻不回旧笔记：我存下了句子，没有存下当时的疑问。下一次划线之前，先写一句“我为什么停在这里”。',
      source: '出处：慢读的理由 · 林见 · 第 2 段',
    },
    proposal: '周砚提议修改这一句',
    accept: '接受',
    ignore: '忽略',
    reviewTitle: '审阅讨论',
    review: {
      rootOne:
        '这段的问题在第二句。原文第二段只给了一个印象，你写成“已经被证明”，把自己的认同算到了作者头上。',
      rootTwo: '我提议改成左边这样：保留你的判断，但标明它来自你。',
      insight:
        '标题“读过的证据”可以留下，它比原文的说法更具体。最后一句是可执行的做法，放在结尾合适。',
    },
    reviewComposer: '让已选审阅助手讨论这份沉淀…',
    send: '发送',
    libraryNav: ['阅读库', '阅读记忆', '助手', '统计', '设置'],
    all: '全部',
    search: '搜索文章与合集…',
    total: '共 64 项',
    perPage: '每页 12 项',
    books: [
      {
        title: '慢读的理由',
        author: '林见',
        date: '11/02',
        kind: '网页',
        counts: '3 划线 · 1 沉淀',
      },
      { title: '论语', author: '孔子', date: '10/28', kind: '电子书', counts: '42 划线 · 6 沉淀' },
      {
        title: '瓦尔登湖',
        author: '亨利·梭罗',
        date: '10/21',
        kind: '微信读书',
        counts: '57 划线 · 4 沉淀',
      },
      {
        title: 'Attention Is All You Need',
        author: 'Vaswani et al.',
        date: '10/19',
        kind: 'PDF',
        counts: '18 划线 · 3 沉淀',
      },
      {
        title: '傲慢与偏见',
        author: '简·奥斯汀',
        date: '10/12',
        kind: '电子书',
        counts: '26 划线 · 2 沉淀',
      },
      {
        title: '人间词话',
        author: '王国维',
        date: '10/03',
        kind: '文本',
        counts: '11 划线 · 2 沉淀',
      },
      {
        title: '物种起源',
        author: '查尔斯·达尔文',
        date: '09/27',
        kind: '电子书',
        counts: '8 划线 · 0 沉淀',
      },
      {
        title: '国富论',
        author: '亚当·斯密',
        date: '09/18',
        kind: '微信读书',
        counts: '33 划线 · 5 沉淀',
      },
      {
        title: '文学改良刍议',
        author: '胡适',
        date: '09/02',
        kind: '网页',
        counts: '6 划线 · 1 沉淀',
      },
    ],
  },
};

const en: HomeCopy = {
  nav: {
    docs: 'Docs',
    blog: 'Blog',
    changelogs: 'Release Notes',
    download: 'Download',
    label: 'Main navigation',
  },
  hero: {
    titleLead: 'Read PDFs and EPUBs.',
    titleBefore: '',
    titleEm: 'Think with AI',
    titleAfter: '.',
    sub: 'Highlight PDF, EPUB and web passages, take notes, and discuss them with AI. Keep your reading data on your computer. Bring your own API key or local model.',
    ctaMac: 'Download for macOS',
    ctaWin: 'Download for Windows',
    altMac: 'Also on macOS →',
    altWin: 'Also on Windows →',
    note: 'Free and open source',
  },
  flow: {
    title: 'Yomitomo shrinks the smallest unit of reading from the article to the judgment.',
    lead: 'Most tools only let you "save" articles. None help you think them through. Yomitomo flips it: save less, turn what you read into judgments of your own.',
    views: [
      {
        id: 'read',
        label: 'Line',
        desc: "Draw a line where a paragraph makes you pause. It's not a highlight, it's an evidence anchor: precise to the sentence, always traceable back to the source.",
      },
      {
        id: 'think',
        label: 'Thought',
        desc: 'Write a judgment or question under the line, or invite an AI companion to join. One line can carry many thoughts, growing over time.',
      },
      {
        id: 'keep',
        label: 'Distill',
        desc: 'When the discussion is rich enough, distill it into a conclusion worth keeping, carrying its source and your angle.',
      },
      {
        id: 'lib',
        label: 'Library',
        desc: 'Content from different sources, your lines and discussions all land on the same workbench, and synced notes keep their original anchors.',
      },
    ],
  },
  bento: {
    title: 'From collecting to keeping.',
    src: {
      title: 'Many sources, one library',
      desc: 'Web articles, EPUB, AZW3, MOBI, PDF, plain text and WeRead live in one library, organized into collections.',
    },
    anchor: {
      title: 'Notes anchored to the source',
      desc: 'Highlights are precise to the sentence, with thoughts under the line. Three months later, the highlight and its context are still there.',
    },
    ask: {
      title: 'Only who you @ speaks',
      desc: 'Assistants never jump in on their own. They read this passage and reply only when you name them.',
    },
    keep: {
      title: 'Discussion becomes judgment',
      desc: 'Distill the discussion under a line into a short piece, then ask a reviewer to find its weak spots.',
    },
    lang: {
      title: 'Side-by-side translation',
      desc: 'Paragraph-level translation stacks the original and the translation. Writing it back never changes the source.',
    },
    mem: {
      title: 'Reading Memory',
      desc: 'A local model indexes your lines, thoughts and distillations. Read a passage and find related things you have read.',
    },
    lib: {
      title: 'Ask your library',
      desc: 'Ask questions across all your lines, thoughts and distillations. Answers carry citations that lead back to the source.',
    },
    review: {
      title: 'Revisit',
      desc: 'Write your current judgment first, then look at your past thoughts. Review records never overwrite the original.',
    },
    stats: {
      title: 'Reading stats',
      desc: 'Time, lines and thoughts add up by day, and WeRead reading data can sync in too.',
    },
    theme: {
      title: 'Themes and paper',
      desc: 'Paper white, cream, ink black and two blues. Web articles, ebooks and PDFs share the same sheet.',
    },
    local: {
      title: 'Your data stays local',
      desc: 'Articles, annotations and discussions are stored locally, API keys live in the OS keystore, and everything can be backed up and restored.',
    },
    model: {
      title: 'Bring your own model',
      desc: 'Use your own API key, or connect a local model such as Ollama. Yomitomo neither provides nor proxies AI services.',
    },
    open: {
      title: 'Open and free',
      desc: 'Open source under the MIT license. It never pushes to you, never reorders for you, and never sells your reading.',
    },
  },
  band: {
    title: ["AI companions don't read for you.", 'They read with you.'],
    lead: 'Six perspectives question, dig deeper, translate and edit, but the final judgment always stays yours. You can choose who joins each line, or mute them all.',
    quote: 'What stays is the judgment you made when you stopped.',
    noteTab: 'Companion thought',
    companions: {
      'reading-partner': {
        name: 'June Hartley',
        role: 'Margin reading companion',
        say: 'I paused here too. Does the author\'s "judgment" come earlier than a conclusion, and with less certainty?',
      },
      'question-mentor': {
        name: 'Maya Brooks',
        role: 'Questioner',
        say: 'When did a sentence last change your mind? Can you still find that sentence?',
      },
      'insight-editor': {
        name: 'Marcus Reed',
        role: 'Insight editor',
        say: 'This moves the output of reading from content to judgment. You could note it as: where you stopped is the evidence that you read.',
      },
      'root-reviewer': {
        name: 'Gideon Frost',
        role: 'Root-cause reviewer',
        say: 'The author assumes judgment outlasts content, but offers no evidence. If that judgment was wrong, what is the value of keeping it?',
      },
      'concept-translator': {
        name: 'Iris Chen',
        role: 'Concept translator',
        say: '"Judgment" here is closer to where the reader stood at the time, not a verdict. Like the "I disagree" you wrote in the margin.',
      },
      'structure-navigator': {
        name: 'Daniel Park',
        role: 'Structure navigator',
        say: 'This closes the second paragraph. It builds on "nothing left after reading" and turns to the limits of note apps.',
      },
    },
  },
  help: {
    title: 'Choose your reading workflow.',
    links: [
      {
        href: '/en/blog/scenarios/readwise-reader-alternative/',
        title: 'Yomitomo or Readwise Reader?',
      },
      {
        href: '/en/blog/scenarios/local-ai-reading-with-ollama/',
        title: 'Read with a local model in Ollama',
      },
    ],
  },
  download: {
    title: ['Download Yomitomo,', 'and start keeping what you read.'],
    arch: 'Apple Silicon',
  },
  window: {
    library: 'Library',
    me: 'Me',
    article: {
      title: 'The Case for Slow Reading',
      byline: 'Lin Jian',
      paragraphs: [
        'We read dozens of times more each day than we did ten years ago, yet we can retell no more of it. Bookmarks keep growing, and articles flow past like water.',
        'Reading too little is not the problem. You finish an article and close the page. What is left three days later? Usually a vague impression.',
        'Three months later you find that highlight again and see a sentence with no context. The question you had is gone.',
        'That is why annotations must be anchored to an exact place in the source. Away from the source, a thought loses its evidence. Back at the source, you can check whether you read it right.',
        'Slow reading is not reading slowly. It is stopping where you should stop.',
      ],
      quote: 'What stays is the judgment you made when you stopped.',
      quote2: 'Note apps keep the content, but not why you stopped here.',
    },
    selection: {
      before: 'So a reading tool has a job other than storage. ',
      text: 'It should let you leave a judgment on the source, where someone can question it and push back',
      after: ', and when the discussion ends, leave you with something to carry away.',
    },
    menu: { copy: 'Copy', note: 'Add thought', ask: 'Ask', related: 'Find related' },
    tabs: { distill: 'Distilled', note: 'Note' },
    distillBody: [
      'The evidence of reading is not the content but where you stopped. A line should answer "why did I stop here?" Otherwise it is only someone else\'s sentence.',
      "Note: the source only says judgment outlasts content and gives no evidence. This is the part I agree with, not the author's conclusion.",
    ],
    time: {
      twoDaysAgo: '2 days ago',
      yesterday: 'Yesterday',
      threeMinutes: '3 min ago',
      twoMinutes: '2 min ago',
      justNow: 'Just now',
    },
    noteCount: '3 thoughts',
    openDiscussion: 'Open discussion',
    discussionTitle: 'Discussion',
    discussingLine: 'Line under discussion',
    thoughts: 'Thoughts',
    discussion: 'Discussion',
    layoutSplit: 'Split',
    layoutLeft: 'Left',
    commit: 'Distill these thoughts',
    thoughtList: {
      me: 'Judgment is easier to lose than content. Is that because we save the conclusion but not why we stopped?',
      meMeta: '3 min ago · 4 replies',
      root: 'The author assumes judgment outlasts content and gives no evidence.',
      rootMeta: '2 min ago · 1 reply',
      insight: 'You could note it as: where you stopped is the evidence that you read.',
    },
    messages: {
      meAsk:
        'Judgment is easier to lose than content. I wonder if that is because we save the conclusion but not why we stopped.',
      question:
        'When did a sentence last change your mind? Can you still find it? If not, what exactly did you save?',
      root: 'Let me separate two things. The author says judgment outlasts content, but paragraph two offers an impression, not evidence. "Saved the conclusion, not the reason" is your inference. Keep it, and mark it as yours.',
      meReply:
        'Agreed, that is my inference. Let\'s make "why I stopped" the thread of this thought.',
    },
    composer: 'Reply to this thought. Type @assistant to invite an assistant',
    reply: 'Reply',
    distillTitle: 'Distill',
    distillDraft: 'Distillation',
    draft: 'Draft',
    publish: 'Publish',
    doc: {
      title: 'The evidence of reading',
      first:
        'The evidence of reading is not the content but where you stopped. A line should answer "why did I stop here?" Otherwise it is only someone else\'s sentence.',
      before: 'The source only says judgment outlasts content, ',
      removed: 'and this has been proven',
      added: "without evidence. This is the part I agree with, not the author's conclusion",
      end: '.',
      last: 'This also explains why I never go back to old notes: I saved the sentence, not the question I had. Before the next line, write down why you stopped.',
      source: 'Source: The Case for Slow Reading · Lin Jian · Paragraph 2',
    },
    proposal: 'Gideon Frost suggests a change here',
    accept: 'Accept',
    ignore: 'Ignore',
    reviewTitle: 'Review',
    review: {
      rootOne:
        'The problem is the second sentence. Paragraph two gives only an impression, but you wrote "has been proven", crediting your own agreement to the author.',
      rootTwo: 'I suggest the version on the left: keep your judgment, and mark that it is yours.',
      insight:
        'Keep the title. It is more concrete than the original wording. The last sentence is something you can act on, so it works as the ending.',
    },
    reviewComposer: 'Ask the selected reviewers about this distillation…',
    send: 'Send',
    libraryNav: ['Library', 'Reading Memory', 'Assistants', 'Stats', 'Settings'],
    all: 'All',
    search: 'Search articles and collections…',
    total: '64 items',
    perPage: '12 per page',
    books: [
      {
        title: 'The Case for Slow Reading',
        author: 'Lin Jian',
        date: '11/02',
        kind: 'Web',
        counts: '3 lines · 1 distilled',
      },
      {
        title: 'The Analects',
        author: 'Confucius',
        date: '10/28',
        kind: 'Ebook',
        counts: '42 lines · 6 distilled',
      },
      {
        title: 'Walden',
        author: 'Henry David Thoreau',
        date: '10/21',
        kind: 'WeRead',
        counts: '57 lines · 4 distilled',
      },
      {
        title: 'Attention Is All You Need',
        author: 'Vaswani et al.',
        date: '10/19',
        kind: 'PDF',
        counts: '18 lines · 3 distilled',
      },
      {
        title: 'Pride and Prejudice',
        author: 'Jane Austen',
        date: '10/12',
        kind: 'Ebook',
        counts: '26 lines · 2 distilled',
      },
      {
        title: 'Meditations',
        author: 'Marcus Aurelius',
        date: '10/03',
        kind: 'Text',
        counts: '11 lines · 2 distilled',
      },
      {
        title: 'On the Origin of Species',
        author: 'Charles Darwin',
        date: '09/27',
        kind: 'Ebook',
        counts: '8 lines · 0 distilled',
      },
      {
        title: 'The Wealth of Nations',
        author: 'Adam Smith',
        date: '09/18',
        kind: 'WeRead',
        counts: '33 lines · 5 distilled',
      },
      {
        title: 'Politics and the English Language',
        author: 'George Orwell',
        date: '09/02',
        kind: 'Web',
        counts: '6 lines · 1 distilled',
      },
    ],
  },
};

const ja: HomeCopy = {
  nav: {
    docs: 'ドキュメント',
    blog: 'ブログ',
    changelogs: '更新履歴',
    download: 'ダウンロード',
    label: 'メインナビゲーション',
  },
  hero: {
    titleLead: 'PDF・EPUBを読み、',
    titleBefore: '',
    titleEm: 'AIと考える',
    titleAfter: '。',
    sub: 'PDF・EPUB・Web記事の原文に線を引き、メモを書き、AIと対話。読書データは端末内に保存。AIには自分のAPIキーやローカルモデルを使えます。',
    ctaMac: 'macOS版をダウンロード',
    ctaWin: 'Windows版をダウンロード',
    altMac: 'macOS版もあります →',
    altWin: 'Windows版もあります →',
    note: '無料・オープンソース',
  },
  flow: {
    title: '読書の最小単位を、記事から判断へ。',
    lead: '多くのツールは記事を「保存」するだけで、考え抜くところまでは助けてくれません。Yomitomoは逆です。保存を減らし、読んだことを自分の判断へ変えます。',
    views: [
      {
        id: 'read',
        label: '線を引く',
        desc: '立ち止まった段落に線を引きます。単なるハイライトではなく、文単位で原文へ戻れる根拠の印です。',
      },
      {
        id: 'think',
        label: '考えを残す',
        desc: '線の下に判断や問いを書き、AI読書パートナーを対話へ招きます。一つの線に複数の考えを重ねられます。',
      },
      {
        id: 'keep',
        label: 'まとめる',
        desc: '対話が十分に深まったら、出典と自分の視点を持つ、残す価値のある結論へまとめます。',
      },
      {
        id: 'lib',
        label: 'ライブラリ',
        desc: '異なるソースの本文、線、対話を一つのワークスペースに集約します。同期したメモも原文の位置を保ちます。',
      },
    ],
  },
  bento: {
    title: '集めることから、残すことへ。',
    src: {
      title: '複数のソースを一つのライブラリに',
      desc: 'Web記事、EPUB、AZW3、MOBI、PDF、テキスト、微信読書を一つのライブラリに集め、コレクションで整理します。',
    },
    anchor: {
      title: '注釈は原文に結びつく',
      desc: '線は文単位で正確に引け、考えは線の下に残ります。三か月後に開いても、ハイライトと文脈はそのままです。',
    },
    ask: {
      title: '@で呼んだ相手だけが話す',
      desc: 'アシスタントが勝手に割り込むことはありません。名前を呼んだときだけ、その箇所を読んで返信します。',
    },
    keep: {
      title: '対話を判断へまとめる',
      desc: '線の下の対話を短いまとめに整理し、レビューアシスタントに弱点を指摘してもらいます。',
    },
    lang: {
      title: '二言語対照',
      desc: '段落単位で翻訳し、原文と訳文を上下に並べます。リーダーへ書き戻しても原文は変わりません。',
    },
    mem: {
      title: '読書メモリー',
      desc: 'ローカルモデルが線、考え、まとめを索引化します。ある一節を読むと、過去に読んだ関連内容が見つかります。',
    },
    lib: {
      title: 'ライブラリに質問',
      desc: '自分の線、考え、まとめ全体に質問できます。回答には引用が付き、クリックで原文へ戻れます。',
    },
    review: {
      title: '読み直す',
      desc: 'まず今の判断を書いてから、過去の考えを確認します。再評価の記録が元の内容を上書きすることはありません。',
    },
    stats: {
      title: '読書統計',
      desc: '時間、線、考えを日ごとに集計し、微信読書の読書データも同期できます。',
    },
    theme: {
      title: 'テーマと紙',
      desc: '紙白、クリーム、墨黒、二つの藍。Web記事、電子書籍、PDFで同じ紙を使えます。',
    },
    local: {
      title: 'データは端末に残る',
      desc: '記事、注釈、対話はローカルに保存し、APIキーはOSの資格情報ストアで管理します。すべてバックアップと復元ができます。',
    },
    model: {
      title: '自分のモデルを使う',
      desc: '自分のAPIキー、またはOllamaなどのローカルモデルを使います。YomitomoはAIサービスを提供も中継もしません。',
    },
    open: {
      title: '無料・オープンソース',
      desc: 'MITライセンスで公開しています。コンテンツの押しつけも、並べ替えも、読書データの販売もしません。',
    },
  },
  band: {
    title: ['AI読書パートナーは、', '代わりに読むのではなく一緒に読む。'],
    lead: '六つの視点が問い、掘り下げ、翻訳し、編集します。最後に判断するのはいつもあなたです。線を引くたびに参加者を選ぶことも、全員を休ませることもできます。',
    quote: '本当に残るのは、立ち止まったときの判断だ。',
    noteTab: 'アシスタントの考え',
    companions: {
      'reading-partner': {
        name: '高橋 葵',
        role: '余白の読書伴走者',
        say: '私もここで立ち止まりました。著者の言う「判断」は、「結論」より早く、より不確かなものではないでしょうか。',
      },
      'question-mentor': {
        name: '水野 花',
        role: '問いの案内人',
        say: '一文で考えが変わったのは、最後にいつでしたか。その一文は今も見つかりますか。',
      },
      'insight-editor': {
        name: '橘 駿',
        role: '洞察の編集者',
        say: 'この一文は、読書の成果を「内容」から「判断」へ置き換えています。「立ち止まった場所こそ、読んだ証拠」と記録できます。',
      },
      'root-reviewer': {
        name: '黒沢 蓮',
        role: '前提を問う批評者',
        say: '著者は判断のほうが内容より長く残ると決めていますが、根拠を示していません。その判断が誤りなら、残す価値はどこにありますか。',
      },
      'concept-translator': {
        name: '白川 澪',
        role: '概念の翻訳者',
        say: 'ここでの「判断」は正誤の評価ではなく、読者のそのときの立場に近い言葉です。余白に書いた「同意できない」のようなものです。',
      },
      'structure-navigator': {
        name: '森 海斗',
        role: '構成ナビゲーター',
        say: 'この一文は第二段落の結びです。「読み終えて何も残らない」を受け、次の段落でメモアプリの限界へ移ります。',
      },
    },
  },
  help: {
    title: '目的に合わせて使い始める。',
    links: [
      { href: '/ja/blog/scenarios/pdf-annotation/', title: 'PDFに注釈を付け、AIと読み進める' },
      {
        href: '/ja/blog/scenarios/zotero-academic-workflow/',
        title: 'Zoteroの論文をYomitomoで精読する',
      },
    ],
  },
  download: {
    title: ['Yomitomoをダウンロードして、', '読んだことを残し始めよう。'],
    arch: 'Apple Silicon',
  },
  window: {
    library: 'ライブラリ',
    me: '私',
    article: {
      title: 'ゆっくり読む理由',
      byline: '林見',
      paragraphs: [
        '私たちが毎日読む量は十年前の何十倍にもなりましたが、語り直せることは増えていません。ブックマークは伸び続け、読んだ記事は水のように流れていきます。',
        '問題は読む量の少なさではありません。記事を読み終えてページを閉じ、三日後に何が残っているでしょうか。たいていはぼんやりした印象だけです。',
        '三か月後にそのハイライトを見返しても、文脈から切り離された一文があるだけで、当時の疑問はもう戻ってきません。',
        'だから注釈は原文の正確な位置に結びつける必要があります。原文から離れると考えは根拠を失い、原文に戻れば、当時の読みが正しかったかを確かめられます。',
        'ゆっくり読むとは、遅く読むことではありません。止まるべき場所で止まることです。',
      ],
      quote: '本当に残るのは、立ち止まったときの判断だ。',
      quote2: 'メモアプリは内容を保存しても、なぜここで止まったかは保存できない。',
    },
    selection: {
      before: 'だから読書ツールが解くべき問題は、保存ではありません。',
      text: '原文の上に判断を残し、その判断に問いかけ、反論してくれる相手がいること',
      after: '。そして対話の終わりに、持ち帰れる言葉が残ることです。',
    },
    menu: { copy: 'コピー', note: '考えを記録', ask: '質問', related: '関連を探す' },
    tabs: { distill: 'まとめ', note: '注釈' },
    distillBody: [
      '読んだ証拠は内容ではなく、立ち止まった位置だ。線は「なぜここで止まったのか」に答えられなければ、他人の一文にすぎない。',
      '注意：原文は判断のほうが長く残ると言うだけで根拠を示していない。ここは私が同意した部分で、著者の結論ではない。',
    ],
    time: {
      twoDaysAgo: '2日前',
      yesterday: '昨日',
      threeMinutes: '3分前',
      twoMinutes: '2分前',
      justNow: 'たった今',
    },
    noteCount: '考え 3件',
    openDiscussion: '対話を開く',
    discussionTitle: '注釈の対話',
    discussingLine: '対話中の線',
    thoughts: '考え',
    discussion: '対話',
    layoutSplit: '左右',
    layoutLeft: '左揃え',
    commit: 'この考えをまとめる',
    thoughtList: {
      me: '判断は内容より失われやすい。結論だけを保存して、「なぜ止まったか」を保存していないからだろうか。',
      meMeta: '3分前 · 返信 4件',
      root: '著者は判断のほうが長く残ると決めていて、根拠を示していない。',
      rootMeta: '2分前 · 返信 1件',
      insight: '「立ち止まった場所こそ、読んだ証拠」と記録できます。',
    },
    messages: {
      meAsk:
        '判断は内容より失われやすい。結論だけを保存して、「なぜ止まったか」を保存していないからではないかと考えています。',
      question:
        '一文で考えが変わったのは、最後にいつでしたか。その一文は今も見つかりますか。見つからないなら、保存したものは何でしょうか。',
      root: '二つに分けましょう。著者は判断のほうが長く残ると言いますが、第二段落は印象だけで根拠がありません。「結論だけ保存した」はあなたの推論です。残してかまいませんが、そう明記すべきです。',
      meReply: '同意します。これは私の推論です。「なぜ止まったか」をこの考えの軸にします。',
    },
    composer: 'この考えに返信。@アシスタントで招待できます',
    reply: '返信',
    distillTitle: 'まとめ',
    distillDraft: 'まとめ',
    draft: '下書き',
    publish: '公開',
    doc: {
      title: '読んだ証拠',
      first:
        '読んだ証拠は内容ではなく、立ち止まった位置だ。線は「なぜここで止まったのか」に答えられなければ、他人の一文にすぎない。',
      before: '原文は判断のほうが長く残ると言うだけで、',
      removed: 'これはすでに証明されている',
      added: '根拠を示していない。ここは私が同意した部分で、著者の結論ではない',
      end: '。',
      last: 'これで古いメモを見返せない理由も分かる。文は保存したが、当時の疑問は保存しなかった。次に線を引く前に、「なぜここで止まったか」を一言書く。',
      source: '出典：ゆっくり読む理由 · 林見 · 第2段落',
    },
    proposal: '黒沢 蓮がこの文の修正を提案',
    accept: '承認',
    ignore: '無視',
    reviewTitle: 'レビュー',
    review: {
      rootOne:
        '問題は二文目です。第二段落は印象を述べているだけなのに、「証明されている」と書くと、自分の同意を著者の主張にしてしまいます。',
      rootTwo: '左のように直すことを提案します。判断は残し、自分のものだと明記します。',
      insight:
        'タイトルは残しましょう。原文の言い方より具体的です。最後の一文は実行できる行動なので、結びに合っています。',
    },
    reviewComposer: '選択したレビュー担当にこのまとめを議論してもらう…',
    send: '送信',
    libraryNav: ['ライブラリ', '読書メモリー', 'アシスタント', '統計', '設定'],
    all: 'すべて',
    search: '記事とコレクションを検索…',
    total: '全 64 件',
    perPage: '12 件/ページ',
    books: [
      {
        title: 'ゆっくり読む理由',
        author: '林見',
        date: '11/02',
        kind: 'Web',
        counts: '線 3 · まとめ 1',
      },
      {
        title: '論語',
        author: '孔子',
        date: '10/28',
        kind: '電子書籍',
        counts: '線 42 · まとめ 6',
      },
      {
        title: 'ウォールデン',
        author: 'ヘンリー・ソロー',
        date: '10/21',
        kind: '微信読書',
        counts: '線 57 · まとめ 4',
      },
      {
        title: 'Attention Is All You Need',
        author: 'Vaswani et al.',
        date: '10/19',
        kind: 'PDF',
        counts: '線 18 · まとめ 3',
      },
      {
        title: '高慢と偏見',
        author: 'ジェイン・オースティン',
        date: '10/12',
        kind: '電子書籍',
        counts: '線 26 · まとめ 2',
      },
      {
        title: '徒然草',
        author: '吉田兼好',
        date: '10/03',
        kind: 'テキスト',
        counts: '線 11 · まとめ 2',
      },
      {
        title: '種の起源',
        author: 'チャールズ・ダーウィン',
        date: '09/27',
        kind: '電子書籍',
        counts: '線 8 · まとめ 0',
      },
      {
        title: '国富論',
        author: 'アダム・スミス',
        date: '09/18',
        kind: '微信読書',
        counts: '線 33 · まとめ 5',
      },
      {
        title: '文学論',
        author: '夏目漱石',
        date: '09/02',
        kind: 'Web',
        counts: '線 6 · まとめ 1',
      },
    ],
  },
};

const copies: Record<Lang, HomeCopy> = { 'zh-CN': zh, en, ja };

export const getHomeCopy = (lang: Lang) => copies[lang];

export const bookSpines = [
  '#9b463b',
  '#4b7fb5',
  '#5e8c6a',
  '#c9a13f',
  '#7a5ea8',
  '#2f2720',
  '#5e8c6a',
  '#b23223',
  '#4b7fb5',
];
