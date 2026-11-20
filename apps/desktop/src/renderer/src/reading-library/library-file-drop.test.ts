import { describe, expect, it } from 'vitest';
import { classifyDroppedLibraryFiles } from './library-file-drop';

describe('classifyDroppedLibraryFiles', () => {
  it('routes ebook, pdf, text, and unsupported files by case-insensitive extension', () => {
    const files = [
      new File(['a'], 'novel.EPUB'),
      new File(['b'], 'kindle.azw3'),
      new File(['c'], 'legacy.mobi'),
      new File(['d'], 'paper.PDF'),
      new File(['e'], 'notes.txt'),
      new File(['f'], 'readme.md'),
      new File(['g'], 'essay.Markdown'),
      new File(['h'], 'photo.png'),
      new File(['i'], 'noext'),
    ];

    const grouped = classifyDroppedLibraryFiles(files);

    expect(grouped.ebooks.map((file) => file.name)).toEqual([
      'novel.EPUB',
      'kindle.azw3',
      'legacy.mobi',
    ]);
    expect(grouped.pdfs.map((file) => file.name)).toEqual(['paper.PDF']);
    expect(grouped.texts.map((file) => file.name)).toEqual([
      'notes.txt',
      'readme.md',
      'essay.Markdown',
    ]);
    expect(grouped.unsupported.map((file) => file.name)).toEqual(['photo.png', 'noext']);
  });
});
