import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type, type Static, type TSchema } from '@earendil-works/pi-ai';
import {
  defineDoc,
  defineExtension,
  defineTool,
  section,
  type ToolExecutionApi,
  type ToolExecutionResult,
} from '@earendil-works/pi-durable';
import {
  createArticleTextIndex,
  readingMemoryEntrySearchText,
  type ArticleTextBlock,
  type ArticleTextIndex,
} from '@yomitomo/core';
import type { Annotation, ArticleTextSnapshot, ReadingMemoryEntry } from '@yomitomo/shared';
import { formatThread } from './assistant-channel-format';

const MAX_TOOL_CALLS = 20;
const MAX_READ_CHARS = 12_000;
const DEFAULT_LIMIT = 6;
const INDEX_CACHE_SIZE = 8;

export type AssistantRunContext = {
  articleId: string;
  articleTitle: string;
  agentId: string;
  channelId: string;
  visibleRanges: Array<{ textStart: number; textEnd: number }> | null;
  toolCalls: number;
};

export const RunContextDoc = defineDoc<AssistantRunContext>({
  kind: 'yomitomo.run',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'initial',
  initial: () => ({
    articleId: '',
    articleTitle: '',
    agentId: '',
    channelId: '',
    visibleRanges: null,
    toolCalls: 0,
  }),
});

export type AssistantReadingPorts = {
  articleText: (articleId: string) => Promise<ArticleTextSnapshot | undefined>;
  searchMemory: (input: {
    articleId: string;
    query: string;
    limit: number;
    agentId?: string;
    excludeAgentId?: string;
    requireAgentId?: boolean;
  }) => ReadingMemoryEntry[];
  annotations: (articleId: string) => Annotation[];
  agentName: (agentId: string) => string | undefined;
};

export function createAssistantReadingExtension(ports: AssistantReadingPorts) {
  const indexes = new Map<string, { snapshot: ArticleTextSnapshot; index: ArticleTextIndex }>();

  async function articleIndex(run: AssistantRunContext) {
    const snapshot = await ports.articleText(run.articleId);
    if (!snapshot) throw new Error('文章正文尚未同步，请稍后再试。');
    const key = `${run.articleId}:${JSON.stringify(run.visibleRanges)}`;
    const cached = indexes.get(key);
    if (cached?.snapshot === snapshot) return cached.index;
    const index = createArticleTextIndex(snapshot, run.visibleRanges ?? undefined);
    indexes.delete(key);
    indexes.set(key, { snapshot, index });
    if (indexes.size > INDEX_CACHE_SIZE) indexes.delete(indexes.keys().next().value!);
    return index;
  }

  const articleOutline = readingTool({
    name: 'article_outline',
    description:
      '列出当前文章可读范围内的章节目录：章节 id、标题和起始段落 id。需要了解文章结构或定位章节时先调用。',
    parameters: Type.Object({}),
    run: async (_args, run) => {
      const outline = (await articleIndex(run)).outline();
      if (outline.length === 0)
        return '这篇文章没有章节目录，可直接用 search_article 或 read_article 按段落读取。';
      return outline
        .map(
          (item) =>
            `${'  '.repeat(item.depth ?? 0)}- [${item.id}] ${item.title}（起始段落 ${item.firstBlockId}，共 ${item.blockCount} 段）`,
        )
        .join('\n');
    },
  });

  const readArticle = readingTool({
    name: 'read_article',
    description:
      '按章节或段落读取原文，每段带段落 id（如 b12）。三选一：sectionId 读一个章节；fromBlockId 从某段向后连续读；aroundBlockId 读某段前后的上下文。结果过长时会给出继续读取的段落 id。',
    parameters: Type.Object({
      sectionId: Type.Optional(Type.String()),
      fromBlockId: Type.Optional(Type.String()),
      aroundBlockId: Type.Optional(Type.String()),
      maxChars: Type.Optional(Type.Integer({ minimum: 500, maximum: MAX_READ_CHARS })),
    }),
    run: async (args, run) => {
      const index = await articleIndex(run);
      const maxChars = args.maxChars ?? 6000;
      if (args.sectionId) {
        const read = index.readSection(args.sectionId, args.fromBlockId, maxChars);
        if (!read) throw new Error(`没有找到章节 ${args.sectionId}，先调用 article_outline。`);
        return formatRead(read.blocks, read.nextBlockId);
      }
      if (args.fromBlockId) {
        const read = index.readBlocks(args.fromBlockId, maxChars);
        if (!read) throw new Error(`段落 ${args.fromBlockId} 不存在或不在可读范围内。`);
        return formatRead(read.blocks, read.nextBlockId);
      }
      if (args.aroundBlockId) {
        const block = index.readBlocks(args.aroundBlockId, 1)?.blocks[0];
        if (!block) throw new Error(`段落 ${args.aroundBlockId} 不存在或不在可读范围内。`);
        return formatRead(index.around(block.start, maxChars).blocks);
      }
      throw new Error('需要 sectionId、fromBlockId 或 aroundBlockId 之一。');
    },
  });

  const searchArticle = readingTool({
    name: 'search_article',
    description:
      '在当前文章可读范围内按关键词检索原文段落，返回段落 id、所属章节和段落全文。需要找同一概念在别处的展开或补充原文证据时使用。',
    parameters: Type.Object({
      query: Type.String({ minLength: 1 }),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
    }),
    run: async (args, run) => {
      const hits = (await articleIndex(run)).search(args.query, args.limit ?? DEFAULT_LIMIT);
      if (hits.length === 0) return `没有找到与「${args.query}」相关的段落。`;
      return hits
        .map(
          (hit) =>
            `[${hit.block.id}]${hit.section ? ` §${hit.section.title}` : ''}\n${hit.block.text}`,
        )
        .join('\n\n');
    },
  });

  const searchMemory = readingTool({
    name: 'search_reading_memory',
    description:
      '检索当前文章里已有的批注、想法和讨论（包括其他讨论串）。author 可选 self（只看你自己的）、others（其他助手）或 all（默认，含读者）。结果带批注 id 和评论 id，可用 read_thread 读取完整讨论串。',
    parameters: Type.Object({
      query: Type.String({ minLength: 1 }),
      author: Type.Optional(
        Type.Union([Type.Literal('all'), Type.Literal('self'), Type.Literal('others')]),
      ),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }),
    run: async (args, run) => {
      const entries = ports.searchMemory({
        articleId: run.articleId,
        query: args.query,
        limit: args.limit ?? DEFAULT_LIMIT,
        ...(args.author === 'self' ? { agentId: run.agentId } : {}),
        ...(args.author === 'others' ? { excludeAgentId: run.agentId, requireAgentId: true } : {}),
      });
      if (entries.length === 0) return `没有找到与「${args.query}」相关的阅读记忆。`;
      return entries.map((entry) => formatMemoryEntry(entry, run, ports)).join('\n');
    },
  });

  const readThread = readingTool({
    name: 'read_thread',
    description:
      '读取一条批注的原文和讨论串全文。threadId 是讨论串根评论 id；省略时读取该批注下的全部讨论串。',
    parameters: Type.Object({
      annotationId: Type.String({ minLength: 1 }),
      threadId: Type.Optional(Type.String()),
    }),
    run: async (args, run) => {
      const annotation = ports
        .annotations(run.articleId)
        .find((item) => item.id === args.annotationId);
      if (!annotation) throw new Error(`没有找到批注 ${args.annotationId}。`);
      return formatThread(annotation, args.threadId, run.agentId);
    },
  });

  return defineExtension({
    name: 'yomitomo-reading',
    tools: [articleOutline, readArticle, searchArticle, searchMemory, readThread],
    sections: [
      section('reading-tools', async (input) => {
        const run = await input.read.snapshot(
          RunContextDoc,
          input.conversationId,
          BACKGROUND_CONTEXT,
        );
        return [
          run?.articleTitle ? `当前文章：《${run.articleTitle}》` : '',
          '你看不到文章全文，需要时用工具按章节、段落或关键词读取原文，用 search_reading_memory 和 read_thread 查已有批注与讨论。',
          '读者的划线可能只是半句或几个词。回答前先用 read_article 的 aroundBlockId 读划线所在段落和前后文，不够再继续读或检索，不要让读者替你提供原文。',
          '工具只返回读者已读范围内的内容；不要猜测或透露范围之外的情节。',
          '引用原文时直接引用原句，不要编造原文，不要把段落 id 写进回复。',
          `一次回复最多调用 ${MAX_TOOL_CALLS} 次工具，信息足够时就直接回答。`,
        ]
          .filter(Boolean)
          .join('\n');
      }),
    ],
  });
}

