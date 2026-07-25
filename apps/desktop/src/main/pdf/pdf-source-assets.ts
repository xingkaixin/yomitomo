import { Buffer } from 'node:buffer';
import { stageSourceAssets } from '../articles/source-asset-staging';
import { pdfSourceFilePath } from './pdf-storage';
import { pdfThumbnailFilePath } from './pdf-thumbnail-storage';

export function stagePdfSourceAssets(
  articleId: string,
  data: ArrayBuffer,
  thumbnail: Buffer | null,
) {
  return stageSourceAssets([
    { data: Buffer.from(data), targetPath: pdfSourceFilePath(articleId) },
    ...(thumbnail ? [{ data: thumbnail, targetPath: pdfThumbnailFilePath(articleId) }] : []),
  ]);
}
