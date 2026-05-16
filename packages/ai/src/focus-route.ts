import type {
  Agent,
  AgentAnnotationDensity,
  ChapterDescriptor,
  ChapterRouteContext,
  EpubBookIndex,
  EpubChapterIndex,
  FocusCoReadingRoutePayload,
  FocusCoReadingRouteResult,
} from '@yomitomo/shared';
import { packReadingContext } from './context-packing';
import { booleanValue, parseJsonObject, stringValue, uniqueStrings } from './json';
import { buildAgentRoleCard } from './agent-role-card';

const ROUTE_PREVIEW_LIMIT = 180;
const ROUTE_PACK_TOKEN_BUDGET = 3600;

export function buildFocusCoReadingRoutePrompt(
  payload: FocusCoReadingRoutePayload,
  agents: Agent[],
) {
  const routeAgents = agents.map((agent) => ({
    agentId: agent.id,
    agentUsername: agent.username,
    nickname: agent.nickname,
    roleCard: buildAgentRoleCard(agent),
  }));
  if (payload.article.ebookIndex) {
    return buildEpubFocusCoReadingRoutePrompt(payload, agents, routeAgents);
  }

  return `文章标题：${payload.article.title}
文章 URL：${payload.article.url}

可分配助手：
${JSON.stringify(routeAgents, null, 2)}

章节清单：
${JSON.stringify(webRouteSections(payload), null, 2)}

请返回 JSON 对象，字段如下：
{
  "sections": [
    {
      "sectionId": "来自章节清单的 sectionId",
      "summary": "一句话说明该章节在说什么",
      "tag": "2 到 6 个字的内容标签",
      "agentIds": ["来自可分配助手的 agentId"]
    }
  ]
}

路由规则：
- agentIds 只使用可分配助手里的 agentId。
- 每个章节可以返回空数组，也可以分配多位助手，按内容需要决定。
- 内容密度低、过渡性强、重复说明的章节可以返回空数组。
- 论证型章节优先给擅长逻辑、前提、因果和反证的助手。
- 概念型章节优先给擅长解释术语、背景和定义的助手。
- 结构型章节优先给擅长梳理全文位置和章节功能的助手。
- 沉淀型章节优先给擅长提炼要点、金句和可迁移洞见的助手。
- 分配要尊重助手角色卡，避免把所有助手集中到同一章节。

只返回 JSON。`;
}

export function parseFocusCoReadingRouteResult(
  content: string,
  payload: FocusCoReadingRoutePayload,
  agents: Pick<Agent, 'id'>[],
): FocusCoReadingRouteResult {
  const parsed = parseJsonObject(content);
  const sectionRows = Array.isArray(parsed.sections) ? parsed.sections : [];
  const sectionIds = new Set([
    ...payload.sections.map((section) => section.sectionId),
    ...(payload.article.ebookIndex
      ? epubRouteSections(payload).map((section) => section.sectionId)
      : []),
    ...(payload.article.ebookIndex?.chapters.map((chapter) => chapter.id) || []),
  ]);
  const agentIds = new Set(agents.map((agent) => agent.id));
  const seen = new Set<string>();
  const sections: FocusCoReadingRouteResult['sections'] = [];

  for (const item of sectionRows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const sectionId = stringValue(row.sectionId);
    if (!sectionId || !sectionIds.has(sectionId) || seen.has(sectionId)) continue;
    seen.add(sectionId);
    const rawAgentIds = Array.isArray(row.agentIds)
      ? row.agentIds
      : Array.isArray(row.assignedAgentIds)
        ? row.assignedAgentIds
        : [];
    const assignedAgentIds = uniqueStrings(rawAgentIds.map((value) => stringValue(value))).filter(
      (agentId) => agentIds.has(agentId),
    );
    const routeSection: FocusCoReadingRouteResult['sections'][number] = {
      sectionId,
      summary: stringValue(row.summary) || undefined,
      tag: stringValue(row.tag) || undefined,
      agentIds: assignedAgentIds,
    };
    const targetDensity = normalizeRouteTargetDensity(row.targetDensity);
    const needsFurtherPlanning = booleanValue(row.needsFurtherPlanning);
    if (targetDensity) routeSection.targetDensity = targetDensity;
    if (needsFurtherPlanning !== undefined)
      routeSection.needsFurtherPlanning = needsFurtherPlanning;
    sections.push(routeSection);
  }

  return { sections };
}

