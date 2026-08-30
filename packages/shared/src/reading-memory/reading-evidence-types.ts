import type { TextAnchor } from '../anchor-types';
import type { ArticleSourceType } from '../sources/article-types';
import type { ContentRef } from '../sources/collection-types';
import type { ReadingReviewDecision } from './reading-review-types';

export type ReadingEvidenceAssetType = 'annotation' | 'comment' | 'distillation';

export type ReadingEvidenceScope =
  | { kind: 'library' }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'sources'; sources: ContentRef[] };

export type ReadingEvidenceRole = 'judgment' | 'source';

export type ReadingEvidence = {
  id: string;
  assetType: ReadingEvidenceAssetType;
  role: ReadingEvidenceRole;
  authorKind?: 'user' | 'ai';
  review?: { decision: ReadingReviewDecision; reviewedAt: string };
  content: string;
  sourceVersion: string;
  source: {
    ref: { kind: 'article'; id: string };
    sourceType: ArticleSourceType;
    title: string;
    byline?: string;
  };
  location: {
    annotationId: string;
    commentId?: string;
    anchor: TextAnchor;
  };
  createdAt: string;
  updatedAt: string;
};

export type ReadingEvidenceProjectionState =
  | 'not_built'
  | 'building'
  | 'available'
  | 'stale'
  | 'failed';

export type ReadingEvidenceProjectionStatus = {
  state: ReadingEvidenceProjectionState;
  coverage: {
    projectedAssetCount: number;
    eligibleAssetCount: number;
  };
};

export type ReadingMemorySemanticStatus = {
  state:
    | 'checking'
    | 'not_installed'
    | 'downloading'
    | 'building'
    | 'available'
    | 'rebuilding'
    | 'failed';
  modelVersion: string;
  queryModelVersion: string | null;
  coverage: {
    indexedEntryCount: number;
    eligibleEntryCount: number;
  };
  indexingPaused: boolean;
};

export type ReadingMemoryEvidenceSearchResult = {
  evidence: ReadingEvidence[];
  projection: ReadingEvidenceProjectionStatus;
  semantic: ReadingMemorySemanticStatus;
  mode: 'keyword' | 'hybrid';
};
