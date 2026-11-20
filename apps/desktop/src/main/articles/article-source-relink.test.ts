import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readEbookSourceFile } from '../ebooks/ebook-storage';
import { readPdfSourceFile } from '../pdf/pdf-storage';
import { relinkArticleSourceFromPath } from './article-source-relink';

const state = vi.hoisted(() => ({ userDataDir: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => state.userDataDir,
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
}));

describe('relinkArticleSourceFromPath', () => {
  let externalDir = '';

  beforeEach(async () => {
    state.userDataDir = await mkdtemp(join(tmpdir(), 'yomitomo-relink-userdata-'));
    externalDir = await mkdtemp(join(tmpdir(), 'yomitomo-relink-external-'));
  });

  afterEach(async () => {
    await rm(state.userDataDir, { recursive: true, force: true });
    await rm(externalDir, { recursive: true, force: true });
  });

  it('copies a valid local PDF back into storage so missing PDFs can be read again', async () => {
    const articleId = 'pdf_restore_1';
    await expect(readPdfSourceFile(articleId)).rejects.toThrow('PDF_SOURCE_FILE_MISSING');

    const localPdfPath = join(externalDir, 'recovered.pdf');
    const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1');
    await writeFile(localPdfPath, pdfBytes);

    await expect(
      relinkArticleSourceFromPath({
        article: { id: articleId, sourceType: 'pdf', contentHash: 'other-file' },
        filePath: localPdfPath,
      }),
    ).rejects.toThrow('PDF_IMPORT_INVALID_FILE');
    await relinkArticleSourceFromPath({
      article: {
        id: articleId,
        sourceType: 'pdf',
        contentHash: createHash('sha256').update(pdfBytes).digest('hex'),
      },
      filePath: localPdfPath,
      renderThumbnail: async () => null,
    });

    const restored = await readPdfSourceFile(articleId);
    expect(restored.equals(pdfBytes)).toBe(true);
  });

  it('rejects non-PDF files when relinking a missing PDF', async () => {
    const badPdfPath = join(externalDir, 'fake.pdf');
    await writeFile(badPdfPath, Buffer.from('not a pdf document', 'utf8'));

    await expect(
      relinkArticleSourceFromPath({
        article: { id: 'pdf_bad_1', sourceType: 'pdf', contentHash: 'wrong' },
        filePath: badPdfPath,
        renderThumbnail: async () => null,
      }),
    ).rejects.toThrow('PDF_IMPORT_INVALID_FILE');
  });

  it('copies a valid local EPUB back into storage and updates format callback', async () => {
    const articleId = 'ebook_restore_1';
    await expect(readEbookSourceFile(articleId)).rejects.toThrow('EBOOK_SOURCE_FILE_MISSING');

    const localEpubPath = join(externalDir, 'book.epub');
    const epubBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    await writeFile(localEpubPath, epubBytes);
    const updateEbookFormat = vi.fn().mockResolvedValue(null);

    await relinkArticleSourceFromPath({
      article: {
        id: articleId,
        sourceType: 'ebook',
        contentHash: createHash('sha256').update(epubBytes).digest('hex'),
      },
      filePath: localEpubPath,
      updateEbookFormat,
    });

    const restored = await readEbookSourceFile(articleId);
    expect(restored.equals(epubBytes)).toBe(true);
    expect(updateEbookFormat).toHaveBeenCalledWith(articleId, 'epub');
  });

  it('rejects invalid EPUB files lacking a ZIP header', async () => {
    const badEpubPath = join(externalDir, 'broken.epub');
    await writeFile(badEpubPath, Buffer.from('plain text masquerading as epub', 'utf8'));

    await expect(
      relinkArticleSourceFromPath({
        article: { id: 'ebook_bad_1', sourceType: 'ebook', contentHash: 'wrong' },
        filePath: badEpubPath,
      }),
    ).rejects.toThrow('EBOOK_IMPORT_INVALID_FILE');
  });
});