function buildEpubFocusCoReadingRoutePrompt(
  payload: FocusCoReadingRoutePayload,
  agents: Agent[],
  routeAgents: Array<{
    agentId: string;
    agentUsername: string;
    nickname: string;
    roleCard: string;
  }>,
) {
  const routeContext = buildChapterRouteContext(payload, agents);
  const packed = packReadingContext(routeContext);
  const sections = epubRouteSections(payload);
  const contextBlocks = packed.blocks.map((block) => ({
    id: block.id,
    source: block.source,
    text: block.text,
  }));

  return `书籍标题：${payload.article.title}
作者：${payload.article.byline || '未知'}
语言：${payload.article.ebookMetadata?.language || '未知'}
出版方：${payload.article.ebookMetadata?.publisher || '未知'}
文件名：${payload.article.ebookMetadata?.fileName || '未知'}
章节数：${payload.article.ebookIndex?.chapters.length || sections.length}
全文长度：${payload.article.ebookIndex?.textLength || 0} 字符
${payload.readerGoal ? `用户共读目标：${payload.readerGoal}\n` : ''}
可分配助手：
${JSON.stringify(routeAgents, null, 2)}

章节 descriptors：
${JSON.stringify(sections, null, 2)}

压缩后的 chapter_route context：
${JSON.stringify(contextBlocks, null, 2)}

请返回 JSON 对象，字段如下：
{
  "sections": [
    {
      "sectionId": "来自章节 descriptors 的 sectionId",
      "chapterId": "来自章节 descriptors 的 chapterId",
      "chapterTitle": "来自章节 descriptors 的 chapterTitle",
      "summary": "一句话说明该章节可能承担的内容功能；信息不足时写结构判断，不要编造剧情",
      "tag": "2 到 6 个字的内容标签",
      "agentIds": ["来自可分配助手的 agentId"],
      "targetDensity": "low | medium | high",
      "needsFurtherPlanning": true
    }
  ]
}

路由规则：
- 只能基于书籍元数据、目录顺序、章节标题、章节长度、preview 和已有 summary 做章节级编排。
- 不要假装读过未提供的整章正文，也不要补写 preview 之外的情节或论证。
- agentIds 只使用可分配助手里的 agentId；字段名如果写 assignedAgentIds 也必须同样只包含这些 id。
- 每个章节可以返回空数组，也可以分配多位助手，按内容需要决定。
- 内容密度低、过渡性强、重复说明的章节可以返回空数组，并把 targetDensity 设为 low。
- preview 或已有 summary 显示章节内部跨度很大时，needsFurtherPlanning 设为 true；短章节或功能明确的章节可设为 false。
- 论证型章节优先给擅长逻辑、前提、因果和反证的助手。
- 概念型章节优先给擅长解释术语、背景和定义的助手。
- 结构型章节优先给擅长梳理全文位置和章节功能的助手。
- 沉淀型章节优先给擅长提炼要点、金句和可迁移洞见的助手。
- 分配要尊重助手角色卡，避免把所有助手集中到同一章节。

只返回 JSON。`;
}

function webRouteSections(payload: FocusCoReadingRoutePayload) {
  return payload.sections.map((section, index) => ({
    index: index + 1,
    sectionId: section.sectionId,
    sectionTitle: section.sectionTitle,
    text: compactRouteSectionText(
      payload.article.text.slice(section.sectionStart, section.sectionEnd),
    ),
  }));
}

function epubRouteSections(payload: FocusCoReadingRoutePayload) {
  const ebookIndex = payload.article.ebookIndex;
  if (!ebookIndex) return [];
  const chapters =
    ebookIndex.chapters.length > 0 ? ebookIndex.chapters : fallbackRouteChapters(payload);
  if (payload.sections.length === 0) {
    return chapters.map((chapter) =>
      epubRouteSectionDescriptor(
        payload,
        chapter,
        chapter.id,
        normalizedChapterTitle(chapter.title, chapter.indexInBook),
      ),
    );
  }
  return payload.sections.map((section, sectionIndex) => {
    const chapter = routeChapterForSection(chapters, section, sectionIndex);
    return epubRouteSectionDescriptor(payload, chapter, section.sectionId, section.sectionTitle);
  });
}

