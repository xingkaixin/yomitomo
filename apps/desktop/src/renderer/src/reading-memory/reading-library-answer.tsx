import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, Tick01Icon } from '@hugeicons/core-free-icons';
import { useReducer, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ReadingEvidence,
  ReadingJudgmentClaim,
  ReadingJudgmentOutput,
} from '@yomitomo/shared';
import { useInterval } from '@yomitomo/reader-ui/use-interval';
import { Button } from '../components/ui/button';
import { WordReveal } from '../components/ui/word-reveal';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { formatReadingLibraryAnswerMarkdown } from './reading-library-markdown';
import { ReadingMemoryEvidenceCard } from './reading-memory-evidence-card';
import './reading-library-answer.css';

const sections = ['judgments', 'supporting', 'opposingOrLimiting', 'gaps'] as const;
// The answer clears from its blur over 1.3s; words start once the text is readable.
const WORDS_START_MS = 400;
const CLAIM_STAGGER_MS = 150;
const CLAIM_SPREAD_MS = 650;
const COPY_FEEDBACK_MS = 1600;

export function ReadingLibraryAnswer({
  question,
  output,
  evidence,
  onOpenEvidenceSource,
  onSaveThought,
}: {
  question?: string;
  output: Extract<ReadingJudgmentOutput, { kind: 'library-answer' }>;
  evidence: ReadingEvidence[];
  onOpenEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
  onSaveThought: (claim: ReadingJudgmentClaim) => void;
}) {
  const { t } = useTranslation();
  const [copied, dispatchCopy] = useReducer(copyAnswerReducer, false);
  useInterval(() => dispatchCopy({ type: 'reset' }), copied ? COPY_FEEDBACK_MS : null);
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
  const hasAnyClaims = timedSections.some((section) => section.claims.length > 0);

  function copyMarkdown() {
    const markdown = formatReadingLibraryAnswerMarkdown({
      question,
      output,
      evidence,
      sectionTitles: {
        judgments: t('readingMemory.library.answer.judgments'),
        supporting: t('readingMemory.library.answer.supporting'),
        opposingOrLimiting: t('readingMemory.library.answer.opposingOrLimiting'),
        gaps: t('readingMemory.library.answer.gaps'),
      },
      fallbackSourceTitle: t('discussion.untitledArticle'),
    });
    if (!markdown) return;
    void navigator.clipboard
      ?.writeText(markdown)
      .then(() => dispatchCopy({ type: 'copied' }))
      .catch(() => undefined);
  }

  return (
    <div className="reading-library-answer">
      {hasAnyClaims ? (
        <div className="reading-library-answer-toolbar">
          <Button type="button" variant="secondary" size="sm" onClick={copyMarkdown}>
            <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={14} />
            <span>
              {copied
                ? t('readingMemory.library.answer.copiedMarkdown')
                : t('readingMemory.library.answer.copyMarkdown')}
            </span>
          </Button>
        </div>
      ) : null}
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

function copyAnswerReducer(_copied: boolean, event: { type: 'copied' | 'reset' }) {
  return event.type === 'copied';
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
