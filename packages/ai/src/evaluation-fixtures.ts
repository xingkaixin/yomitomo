import type {
  AgentAnnotatePayload,
  AgentMessagePayload,
  Annotation,
  Comment,
  EpubBookIndex,
  FocusCoReadingRoutePayload,
  ReadingMemoryView,
  TextAnchor,
} from '@yomitomo/shared';
import {
  buildEpubBookIndex,
  createEpubTextAnchor,
  epubIndexText,
  type EpubBookIndexChapterInput,
} from '@yomitomo/core';
import type {
  EpubEvaluationBookType,
  EpubEvaluationCase,
  EpubEvaluationChapterLength,
} from './evaluation';
import { epubEvaluationControlGroups } from './evaluation';

type EpubEvaluationBookFixture = {
  id: string;
  title: string;
  url: string;
  bookType: EpubEvaluationBookType;
  chapters: EpubBookIndexChapterInput[];
  text: string;
  ebookIndex: EpubBookIndex;
};

const now = '2026-05-14T00:00:00.000Z';
const agent = {
  id: 'agent-lin',
  username: 'lin',
  nickname: '林知微',
};

export const epubEvaluationBooks = {
  fiction: buildBook('fiction-bridge', '渡桥灯', 'fiction', [
    {
      id: 'fiction-short',
      title: '第一章 渡桥',
      paragraphs: [
        '渡桥的灯不是为了照亮路面，而是让离开的人知道自己已经走到河心。',
        '守桥人把旧票根夹进木盒，提醒自己不要把等待误认为归来。',
      ],
    },
    {
      id: 'fiction-ultra',
      title: '第九章 回声',
      paragraphs: [
        longParagraph('雨声压低了码头的谈话，主角开始怀疑那盏灯是否一直在为别人亮着。', 14),
        longParagraph('渡桥再次出现时，灯光没有变亮，只把每个人的迟疑照得更清楚。', 14),
        longParagraph('结尾没有揭示新的秘密，只让读者重新理解第一章的离开。', 14),
      ],
    },
  ]),
  socialBusiness: buildBook('business-growth', '增长拐点', 'social_business', [
    {
      id: 'business-short',
      title: '导言',
      paragraphs: ['公司增长不是单纯的流量问题，而是组织是否还能承受更高复杂度的问题。'],
    },
    {
      id: 'business-medium',
      title: '第二章 人口红利之后',
      paragraphs: [
        '人口红利在本章开头被定义为劳动力供给优势，而不是永久的经营护城河。',
        '当供给优势消失，企业会更早暴露流程、激励和产品选择上的压力。',
        '目标观点讨论选择压力：管理层必须决定哪些增长机会不再值得追逐。',
      ],
    },
    {
      id: 'business-ultra',
      title: '第五章 密度',
      paragraphs: [
        longParagraph('规模优势不是护城河，只有当组织把学习速度转成判断密度时才有复利。', 18),
        longParagraph('第二个可批注点指出，低质量增长会把每个部门推向局部最优。', 18),
        longParagraph('章节末尾把增长密度收束为一个问题：哪些机会会让团队越来越笨。', 18),
      ],
    },
  ]),
  theory: buildBook('theory-freedom', '约束与自由', 'theory', [
    {
      id: 'theory-short',
      title: '引言',
      paragraphs: ['作者先把自由从任意行动中剥离出来，转向可说明的选择结构。'],
    },
    {
      id: 'theory-medium',
      title: '第二节 约束',
      paragraphs: [
        '本节先定义约束：约束不是外部障碍，而是让选择具有形状的条件。',
        '第二节把自由定义为可被检验的约束选择，而不是没有边界的偏好表达。',
        '如果读者忽略这个定义，后文关于责任的推理会被误读成道德说教。',
      ],
    },
    {
      id: 'theory-ultra',
      title: '第四节 责任',
      paragraphs: [
        longParagraph('核心问题不是有没有限制，而是限制如何进入自我理解。', 16),
        longParagraph('核心问题不是有没有限制，这个句式在后文重复，但每次承担的论证功能不同。', 16),
        longParagraph('章节最后把责任理解为对条件的承认，而不是对失败的惩罚。', 16),
      ],
    },
  ]),
  technical: buildBook('technical-runtime', '运行时笔记', 'technical', [
    {
      id: 'technical-short',
      title: '快速开始',
      paragraphs: ['本章只说明运行最小示例所需的命令和目录约定。'],
    },
    {
      id: 'technical-medium',
      title: '任务调度',
      paragraphs: [
        '调度器先把任务拆成可重试的步骤，再记录每一步的输入输出边界。',
        '如果缓存命中，执行器跳过外部调用，但仍然写入同样的 trace 记录。',
        '本章适合分配给关注边界、失败恢复和成本控制的助手。',
      ],
    },
    {
      id: 'technical-ultra',
      title: '长任务恢复',
      paragraphs: [
        longParagraph('恢复协议要求每个 checkpoint 都包含任务输入、工具输出和下一步计划。', 18),
        longParagraph('当外部 API 返回不稳定结果时，系统只重放幂等步骤。', 18),
        longParagraph('最终一致性依赖明确的事件边界，而不是隐式共享状态。', 18),
      ],
    },
  ]),
} as const;

