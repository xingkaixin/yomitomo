import type { ReadingEvidence } from './reading-evidence-types';

export type ReadingJudgmentInput =
  | {
      kind: 'reading-relations';
      selection: string;
      paragraph?: string;
      question?: string;
    }
  | { kind: 'library-answer'; question: string }
  | { kind: 'evidence-comparison'; judgment: string };

export type ReadingJudgmentClaim = {
  text: string;
  evidenceIds: string[];
};

export type ReadingEvidenceRelation = {
  evidenceId: string;
  relation: 'same' | 'complementary' | 'opposite';
  explanation: string;
};

export type ReadingJudgmentOutput =
  | {
      kind: 'reading-relations' | 'evidence-comparison';
      relations: ReadingEvidenceRelation[];
    }
  | {
      kind: 'library-answer';
      judgments: ReadingJudgmentClaim[];
      supporting: ReadingJudgmentClaim[];
      opposingOrLimiting: ReadingJudgmentClaim[];
      gaps: ReadingJudgmentClaim[];
    };

export type ReadingJudgmentResult =
  | {
      state: 'generated';
      output: ReadingJudgmentOutput;
      evidence: ReadingEvidence[];
      inputTruncated: boolean;
      sentEvidenceCount: number;
    }
  | {
      state: 'local';
      reason: 'unconfigured' | 'no_evidence' | 'input_too_large' | 'failed';
      evidence: ReadingEvidence[];
      inputTruncated: boolean;
      sentEvidenceCount: number;
    };