function buildChapterRouteContext(
  payload: FocusCoReadingRoutePayload,
  agents: Agent[],
): ChapterRouteContext {
  const ebookIndex = payload.article.ebookIndex as EpubBookIndex;
  const toc = epubRouteSections(payload).map<ChapterDescriptor>((section) => ({
    chapterId: section.chapterId,
    title: section.chapterTitle,
    indexInBook: section.index - 1,
    textLength: section.textLength,
    segmentCount: section.segmentCount,
    previewStart: section.previewStart,
    previewEnd: section.previewEnd,
    existingSummary: section.existingSummary,
    source: {
      type: 'toc',
      articleId: ebookIndex.articleId,
      chapterId: section.chapterId,
      source: 'epub-index',
    },
  }));
  return {
    task: 'chapter_route' as const,
    book: {
      articleId: ebookIndex.articleId,
      title: payload.article.title,
      url: payload.article.url,
      sourceType: 'ebook' as const,
      textLength: ebookIndex.textLength,
      ebookIndex,
    },
    location: {
      readerProgress: payload.readerProgress,
    },
    budget: {
      maxTokens: ROUTE_PACK_TOKEN_BUDGET,
      blockTypeOrder: ['reader_goal', 'toc', 'chapter_memory', 'agent_role'],
      reserveTokensByType: {
        agent_role: 900,
      },
    },
    evidencePolicy: {
      spoilerPolicy: payload.spoilerPolicy || {
        allowedScope: 'whole-book' as const,
        allowFutureChapterEvidence: true,
        allowFuturePlotEvents: false,
      },
      allowedSourceTypes: ['reader_goal', 'toc', 'chapter_memory', 'agent_role'],
    },
    readerGoal: payload.readerGoal,
    toc,
    agents: agents.map((agent) => ({
      agentId: agent.id,
      agentUsername: agent.username,
      nickname: agent.nickname,
      roleCard: buildAgentRoleCard(agent),
      source: {
        type: 'agent_role' as const,
        source: 'selected-agent',
      },
    })),
  };
}

function fallbackRouteChapters(payload: FocusCoReadingRoutePayload): EpubChapterIndex[] {
  return payload.sections.length > 0
    ? payload.sections.map((section, index) => ({
        id: section.sectionId,
        title: section.sectionTitle,
        indexInBook: index,
        textStart: section.sectionStart,
        textEnd: section.sectionEnd,
        textLength: Math.max(0, section.sectionEnd - section.sectionStart),
        previewStart: '',
        previewEnd: '',
        segmentIds: [],
        paragraphIds: [],
      }))
    : [
        {
          id: 'book',
          title: payload.article.title || '正文',
          indexInBook: 0,
          textStart: 0,
          textEnd: payload.article.ebookIndex?.textLength || payload.article.text.length,
          textLength: payload.article.ebookIndex?.textLength || payload.article.text.length,
          previewStart: '',
          previewEnd: '',
          segmentIds: [],
          paragraphIds: [],
        },
      ];
}

function routeChapterForSection(
  chapters: EpubChapterIndex[],
  section: FocusCoReadingRoutePayload['sections'][number],
  index: number,
) {
  return (
    chapters.find((chapter) => chapter.id === section.sectionId) ||
    chapters.find(
      (chapter) => section.sectionStart < chapter.textEnd && section.sectionEnd > chapter.textStart,
    ) ||
    chapters[index] ||
    chapters[0]
  );
}

function epubRouteSectionDescriptor(
  payload: FocusCoReadingRoutePayload,
  chapter: EpubChapterIndex,
  sectionId: string,
  sectionTitle: string,
) {
  const summary = existingChapterSummary(payload, chapter.id, sectionId);
  return {
    index: chapter.indexInBook + 1,
    sectionId,
    chapterId: chapter.id,
    chapterTitle: normalizedChapterTitle(chapter.title || sectionTitle, chapter.indexInBook),
    textLength: chapter.textLength,
    segmentCount: chapter.segmentIds.length,
    previewStart: compactRoutePreview(chapter.previewStart),
    previewEnd: compactRoutePreview(chapter.previewEnd),
    existingSummary: summary?.summary,
    existingTag: summary?.tag,
  };
}

function existingChapterSummary(
  payload: FocusCoReadingRoutePayload,
  chapterId: string,
  sectionId: string,
) {
  return payload.chapterSummaries?.find(
    (summary) => summary.chapterId === chapterId || summary.sectionId === sectionId,
  );
}

function normalizedChapterTitle(title: string, indexInBook: number) {
  const normalized = title.trim();
  return normalized || `第 ${indexInBook + 1} 章`;
}

function compactRouteSectionText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 1200) return normalized;
  return `${normalized.slice(0, 900)}……${normalized.slice(-240)}`;
}

function compactRoutePreview(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= ROUTE_PREVIEW_LIMIT) return normalized;
  return `${normalized.slice(0, ROUTE_PREVIEW_LIMIT)}…`;
}

function normalizeRouteTargetDensity(value: unknown): AgentAnnotationDensity | undefined {
  return value === 'low' || value === 'medium' || value === 'high' ? value : undefined;
}