export const epubEvaluationCases: EpubEvaluationCase[] = [
  selectionAnnotationCase({
    id: 'selection-local-fiction-short',
    title: '划线局部解释：小说短章',
    description: '答案在当前段落前后，structured context 应明显优于 selection-only。',
    book: epubEvaluationBooks.fiction,
    chapterLength: 'short',
    exact: '渡桥的灯不是为了照亮路面',
    requiredEvidence: ['让离开的人知道自己已经走到河心'],
  }),
  threadReplyCase({
    id: 'thread-continuity-business-medium',
    title: '划线后连续讨论：社科/商业中章',
    description: '助手需要保持原批注、用户追问和本章上下文，而不是退化成普通聊天。',
    book: epubEvaluationBooks.socialBusiness,
    chapterLength: 'medium',
    exact: '人口红利在本章开头被定义为劳动力供给优势',
    userQuestion: '@林知微 这里和后面的选择压力怎么连起来？',
    requiredEvidence: ['目标观点讨论选择压力'],
  }),
  threadReplyCase({
    id: 'thread-backref-theory-medium',
    title: '章节内回指：哲学/理论中章',
    description: '追问需要回到同章前文定义，全文截断容易漏掉术语边界。',
    book: epubEvaluationBooks.theory,
    chapterLength: 'medium',
    exact: '第二节把自由定义为可被检验的约束选择',
    userQuestion: '@林知微 前面怎么定义约束？',
    requiredEvidence: ['约束不是外部障碍'],
  }),
  selectionAnnotationCase({
    id: 'selection-memory-business-medium',
    title: '历史批注记忆：社科/商业中章',
    description: '助手需要把同篇文章已有的用户批注作为背景，但仍然锚定当前选区。',
    book: epubEvaluationBooks.socialBusiness,
    chapterLength: 'medium',
    exact: '目标观点讨论选择压力',
    requiredEvidence: ['组织复杂度的前置证据'],
    readingMemoryView: historicalAnnotationMemoryView(
      epubEvaluationBooks.socialBusiness,
      '企业会更早暴露流程、激励和产品选择上的压力',
      '用户曾把这里标记为组织复杂度的前置证据。',
      'selection',
    ),
  }),
  threadReplyCase({
    id: 'thread-memory-theory-medium',
    title: '历史讨论记忆：哲学/理论中章',
    description: '助手回复当前 thread 时应参考同篇文章早先讨论，但不把旧讨论当成当前问题。',
    book: epubEvaluationBooks.theory,
    chapterLength: 'medium',
    exact: '第二节把自由定义为可被检验的约束选择',
    userQuestion: '@林知微 这里为什么说是可被检验？',
    requiredEvidence: ['选择必须能被理由说明'],
    readingMemoryView: historicalCommentMemoryView(
      epubEvaluationBooks.theory,
      '作者先把自由从任意行动中剥离出来',
      '早先讨论结论：选择必须能被理由说明，才不是任意偏好。',
      'selection_thread',
    ),
  }),
  threadReplyCase({
    id: 'thread-cross-chapter-fiction-ultra',
    title: '跨章节回响：小说超长章',
    description: '第一阶段允许失败，但必须把失败归为 retrieval 缺失，而不是继续调 prompt。',
    book: epubEvaluationBooks.fiction,
    chapterLength: 'ultra_long',
    exact: '渡桥再次出现时',
    userQuestion: '@林知微 这和第一章的灯有什么呼应？',
    requiredEvidence: ['渡桥的灯不是为了照亮路面'],
    p1MayFail: true,
  }),
  chapterRouteCase({
    id: 'route-technical-medium',
    title: '章节路由：技术书中章',
    description: '路由只看 descriptor、preview 和已有摘要，不应假装读完整章正文。',
    book: epubEvaluationBooks.technical,
    chapterLength: 'medium',
    chapterId: 'technical-medium',
    requiredEvidence: ['失败恢复', '成本控制'],
  }),
  segmentAnnotationCase({
    id: 'segment-point-business-ultra',
    title: '自动批注选点：社科/商业超长章',
    description: 'segment-level generation 应在当前 segment 里选择有讨论价值的位置。',
    book: epubEvaluationBooks.socialBusiness,
    chapterLength: 'ultra_long',
    chapterId: 'business-ultra',
    acceptableAnchorExacts: ['第二个可批注点指出', '哪些机会会让团队越来越笨'],
  }),
  segmentAnnotationCase({
    id: 'segment-dedup-theory-ultra',
    title: '去重噪声：哲学/理论超长章',
    description: '长章节多 segment 不应围绕同一句式重复机械总结。',
    book: epubEvaluationBooks.theory,
    chapterLength: 'ultra_long',
    chapterId: 'theory-ultra',
    acceptableAnchorExacts: ['限制如何进入自我理解', '每次承担的论证功能不同'],
  }),
  segmentAnnotationCase({
    id: 'segment-close-fiction-ultra',
    title: '章节收束：小说超长章',
    description: 'chapter trace 应帮助后续 segment 收束章节功能，而不是污染为未证实剧情。',
    book: epubEvaluationBooks.fiction,
    chapterLength: 'ultra_long',
    chapterId: 'fiction-ultra',
    acceptableAnchorExacts: ['重新理解第一章的离开', '每个人的迟疑照得更清楚'],
  }),
];

