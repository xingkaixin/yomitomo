import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import { annotationPrimaryComment } from '@yomitomo/core';

type DailyQuoteSource = 'builtin' | 'user' | 'ai';

type DailyQuoteCandidate = {
  id: string;
  text: string;
  source: DailyQuoteSource;
  createdAt?: string;
  agentName?: string;
};

export type DailyQuote = {
  title: string;
  meta: string;
  text: string;
};

type DailyQuoteStorageState = {
  date: string;
  currentId: string;
  seenIds: string[];
};

type DailyQuoteStorage = Pick<Storage, 'getItem' | 'setItem'>;

type SelectDailyQuoteOptions = {
  now?: Date;
  random?: () => number;
  storage?: DailyQuoteStorage | null;
  personalThreshold?: number;
};

const dailyQuoteStorageKey = 'yomitomo:daily-quote';
const defaultPersonalQuoteThreshold = 12;

export const builtinDailyQuotes = [
  '把读过的东西留下来，未来的判断才有来处。',
  '好的笔记，是未来的自己能接住的线索。',
  '阅读的收益，常常藏在第二次回看里。',
  '一个清楚的问题，能照亮一整段材料。',
  '真正留下来的理解，会改变下一次选择。',
  '把判断写下来，时间会帮你校准它。',
  '批注是阅读现场留下的路标。',
  '思考需要入口，批注就是入口。',
  '读得慢一点，留下的东西会更硬。',
  '把注意力放回证据，判断会更稳。',
  '好句子会让旧问题出现新角度。',
  '理解从问题开始，记忆从线索留下。',
  '一条批注，给未来保留一个入口。',
  '读完能复用，阅读才真正进入生活。',
  '把模糊处标出来，下一步才清楚。',
  '知识会散，线索能把它重新聚起来。',
  '好的阅读，会让你更会提问。',
  '每次停笔，都是在给理解定锚。',
  '一个判断的价值，取决于它能否回到证据。',
  '留下当时的疑问，就是留下继续思考的方向。',
  '阅读积累的核心，是可回看的判断。',
  '把灵感写短，才方便日后拿起。',
  '批注让阅读从经过变成沉淀。',
  '越具体的记录，越容易在未来复活。',
  '读书的节奏，可以由问题来带。',
  '能被复述的理解，才开始真正属于你。',
  '今天的一句话，可能是下次判断的支点。',
  '阅读会过去，线索会留下。',
  '好问题让资料开始回应你。',
  '把当下的直觉保存下来，未来才有比较。',
  '思想需要容器，笔记就是最小的容器。',
  '读到动心处，给它一个清楚的位置。',
  '理解会逐步完成，也需要回访。',
  '一条短批注，也能保存一个长思路。',
  '把材料拆开，判断会自然变清楚。',
  '阅读的深度，来自反复回到关键处。',
  '记录让偶然的触动变成可用的素材。',
  '好的摘录，会替未来节省一次寻找。',
  '把证据和感受放在一起，记忆会更牢。',
  '读者的成长，藏在每次校准里。',
  '让一句话留下，是给未来一次提醒。',
  '批注越具体，回看时越容易接上。',
  '当时的判断，日后会成为对话对象。',
  '可迁移的句子，值得被认真保存。',
  '把问题留在原处，答案更容易回来。',
  '阅读训练判断，也整理信息来源。',
  '好笔记会保留当时的上下文。',
  '每次回看，都是一次新的阅读。',
  '把重要的句子摘出来，思考就有了抓手。',
  '真正有用的记录，能在别处继续发光。',
  '短句适合保存判断，长文适合展开证据。',
  '阅读留下痕迹，理解才有路径。',
  '把一个想法写准，比写多更重要。',
  '好的批注，会把盲区推远一点。',
  '今天的疑问，可能是明天的主题。',
  '让材料和判断同框，复盘才有依据。',
  '一句被保存的话，会改变下一次重读。',
  '读到关键处停一下，理解会更扎实。',
  '笔记的价值，来自它能被再次使用。',
  '把过去的思考放在眼前，今天会读得更深。',
].map((text, index): DailyQuoteCandidate => ({ id: `builtin:${index}`, text, source: 'builtin' }));

