import type { ReadingMemoryModelSource } from '../reading-memory-model-sources';
import type {
  LlmProvider,
  ReaderQuestionContext,
  ReadingEvidence,
  ReadingEvidenceProjectionStatus,
  ReadingEvidenceScope,
  ReadingJudgmentResult,
  ReadingMemoryEvidenceSearchResult,
  ReadingMemorySemanticStatus,
  ReadingReviewAssetRef,
  ReadingReviewDecision,
  ReadingReviewEvent,
} from '@yomitomo/shared';

export type ReadingMemoryProviderDescriptor = {
  id: string;
  name: string;
  type: LlmProvider['type'];
  modelName: string;
};

export type ReadingRelationsSearchInput = {
  requestId: string;
  articleId: string;
  context: ReaderQuestionContext;
  question?: string;
};

export type ReadingRelationsSession = ReadingMemoryEvidenceSearchResult & {
  requestId: string;
  provider: ReadingMemoryProviderDescriptor | null;
  remoteConsentRequired: boolean;
};

export type ReadingRelationsJudgeResult = ReadingRelationsSession & {
  judgment: ReadingJudgmentResult;
  providerChanged?: true;
  sentProvider?: ReadingMemoryProviderDescriptor;
};

export const readingLibrarySourceLimit = 500;

export type ReadingLibraryContext = {
  scope: ReadingEvidenceScope;
  collectionName?: string;
  sourceCount: number;
  judgmentCount: number;
  provider: ReadingMemoryProviderDescriptor | null;
  routeRevision: string;
  remoteConsentRequired: boolean;
  projection: ReadingEvidenceProjectionStatus;
  semantic: ReadingMemorySemanticStatus;
};

export type ReadingLibrarySearchInput = {
  requestId: string;
  question: string;
  scope: ReadingEvidenceScope;
  expectedRouteRevision: string;
};

export type ReadingLibrarySession = ReadingLibraryContext & {
  requestId: string;
  evidence: ReadingEvidence[];
  mode: 'keyword' | 'hybrid';
  providerChanged?: true;
};

export type ReadingLibraryAnswerResult = ReadingLibrarySession & {
  judgment: ReadingJudgmentResult;
  sentProvider?: ReadingMemoryProviderDescriptor;
};

export const readingReviewAnswerLimit = 8192;

export type ReadingReviewQueueItem = {
  asset: ReadingReviewAssetRef;
  source: ReadingEvidence['source'];
  quote: string;
  formedAt: string;
  lastReviewedAt: string | null;
};

export type ReadingReviewQueue = {
  items: ReadingReviewQueueItem[];
  mode: 'time' | 'semantic';
  projection: ReadingEvidenceProjectionStatus;
  semantic: ReadingMemorySemanticStatus;
  coverage: {
    eligibleAssetCount: number;
    timeCandidateCount: number;
    semanticCandidateCount: number;
    recentEvidenceCount: number;
  };
  semanticWindow: { candidateLimit: 64; evidenceLimit: 128; lookbackDays: 30 };
};

export type ReadingReviewStartInput = { requestId: string; asset: ReadingReviewAssetRef };

export type ReadingReviewSession = ReadingReviewQueueItem & {
  requestId: string;
  provider: ReadingMemoryProviderDescriptor | null;
  routeRevision: string;
  remoteConsentRequired: boolean;
};

export type ReadingReviewHistoryCursor = { createdAt: string; id: string };
export type ReadingReviewHistoryPage = {
  events: ReadingReviewEvent[];
  nextCursor: ReadingReviewHistoryCursor | null;
};

export type ReadingReviewRevealResult = ReadingReviewSession & {
  answer: string;
  currentJudgment: string;
  baseJudgment: string;
  history: ReadingReviewHistoryPage;
  sourceTarget: { articleId: string; annotationId: string };
};

export type ReadingReviewSubmitInput = {
  requestId: string;
  eventId: string;
  decision: ReadingReviewDecision;
};
export type ReadingReviewSubmitResult = { requestId: string; event: ReadingReviewEvent };

export type ReadingReviewEvidenceSearchInput = {
  requestId: string;
  comparisonId: string;
  expectedRouteRevision: string;
};
export type ReadingReviewEvidenceSession = ReadingMemoryEvidenceSearchResult & {
  requestId: string;
  comparisonId: string;
  provider: ReadingMemoryProviderDescriptor | null;
  routeRevision: string;
  remoteConsentRequired: boolean;
  providerChanged?: true;
};
export type ReadingReviewEvidenceResult = ReadingReviewEvidenceSession & {
  judgment: ReadingJudgmentResult;
  sentProvider?: ReadingMemoryProviderDescriptor;
};

export type ReadingMemoryStatusSnapshot = {
  model: {
    status: 'checking' | 'not-installed' | 'downloading' | 'available' | 'failed';
    internalId: string;
    downloadSizeBytes: number;
    downloadedBytes: number;
    source: ReadingMemoryModelSource | null;
    directory: string;
    failure: 'integrity' | 'network' | 'storage' | 'timeout' | 'unsupported-platform' | null;
  };
  projection: ReadingEvidenceProjectionStatus;
  semantic: ReadingMemorySemanticStatus;
};