function buildBook(
  id: string,
  title: string,
  bookType: EpubEvaluationBookType,
  chapters: EpubBookIndexChapterInput[],
): EpubEvaluationBookFixture {
  const ebookIndex = buildEpubBookIndex({
    articleId: id,
    chapters,
    maxSegmentTextLength: 360,
    minSegmentTextLength: 120,
  });
  return {
    id,
    title,
    url: `ebook://${id}`,
    bookType,
    chapters,
    text: epubIndexText(chapters),
    ebookIndex,
  };
}

function selectionAnnotationCase(input: {
  id: string;
  title: string;
  description: string;
  book: EpubEvaluationBookFixture;
  chapterLength: EpubEvaluationChapterLength;
  exact: string;
  requiredEvidence: string[];
  readingMemoryView?: ReadingMemoryView;
}): EpubEvaluationCase {
  const anchor = textAnchor(input.book, input.exact);
  const payload: AgentAnnotatePayload = {
    agentId: agent.id,
    agentUsername: agent.username,
    targetAnchor: anchor,
    article: articleInput(input.book),
    readingMemoryView: input.readingMemoryView,
  };

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    bookType: input.book.bookType,
    chapterLength: input.chapterLength,
    controls: [...epubEvaluationControlGroups],
    input: { taskType: 'selection_annotation', payload },
    expected: {
      acceptableAnchorExacts: [input.exact],
      requiredEvidence: input.requiredEvidence,
      metricRange: anchorRange(anchor),
    },
    allowedFailureLabels: ['context_insufficient', 'selection_mispoint', 'anchor_failure'],
  };
}

