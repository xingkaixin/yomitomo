import type {
  LlmProvider,
  ReaderQuestionContext,
  ReadingEvidence,
  ReadingEvidenceProjectionStatus,
  ReadingEvidenceScope,
  ReadingJudgmentResult,
  ReadingMemoryEvidenceSearchResult,
  ReadingMemorySemanticStatus,
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

export type ReadingMemoryStatusSnapshot = {
  model: {
    status: 'checking' | 'not-installed' | 'downloading' | 'available' | 'failed';
    internalId: string;
    downloadSizeBytes: number;
    downloadedBytes: number;
    directory: string;
    sourceUrl: string;
    failure: 'integrity' | 'network' | 'storage' | 'timeout' | 'unsupported-platform' | null;
  };
  projection: ReadingEvidenceProjectionStatus;
  semantic: ReadingMemorySemanticStatus;
};
