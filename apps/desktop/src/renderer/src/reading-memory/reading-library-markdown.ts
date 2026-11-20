import type {
  ReadingEvidence,
  ReadingJudgmentClaim,
  ReadingJudgmentOutput,
} from '@yomitomo/shared';

type LibraryAnswerOutput = Extract<ReadingJudgmentOutput, { kind: 'library-answer' }>;
type LibraryAnswerSectionKey = 'judgments' | 'supporting' | 'opposingOrLimiting' | 'gaps';

const SECTION_KEYS: readonly LibraryAnswerSectionKey[] = [
  'judgments',
  'supporting',
  'opposingOrLimiting',
  'gaps',
];

export function formatReadingLibraryAnswerMarkdown({
  question,
  output,
  evidence,
  sectionTitles,
  fallbackSourceTitle,
}: {
  question?: string;
  output: LibraryAnswerOutput;
  evidence: readonly ReadingEvidence[];
  sectionTitles: Record<LibraryAnswerSectionKey, string>;
  fallbackSourceTitle: string;
}): string {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const blocks: string[] = [];
  const trimmedQuestion = question?.trim();
  if (trimmedQuestion) {
    blocks.push(`# ${trimmedQuestion}`);
  }

  for (const key of SECTION_KEYS) {
    const claims = output[key]
      .map((claim) => ({ claim, citations: resolveClaimCitations(claim, evidenceById) }))
      .filter((entry) => entry.citations.length > 0);
    if (claims.length === 0) continue;

    const lines: string[] = [`## ${sectionTitles[key]}`];
    for (const { claim, citations } of claims) {
      lines.push(`- ${claim.text.trim()}`);
      for (const item of citations) {
        lines.push(`  > ${formatEvidenceCitation(item, fallbackSourceTitle)}`);
      }
    }
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

function resolveClaimCitations(
  claim: ReadingJudgmentClaim,
  evidenceById: ReadonlyMap<string, ReadingEvidence>,
): ReadingEvidence[] {
  if (!claim.text.trim() || claim.evidenceIds.length === 0) return [];
  const citations: ReadingEvidence[] = [];
  const seen = new Set<string>();
  for (const id of claim.evidenceIds) {
    const item = evidenceById.get(id);
    if (!item || seen.has(id)) return [];
    seen.add(id);
    citations.push(item);
  }
  return citations;
}

function formatEvidenceCitation(item: ReadingEvidence, fallbackSourceTitle: string): string {
  const title = item.source.title.trim() || fallbackSourceTitle;
  const excerpt = singleLineExcerpt(item.content || item.location.anchor.exact || '');
  return excerpt ? `**${title}**：${excerpt}` : `**${title}**`;
}

function singleLineExcerpt(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}
