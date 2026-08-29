import type { TextAnchor } from '../anchor-types';
import type { ArticleSourceType } from '../sources/article-types';
import type { ContentRef } from '../sources/collection-types';

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
