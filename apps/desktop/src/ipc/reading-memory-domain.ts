import type {
  LlmProvider,
  ReaderQuestionContext,
  ReadingEvidenceProjectionStatus,
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
