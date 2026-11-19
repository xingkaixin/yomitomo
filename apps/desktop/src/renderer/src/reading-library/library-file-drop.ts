const EBOOK_EXTENSIONS = new Set(['epub', 'azw3', 'mobi']);
const PDF_EXTENSIONS = new Set(['pdf']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown']);

export type DroppedLibraryFiles = {
  ebooks: File[];
  pdfs: File[];
  texts: File[];
  unsupported: File[];
};

export function classifyDroppedLibraryFiles(files: Iterable<File>): DroppedLibraryFiles {
  const ebooks: File[] = [];
  const pdfs: File[] = [];
  const texts: File[] = [];
  const unsupported: File[] = [];

  for (const file of files) {
    const ext = fileExtension(file.name);
    if (EBOOK_EXTENSIONS.has(ext)) ebooks.push(file);
    else if (PDF_EXTENSIONS.has(ext)) pdfs.push(file);
    else if (TEXT_EXTENSIONS.has(ext)) texts.push(file);
    else unsupported.push(file);
  }

  return { ebooks, pdfs, texts, unsupported };
}

export function hasDraggedFiles(dataTransfer: Pick<DataTransfer, 'types'> | null | undefined) {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes('Files');
}

function fileExtension(fileName: string) {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) return '';
  return trimmed.slice(dotIndex + 1).toLowerCase();
}