export function selectDailyQuote(
  articles: ArticleRecord[],
  options: SelectDailyQuoteOptions = {},
): DailyQuote {
  const now = options.now || new Date();
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const personalThreshold = options.personalThreshold ?? defaultPersonalQuoteThreshold;
  const personalCandidates = collectDailyQuoteCandidates(articles);
  const candidates =
    personalCandidates.length >= personalThreshold
      ? [...personalCandidates, ...builtinDailyQuotes]
      : builtinDailyQuotes;
  const today = localDateKey(now);
  const stored = readDailyQuoteState(storage);
  const current = candidates.find((candidate) => candidate.id === stored?.currentId);

  if (stored?.date === today && current) return toDailyQuote(current, now);

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const seenIds = new Set((stored?.seenIds || []).filter((id) => candidateIds.has(id)));
  let availableCandidates = candidates.filter((candidate) => !seenIds.has(candidate.id));

  if (availableCandidates.length === 0) {
    seenIds.clear();
    availableCandidates = candidates;
  }

  const selected = pickCandidate(availableCandidates, options.random || Math.random);
  seenIds.add(selected.id);
  writeDailyQuoteState(storage, {
    date: today,
    currentId: selected.id,
    seenIds: [...seenIds],
  });

  return toDailyQuote(selected, now);
}

export function collectDailyQuoteCandidates(articles: ArticleRecord[]): DailyQuoteCandidate[] {
  return articles.flatMap((article) =>
    article.annotations.flatMap((annotation) => dailyQuoteCandidate(annotation)),
  );
}

export function formatDailyQuoteDate(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (date.getFullYear() === now.getFullYear()) return `${month}/${day}`;
  return `${date.getFullYear()}/${month}/${day}`;
}

function dailyQuoteCandidate(annotation: Annotation): DailyQuoteCandidate[] {
  if (annotation.annotationType !== 'quote') return [];

  const primaryComment = annotationPrimaryComment(annotation);
  const text =
    normalizeDailyQuoteText(primaryComment?.content || '') ||
    normalizeDailyQuoteText(annotation.anchor.exact);

  if (!text) return [];

  return [
    {
      id: `annotation:${annotation.id}`,
      text,
      source: annotation.author,
      createdAt: annotation.createdAt,
      agentName:
        annotation.author === 'ai'
          ? annotation.agentNickname || annotation.agentUsername || '助手'
          : undefined,
    },
  ];
}

function normalizeDailyQuoteText(value: string) {
  const text = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const length = Array.from(text).length;

  if (length < 8 || length > 72) return '';
  if (/https?:\/\//.test(text)) return '';
  return text;
}

function toDailyQuote(candidate: DailyQuoteCandidate, now: Date): DailyQuote {
  return {
    title: '今日一句',
    meta: quoteMeta(candidate, now),
    text: candidate.text,
  };
}

function quoteMeta(candidate: DailyQuoteCandidate, now: Date) {
  if (candidate.source === 'builtin' || !candidate.createdAt) return '';

  const date = formatDailyQuoteDate(candidate.createdAt, now);
  if (candidate.source === 'ai') return `来自${candidate.agentName || '助手'} · ${date} 记下`;
  return `${date} 记下`;
}

function pickCandidate(candidates: DailyQuoteCandidate[], random: () => number) {
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readDailyQuoteState(storage: DailyQuoteStorage | null): DailyQuoteStorageState | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(dailyQuoteStorageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DailyQuoteStorageState>;
    if (
      typeof parsed.date !== 'string' ||
      typeof parsed.currentId !== 'string' ||
      !Array.isArray(parsed.seenIds)
    ) {
      return null;
    }

    return {
      date: parsed.date,
      currentId: parsed.currentId,
      seenIds: parsed.seenIds.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return null;
  }
}

function writeDailyQuoteState(storage: DailyQuoteStorage | null, state: DailyQuoteStorageState) {
  try {
    storage?.setItem(dailyQuoteStorageKey, JSON.stringify(state));
  } catch {
    return;
  }
}

function browserStorage(): DailyQuoteStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}
