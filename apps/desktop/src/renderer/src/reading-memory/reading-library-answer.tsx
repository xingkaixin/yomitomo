import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ReadingEvidence,
  ReadingJudgmentClaim,
  ReadingJudgmentOutput,
} from '@yomitomo/shared';
import { WordReveal } from '../components/ui/word-reveal';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { ReadingMemoryEvidenceCard } from './reading-memory-evidence-card';
import './reading-library-answer.css';

const sections = ['judgments', 'supporting', 'opposingOrLimiting', 'gaps'] as const;
// The answer clears from its blur over 1.3s; words start once the text is readable.
const WORDS_START_MS = 400;
const CLAIM_STAGGER_MS = 150;
const CLAIM_SPREAD_MS = 650;

export function ReadingLibraryAnswer({
  output,
  evidence,
  onOpenEvidenceSource,
  onSaveThought,
}: {
  output: Extract<ReadingJudgmentOutput, { kind: 'library-answer' }>;
  evidence: ReadingEvidence[];
  onOpenEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
  onSaveThought: (claim: ReadingJudgmentClaim) => void;
}) {
  const { t } = useTranslation();
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  let claimOrder = 0;
  const timedSections = sections.map((section) => {
    const sectionStart = WORDS_START_MS + claimOrder * CLAIM_STAGGER_MS;
    const claims = output[section].flatMap((claim, index) => {
      const citations = resolveCitations(claim, evidenceById);
      if (!citations) return [];
      const start = WORDS_START_MS + claimOrder * CLAIM_STAGGER_MS;
      claimOrder += 1;
      return [{ claim, citations, index, start }];
    });
    return { section, claims, start: Math.max(0, sectionStart - 80) };
  });

  return (
    <div className="reading-library-answer">
      {timedSections.map(({ section, claims, start }) => {
        const title = t(`readingMemory.library.answer.${section}`);
        return (
          <section
            className="reading-library-answer-section"
            aria-label={title}
            key={section}
            style={revealAfter(start)}
          >
            <h3>{title}</h3>
            {claims.length === 0 ? (
              <p className="reading-library-answer-empty">
                {t('readingMemory.library.answer.emptySection')}
              </p>
            ) : (
              <ul className="reading-library-answer-claims">
                {claims.map(({ claim, citations, index, start: claimStart }) => (
                  <li
                    className="reading-library-answer-claim"
                    key={`${index}:${claim.text}:${claim.evidenceIds.join(',')}`}
                    style={revealAfter(claimStart + CLAIM_SPREAD_MS)}
                  >
                    <p className="reading-library-answer-text">
                      <WordReveal
                        text={claim.text}
                        delayMs={claimStart}
                        spreadMs={CLAIM_SPREAD_MS}
                      />
                    </p>
                    <details className="reading-library-answer-citations">
                      <summary>
                        {t('readingMemory.library.answer.citations', { count: citations.length })}
                      </summary>
                      <div className="reading-library-answer-evidence">
                        {citations.map((item) => (
                          <ReadingMemoryEvidenceCard
                            key={item.id}
                            evidence={item}
                            onOpenEvidenceSource={onOpenEvidenceSource}
                          />
                        ))}
                      </div>
                    </details>
                    <button
                      className="reading-library-answer-save"
                      type="button"
                      onClick={() => onSaveThought(claim)}
                    >
                      {t('readingMemory.library.answer.saveThought')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function revealAfter(ms: number) {
  return { '--reveal-after': `${ms}ms` } as CSSProperties;
}

function resolveCitations(
  claim: ReadingJudgmentClaim,
  evidenceById: ReadonlyMap<string, ReadingEvidence>,
): ReadingEvidence[] | null {
  if (!claim.text.trim() || claim.evidenceIds.length === 0) return null;
  const citations: ReadingEvidence[] = [];
  const seen = new Set<string>();
  for (const id of claim.evidenceIds) {
    const evidence = evidenceById.get(id);
    if (!evidence || seen.has(id)) return null;
    seen.add(id);
    citations.push(evidence);
  }
  return citations;
}