function threadReplyCase(input: {
  id: string;
  title: string;
  description: string;
  book: EpubEvaluationBookFixture;
  chapterLength: EpubEvaluationChapterLength;
  exact: string;
  userQuestion: string;
  requiredEvidence: string[];
  p1MayFail?: boolean;
  readingMemoryView?: ReadingMemoryView;
}): EpubEvaluationCase {
  const anchor = textAnchor(input.book, input.exact);
  const originalComment = comment('comment-original', 'ai', '这句是理解后文的入口。');
  const userComment = comment('comment-user', 'user', input.userQuestion);
  const payload: AgentMessagePayload = {
    agentId: agent.id,
    agentUsername: agent.username,
    article: articleInput(input.book),
    annotation: annotation('annotation-thread', anchor, [originalComment, userComment]),
    userComment,
    readingMemoryView: input.readingMemoryView,
  };

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    bookType: input.book.bookType,
    chapterLength: input.chapterLength,
    controls: [...epubEvaluationControlGroups],
    input: { taskType: 'selection_thread_reply', payload },
    expected: {
      acceptableAnchorExacts: [input.exact],
      requiredEvidence: input.requiredEvidence,
      metricRange: anchorRange(anchor),
      p1MayFail: input.p1MayFail,
      retrievalTriggerLabels: input.p1MayFail ? ['retrieval_missing'] : undefined,
    },
    allowedFailureLabels: input.p1MayFail
      ? ['retrieval_missing', 'context_insufficient', 'summary_drift']
      : ['context_insufficient', 'summary_drift'],
  };
}

function chapterRouteCase(input: {
  id: string;
  title: string;
  description: string;
  book: EpubEvaluationBookFixture;
  chapterLength: EpubEvaluationChapterLength;
  chapterId: string;
  requiredEvidence: string[];
}): EpubEvaluationCase {
  const payload: FocusCoReadingRoutePayload = {
    selectedAgentIds: [agent.id],
    article: articleInput(input.book),
    sections: input.book.ebookIndex.chapters.map((chapter) => ({
      sectionId: chapter.id,
      sectionTitle: chapter.title,
      sectionStart: chapter.textStart,
      sectionEnd: chapter.textEnd,
    })),
  };
  const chapter = chapterById(input.book, input.chapterId);

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    bookType: input.book.bookType,
    chapterLength: input.chapterLength,
    controls: [...epubEvaluationControlGroups],
    input: { taskType: 'chapter_route', payload },
    expected: {
      requiredEvidence: input.requiredEvidence,
      metricRange: { textStart: chapter.textStart, textEnd: chapter.textEnd },
    },
    allowedFailureLabels: ['context_insufficient', 'persona_homogenization'],
  };
}

function segmentAnnotationCase(input: {
  id: string;
  title: string;
  description: string;
  book: EpubEvaluationBookFixture;
  chapterLength: EpubEvaluationChapterLength;
  chapterId: string;
  acceptableAnchorExacts: string[];
}): EpubEvaluationCase {
  const chapter = chapterById(input.book, input.chapterId);
  const segmentIds = input.book.ebookIndex.segments
    .filter((segment) => segment.chapterId === chapter.id)
    .map((segment) => segment.id);
  const payload: AgentAnnotatePayload = {
    agentId: agent.id,
    agentUsername: agent.username,
    readingPlan: [
      {
        sectionId: chapter.id,
        sectionTitle: chapter.title,
        sectionStart: chapter.textStart,
        sectionEnd: chapter.textEnd,
        sectionSummary: '评估本章是否能产生有价值且不重复的伴读批注。',
        sectionTag: '评估',
        targetDensity: 'medium',
      },
    ],
    article: articleInput(input.book),
  };

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    bookType: input.book.bookType,
    chapterLength: input.chapterLength,
    controls: [...epubEvaluationControlGroups],
    input: { taskType: 'segment_annotation', payload },
    densityLimitPer1000Chars: 4,
    expected: {
      acceptableAnchorExacts: input.acceptableAnchorExacts,
      metricRange: { textStart: chapter.textStart, textEnd: chapter.textEnd },
      segmentIds,
    },
    allowedFailureLabels: [
      'context_insufficient',
      'summary_drift',
      'trace_pollution',
      'selection_mispoint',
      'persona_homogenization',
      'anchor_failure',
    ],
  };
}