function readingTool<TParameters extends TSchema>(tool: {
  name: string;
  description: string;
  parameters: TParameters;
  run: (args: Static<TParameters>, run: AssistantRunContext) => Promise<string>;
}) {
  return defineTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    replay: 'safe',
    execute: async (args, api, context) => {
      const run = await countToolCall(api, context);
      if (run.toolCalls > MAX_TOOL_CALLS) {
        return textResult('工具调用次数已用完，请基于已获得的信息直接回复。', true);
      }
      return textResult(await tool.run(args, run));
    },
  });
}

function countToolCall(api: ToolExecutionApi, context: Parameters<ToolExecutionApi['commit']>[1]) {
  return api.commit(async (tx) => {
    const run = await tx.doc(RunContextDoc, api.conversationId);
    run.toolCalls += 1;
    // Nested doc values are overlays that throw once the commit settles, so copy them out.
    return {
      ...run,
      visibleRanges:
        run.visibleRanges?.map(({ textStart, textEnd }) => ({ textStart, textEnd })) ?? null,
    };
  }, context);
}

function textResult(text: string, isError = false): ToolExecutionResult {
  return { output: [{ type: 'text', text }], isError };
}

function formatRead(blocks: ArticleTextBlock[], nextBlockId?: string) {
  if (blocks.length === 0) return '这里没有可读内容（可能超出读者已读范围）。';
  const text = blocks.map((block) => `[${block.id}] ${block.text}`).join('\n\n');
  return nextBlockId ? `${text}\n\n（未读完，继续读取请用 fromBlockId=${nextBlockId}）` : text;
}

function formatMemoryEntry(
  entry: ReadingMemoryEntry,
  run: AssistantRunContext,
  ports: AssistantReadingPorts,
) {
  const author = !entry.agentId
    ? '读者'
    : entry.agentId === run.agentId
      ? '你自己'
      : (ports.agentName(entry.agentId) ?? '其他助手');
  const refs = [
    entry.sourceAnnotationId ? `批注 ${entry.sourceAnnotationId}` : '',
    entry.sourceCommentId ? `评论 ${entry.sourceCommentId}` : '',
  ]
    .filter(Boolean)
    .join('，');
  const text = readingMemoryEntrySearchText(entry) || entry.kind;
  return `- ${author}${refs ? `（${refs}）` : ''}：${text}`;
}
