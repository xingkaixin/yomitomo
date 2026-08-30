export type ReadingReviewDecision = 'still_agree' | 'changed' | 'need_evidence';

export type ReadingReviewAssetRef = {
  articleId: string;
  annotationId: string;
  assetType: 'comment' | 'distillation';
  assetId: string;
};

export type ReadingReviewBase = ReadingReviewAssetRef & {
  assetVersion: string;
  content: string;
  authorKind?: 'user' | 'ai';
  formedAt: string;
};

export type ReadingReviewEvent = ReadingReviewAssetRef & {
  id: string;
  assetVersion: string;
  judgmentSnapshot: string;
  judgmentDigest: string;
  previousReviewId: string | null;
  decision: ReadingReviewDecision;
  answer: string;
  createdAt: string;
};

export type ReadingReviewFold = {
  content: string;
  authorKind?: 'user' | 'ai';
  latestReview: Pick<ReadingReviewEvent, 'id' | 'decision' | 'createdAt'> | null;
};