function articleInput(book: EpubEvaluationBookFixture) {
  return {
    title: book.title,
    url: book.url,
    text: book.text,
    ebookIndex: book.ebookIndex,
  };
}

function historicalAnnotationMemoryView(
  book: EpubEvaluationBookFixture,
  exact: string,
  note: string,
  viewType: ReadingMemoryView['viewType'],
): ReadingMemoryView {
  const anchor = textAnchor(book, exact);
  return memoryView(book, viewType, {
    id: `annotation_memory_${book.id}_${anchor.start}`,
    kind: 'reader_signal',
    sourceType: 'annotation',
    sourceAnnotationId: `annotation_${book.id}_${anchor.start}`,
    anchor,
    payload: {
      annotation: {
        author: 'user',
        exact,
        note,
      },
    },
  });
}

function historicalCommentMemoryView(
  book: EpubEvaluationBookFixture,
  exact: string,
  content: string,
  viewType: ReadingMemoryView['viewType'],
): ReadingMemoryView {
  const anchor = textAnchor(book, exact);
  return memoryView(book, viewType, {
    id: `comment_memory_${book.id}_${anchor.start}`,
    kind: 'trace',
    sourceType: 'comment',
    sourceAnnotationId: `annotation_${book.id}_${anchor.start}`,
    sourceCommentId: `comment_${book.id}_${anchor.start}`,
    anchor,
    payload: {
      comment: {
        author: 'user',
        content,
      },
    },
  });
}

function memoryView(
  book: EpubEvaluationBookFixture,
  viewType: ReadingMemoryView['viewType'],
  input: Pick<
    ReadingMemoryView['entries'][number]['entry'],
    'id' | 'kind' | 'sourceType' | 'sourceAnnotationId' | 'sourceCommentId' | 'anchor' | 'payload'
  >,
): ReadingMemoryView {
  return {
    articleId: book.id,
    viewType,
    viewKey: `${book.id}:${viewType}:${input.id}`,
    entries: [
      {
        source: 'structured',
        entry: {
          articleId: book.id,
          scope: 'segment',
          visibility: 'default',
          payloadVersion: 1,
          sourceEntryIds: [],
          createdAt: now,
          updatedAt: now,
          ...input,
        },
      },
    ],
    sourceEntryIds: [input.id],
    updatedAt: now,
  };
}

function textAnchor(book: EpubEvaluationBookFixture, exact: string) {
  const start = book.text.indexOf(exact);
  if (start < 0) throw new Error(`Missing fixture anchor: ${exact}`);
  return createEpubTextAnchor(book.ebookIndex, book.text, start, start + exact.length);
}

function anchorRange(anchor: TextAnchor) {
  return {
    textStart: anchor.textStartInBook ?? anchor.start,
    textEnd: anchor.textEndInBook ?? anchor.end,
  };
}

function chapterById(book: EpubEvaluationBookFixture, chapterId: string) {
  const chapter = book.ebookIndex.chapters.find((item) => item.id === chapterId);
  if (!chapter) throw new Error(`Missing fixture chapter: ${chapterId}`);
  return chapter;
}

function annotation(id: string, anchor: TextAnchor, comments: Comment[]): Annotation {
  return {
    id,
    author: 'ai',
    anchor,
    color: '#6fa48f',
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    comments,
    createdAt: now,
    updatedAt: now,
  };
}

function comment(id: string, author: 'ai' | 'user', content: string): Comment {
  return {
    id,
    author,
    content,
    agentId: author === 'ai' ? agent.id : undefined,
    agentUsername: author === 'ai' ? agent.username : undefined,
    agentNickname: author === 'ai' ? agent.nickname : undefined,
    userUsername: author === 'user' ? 'xingkaixin' : undefined,
    userNickname: author === 'user' ? '行开心' : undefined,
    createdAt: now,
  };
}

function longParagraph(seed: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${seed}（${index + 1}）`).join('');
}
