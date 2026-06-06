import type { Agent, AgentKind, Annotation, ArticleSummaryRecord } from '@yomitomo/shared';
import { annotationPrimaryComment } from '@yomitomo/core';
import i18next from 'i18next';

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
  assistant?: DailyQuoteAssistant;
};

export type DailyQuoteAssistant = {
  id: string;
  kind: AgentKind;
  name: string;
  avatar: string;
};

type DailyQuoteStorageState = {
  date: string;
  currentId: string;
  seenIds: string[];
  assistantId?: string;
};

type DailyQuoteStorage = Pick<Storage, 'getItem' | 'setItem'>;

type SelectDailyQuoteOptions = {
  now?: Date;
  random?: () => number;
  storage?: DailyQuoteStorage | null;
  personalThreshold?: number;
  agents?: Agent[];
};

const dailyQuoteStorageKey = 'yomitomo:daily-quote';
const defaultPersonalQuoteThreshold = 12;

const fallbackBuiltinDailyQuoteTexts = [
  'Keep what you read, and future judgment has somewhere to begin.',
] as const;

export function builtinDailyQuotes(): DailyQuoteCandidate[] {
  const resource = i18next.t('dailyQuote.builtin', {
    returnObjects: true,
    defaultValue: fallbackBuiltinDailyQuoteTexts,
  });
  const texts = Array.isArray(resource)
    ? resource.filter((text): text is string => typeof text === 'string' && text.length > 0)
    : fallbackBuiltinDailyQuoteTexts;

  return texts.map(
    (text, index): DailyQuoteCandidate => ({ id: `builtin:${index}`, text, source: 'builtin' }),
  );
}

export function selectDailyQuote(
  articles: ArticleSummaryRecord[],
  options: SelectDailyQuoteOptions = {},
): DailyQuote {
  const now = options.now || new Date();
  const random = options.random || Math.random;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const personalThreshold = options.personalThreshold ?? defaultPersonalQuoteThreshold;
  const personalCandidates = collectDailyQuoteCandidates(articles);
  const assistantCandidates = collectDailyQuoteAssistants(options.agents || []);
  const builtins = builtinDailyQuotes();
  const candidates =
    personalCandidates.length >= personalThreshold
      ? [...personalCandidates, ...builtins]
      : builtins;
  const today = localDateKey(now);
  const stored = readDailyQuoteState(storage);
  const current = candidates.find((candidate) => candidate.id === stored?.currentId);

  if (stored?.date === today && current) {
    const assistant =
      storedAssistant(assistantCandidates, stored) ||
      pickAssistant(assistantCandidates, undefined, random);
    if (assistantCandidates.length > 0 && assistant?.id !== stored.assistantId) {
      writeDailyQuoteState(storage, {
        ...stored,
        assistantId: assistant?.id,
      });
    }
    return toDailyQuote(current, now, assistant);
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const seenIds = new Set((stored?.seenIds || []).filter((id) => candidateIds.has(id)));
  let availableCandidates = candidates.filter((candidate) => !seenIds.has(candidate.id));

  if (availableCandidates.length === 0) {
    seenIds.clear();
    availableCandidates = candidates;
  }

  const selected = pickCandidate(availableCandidates, random);
  const assistant =
    stored?.date === today
      ? storedAssistant(assistantCandidates, stored) ||
        pickAssistant(assistantCandidates, undefined, random)
      : pickAssistant(assistantCandidates, stored?.assistantId, random);
  seenIds.add(selected.id);
  writeDailyQuoteState(storage, {
    date: today,
    currentId: selected.id,
    seenIds: [...seenIds],
    assistantId: assistant?.id,
  });

  return toDailyQuote(selected, now, assistant);
}

export function collectDailyQuoteCandidates(
  articles: ArticleSummaryRecord[],
): DailyQuoteCandidate[] {
  return articles.flatMap((article) =>
    article.annotations.flatMap((annotation) => dailyQuoteCandidate(annotation)),
  );
}

export function collectDailyQuoteAssistants(agents: Agent[]): DailyQuoteAssistant[] {
  return agents
    .filter((agent) => agent.kind === 'annotation' || agent.kind === 'review')
    .map((agent) => ({
      id: agent.id,
      kind: agent.kind,
      name:
        agent.nickname ||
        agent.username ||
        i18next.t('common.assistant', { defaultValue: 'Assistant' }),
      avatar: agent.avatar,
    }));
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
          ? annotation.agentNickname ||
            annotation.agentUsername ||
            i18next.t('common.assistant', { defaultValue: 'Assistant' })
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

function toDailyQuote(
  candidate: DailyQuoteCandidate,
  now: Date,
  assistant?: DailyQuoteAssistant,
): DailyQuote {
  return {
    title: i18next.t('dailyQuote.title', { defaultValue: 'Daily quote' }),
    meta: quoteMeta(candidate, now),
    text: candidate.text,
    ...(assistant ? { assistant } : {}),
  };
}

function quoteMeta(candidate: DailyQuoteCandidate, now: Date) {
  if (candidate.source === 'builtin' || !candidate.createdAt) return '';

  const date = formatDailyQuoteDate(candidate.createdAt, now);
  if (candidate.source === 'ai') {
    return i18next.t('dailyQuote.meta.fromAgent', {
      agentName:
        candidate.agentName || i18next.t('common.assistant', { defaultValue: 'Assistant' }),
      date,
      defaultValue: 'From {{agentName}} · {{date}} saved',
    });
  }
  return i18next.t('dailyQuote.meta.savedOn', {
    date,
    defaultValue: '{{date}} saved',
  });
}

function pickCandidate(candidates: DailyQuoteCandidate[], random: () => number) {
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}

function pickAssistant(
  candidates: DailyQuoteAssistant[],
  previousId: string | undefined,
  random: () => number,
) {
  if (candidates.length === 0) return undefined;

  const available =
    candidates.length > 1
      ? candidates.filter((candidate) => candidate.id !== previousId)
      : candidates;
  return pickAssistantCandidate(available.length > 0 ? available : candidates, random);
}

function pickAssistantCandidate(candidates: DailyQuoteAssistant[], random: () => number) {
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}

function storedAssistant(candidates: DailyQuoteAssistant[], stored: DailyQuoteStorageState | null) {
  return candidates.find((candidate) => candidate.id === stored?.assistantId);
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
      assistantId: typeof parsed.assistantId === 'string' ? parsed.assistantId : undefined,
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
