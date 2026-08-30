import type { LlmProvider, ReadingEvidence, ReadingJudgmentInput } from '@yomitomo/shared';
import { articleTextInputLimit } from '../provider/budget';

const inputLimits = {
  'reading-relations': { evidence: 3, bytes: 3000 },
  'library-answer': { evidence: 12, bytes: 6000 },
  'evidence-comparison': { evidence: 6, bytes: 4000 },
} satisfies Record<ReadingJudgmentInput['kind'], { evidence: number; bytes: number }>;

const encoder = new TextEncoder();
const paragraphByteLimit = 1200;

type RemoteEvidence = {
  id: string;
  kind: 'user_judgment' | 'ai_discussion' | 'distillation' | 'source';
  text: string;
  excerpt?: string;
};

type EvidenceInput = Omit<RemoteEvidence, 'id'> & { source: ReadingEvidence };

type PreparedReadingJudgmentInput = {
  user: string;
  sent: Map<string, ReadingEvidence>;
  truncated: boolean;
};

export function prepareReadingJudgmentInput(
  provider: LlmProvider,
  input: ReadingJudgmentInput,
  evidence: readonly ReadingEvidence[],
): PreparedReadingJudgmentInput | null {
  const limits = inputLimits[input.kind];
  const byteLimit = Math.min(limits.bytes, articleTextInputLimit(provider, 'agent-message'));
  const query = queryInput(input);
  if (Object.values(query).some((value) => value.length > byteLimit)) return null;
  const required =
    input.kind === 'reading-relations'
      ? input.selection
      : input.kind === 'library-answer'
        ? input.question
        : input.judgment;
  if (!required.trim()) return null;

  const baseBytes = jsonByteLength({ kind: input.kind, input: query, evidence: [] });
  if (baseBytes >= byteLimit) return null;
  const selected = selectEvidence(evidence, limits.evidence, byteLimit);
  if (selected.items.length === 0) return null;
  let truncated = selected.truncated;

  if (input.kind === 'reading-relations' && input.paragraph !== undefined) {
    const overhead = jsonByteLength({ ...query, paragraph: '' }) - jsonByteLength(query);
    const allowance = Math.floor((byteLimit - baseBytes) / (selected.items.length + 1));
    const paragraph = clipJsonText(
      input.paragraph,
      Math.min(paragraphByteLimit - 2, allowance - overhead),
    );
    if (paragraph) query.paragraph = paragraph;
    truncated ||= paragraph !== input.paragraph;
  }

  let packed = packEvidence(input.kind, query, selected.items, byteLimit);
  if (!packed && query.paragraph) {
    delete query.paragraph;
    truncated = true;
    packed = packEvidence(input.kind, query, selected.items, byteLimit);
  }
  return packed ? { ...packed, truncated: truncated || packed.truncated } : null;
}

function queryInput(input: ReadingJudgmentInput): Record<string, string> {
  if (input.kind === 'library-answer') return { question: input.question };
  if (input.kind === 'evidence-comparison') return { judgment: input.judgment };
  return {
    selection: input.selection,
    ...(input.question === undefined ? {} : { question: input.question }),
  };
}

function selectEvidence(evidence: readonly ReadingEvidence[], limit: number, byteLimit: number) {
  const items: EvidenceInput[] = [];
  const seen = new Set<string>();
  let truncated = false;
  for (const source of evidence) {
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    const boundedContent = clipJsonText(source.content, byteLimit);
    const text = boundedContent.trim();
    if (!text) {
      truncated ||= boundedContent.length !== source.content.length;
      continue;
    }
    if (items.length === limit) {
      truncated = true;
      break;
    }
    const originalExcerpt =
      source.assetType === 'annotation' || source.location.anchor.exact === source.content
        ? ''
        : source.location.anchor.exact;
    const excerpt = clipJsonText(originalExcerpt, byteLimit).trim();
    items.push({ source, kind: evidenceKind(source), text, ...(excerpt ? { excerpt } : {}) });
    truncated ||= text !== source.content || excerpt !== originalExcerpt;
  }
  return { items, truncated };
}

function evidenceKind(evidence: ReadingEvidence): RemoteEvidence['kind'] {
  if (evidence.role === 'judgment' && evidence.authorKind === 'user') return 'user_judgment';
  if (evidence.assetType === 'distillation') return 'distillation';
  return evidence.assetType === 'comment' ? 'ai_discussion' : 'source';
}

function packEvidence(
  kind: ReadingJudgmentInput['kind'],
  input: Record<string, string>,
  candidates: readonly EvidenceInput[],
  byteLimit: number,
): PreparedReadingJudgmentInput | null {
  const baseBytes = jsonByteLength({ kind, input, evidence: [] });
  for (let count = candidates.length; count > 0; count -= 1) {
    const itemLimit = Math.floor((byteLimit - baseBytes - (count - 1)) / count);
    const evidence: RemoteEvidence[] = [];
    for (const candidate of candidates.slice(0, count)) {
      const item = fitEvidence(candidate, `e${evidence.length + 1}`, itemLimit);
      if (!item) break;
      evidence.push(item);
    }
    if (evidence.length !== count) continue;
    const user = JSON.stringify({ kind, input, evidence });
    if (encoder.encode(user).byteLength > byteLimit) return null;
    return {
      user,
      sent: new Map(evidence.map((item, index) => [item.id, candidates[index].source])),
      truncated:
        count !== candidates.length ||
        evidence.some(
          (item, index) =>
            item.text !== candidates[index].text || item.excerpt !== candidates[index].excerpt,
        ),
    };
  }
  return null;
}

function fitEvidence(
  candidate: EvidenceInput,
  id: string,
  byteLimit: number,
): RemoteEvidence | null {
  const item: RemoteEvidence = { id, kind: candidate.kind, text: '' };
  let textBytes = byteLimit - jsonByteLength(item);
  if (candidate.excerpt) {
    const overhead = jsonByteLength({ ...item, excerpt: '' }) - jsonByteLength(item);
    const excerpt = clipJsonText(candidate.excerpt, Math.floor((textBytes - overhead) / 2)).trim();
    if (excerpt) {
      item.excerpt = excerpt;
      textBytes -= overhead + jsonByteLength(excerpt) - 2;
    }
  }
  item.text = clipJsonText(candidate.text, textBytes).trim();
  if (!item.text && item.excerpt) {
    delete item.excerpt;
    item.text = clipJsonText(candidate.text, byteLimit - jsonByteLength(item)).trim();
  }
  return item.text ? item : null;
}

function clipJsonText(text: string, byteLimit: number): string {
  let end = 0;
  let usedBytes = 0;
  for (const character of text) {
    const bytes = jsonByteLength(character) - 2;
    if (usedBytes + bytes > byteLimit) break;
    usedBytes += bytes;
    end += character.length;
  }
  return text.slice(0, end);
}

function jsonByteLength(value: object | string): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}
