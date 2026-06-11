import { Buffer } from 'node:buffer';
import { basename, dirname } from 'node:path/posix';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import {
  buildEpubBookIndex,
  epubIndexText,
  performanceElapsedMs,
  performanceStart,
  type EpubBookIndexChapterInput,
} from '@yomitomo/core';
import { sanitizeArticleContent } from '@yomitomo/core/article-extraction';
import {
  cleanEpubDisplayTitle,
  EPUB_TITLE_CLEANUP_VERSION,
  hashText,
  type ArticleRecord,
  type EbookChapterRecord,
} from '@yomitomo/shared';
import { MAX_EBOOK_IMPORT_BYTES } from '../../ipc-contract';

const EPUB_MIME = 'application/epub+zip';
const XHTML_TYPES = new Set(['application/xhtml+xml', 'text/html', 'application/xml', 'text/xml']);
const CHAPTER_PARAGRAPH_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,td,th';
const HTML_IMAGE_REFERENCE_ATTRIBUTES = [
  'src',
  'srcset',
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-actualsrc',
  'data-srcset',
];

export type EbookImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export type EbookImportOptions = {
  performanceLogger?: (event: string, data?: Record<string, unknown>) => void;
};

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties: string[];
  path: string;
};

type GuideReference = {
  type: string;
  href: string;
  path: string;
};

type EpubPackage = {
  opfPath: string;
  opfDir: string;
  title: string;
  metadataTitle?: string;
  creator?: string;
  language?: string;
  publisher?: string;
  description?: string;
  manifest: ManifestItem[];
  spineIds: string[];
  guideReferences: GuideReference[];
  coverId?: string;
};

type ImportedEbookChapter = EbookChapterRecord & {
  paragraphs: string[];
};

type ChapterImageMetrics = {
  imageElementCount: number;
  strippedImageCount: number;
};

export async function articleRecordFromEpubFile(
  input: EbookImportFileInput,
  options: EbookImportOptions = {},
): Promise<ArticleRecord> {
  const importStartedAt = performanceStart();
  const fileName = input.fileName.trim() || 'Untitled.epub';
  const fileSize = input.data.byteLength;
  if (!isEpubFile(fileName, input.mimeType)) throw new Error('EBOOK_IMPORT_INVALID_FILE');
  if (fileSize > MAX_EBOOK_IMPORT_BYTES) throw new Error('EBOOK_IMPORT_FILE_TOO_LARGE');

  const zipStartedAt = performanceStart();
  const zip = await JSZip.loadAsync(Buffer.from(input.data));
  logEpubImportTiming(options.performanceLogger, 'zip', zipStartedAt, {
    fileName,
    fileSize,
    zipEntryCount: Object.keys(zip.files).length,
  });

  const packageStartedAt = performanceStart();
  const epub = await readEpubPackage(zip);
  logEpubImportTiming(options.performanceLogger, 'package', packageStartedAt, {
    fileName,
    fileSize,
    manifestItemCount: epub.manifest.length,
    spineItemCount: epub.spineIds.length,
    titleChars: epub.title.length,
  });

  const titleCleanupStartedAt = performanceStart();
  const displayTitle = cleanEpubDisplayTitle({
    metadataTitle: epub.metadataTitle,
    fileName,
    creator: epub.creator,
  });
  logEpubImportTiming(options.performanceLogger, 'title_cleanup', titleCleanupStartedAt, {
    fileName,
    fileSize,
    metadataTitleChars: epub.metadataTitle?.length || 0,
    displayTitleChars: displayTitle.length,
  });

  const titlesStartedAt = performanceStart();
  const chapterTitleByPath = await readChapterTitles(zip, epub);
  logEpubImportTiming(options.performanceLogger, 'chapter_titles', titlesStartedAt, {
    fileName,
    fileSize,
    titleCount: chapterTitleByPath.size,
  });

  const chaptersStartedAt = performanceStart();
  const importedChapters = await readEpubChapters(
    zip,
    epub,
    chapterTitleByPath,
    options.performanceLogger,
  );
  logEpubImportTiming(options.performanceLogger, 'chapters', chaptersStartedAt, {
    fileName,
    fileSize,
    chapterCount: importedChapters.length,
    paragraphCount: importedChapters.reduce(
      (count, chapter) => count + chapter.paragraphs.length,
      0,
    ),
    textChars: importedChapters.reduce((count, chapter) => count + chapter.textLength, 0),
  });
  if (importedChapters.length === 0) throw new Error('EBOOK_IMPORT_NO_READABLE_CHAPTERS');

  const coverStartedAt = performanceStart();
  const cover = await readCoverImage(zip, epub);
  logEpubImportTiming(options.performanceLogger, 'cover', coverStartedAt, {
    fileName,
    fileSize,
    hasCover: Boolean(cover),
    coverDataChars: cover?.length || 0,
  });

  const indexStartedAt = performanceStart();
  const chapters = importedChapters.map(ebookChapterRecord);
  const indexChapters = importedChapters.map<EpubBookIndexChapterInput>((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    href: chapter.href,
    paragraphs: chapter.paragraphs,
  }));
  const fullText = epubIndexText(indexChapters);
  const contentHash = hashText(fullText.slice(0, 12000));
  const id = hashText(`ebook:${epub.title}:${epub.creator || ''}:${contentHash}`);
  const index = buildEpubBookIndex({ articleId: id, chapters: indexChapters });
  const contentHtml = chaptersToArticleHtml(chapters);
  logEpubImportTiming(options.performanceLogger, 'index', indexStartedAt, {
    fileName,
    fileSize,
    chapterCount: chapters.length,
    paragraphCount: index.paragraphs.length,
    segmentCount: index.segments.length,
    textChars: fullText.length,
    contentHtmlChars: contentHtml.length,
  });

  const now = new Date().toISOString();
  logEpubImportTiming(options.performanceLogger, 'total', importStartedAt, {
    fileName,
    fileSize,
    chapterCount: chapters.length,
    paragraphCount: index.paragraphs.length,
    segmentCount: index.segments.length,
    textChars: fullText.length,
    zipEntryCount: Object.keys(zip.files).length,
    manifestItemCount: epub.manifest.length,
    spineItemCount: epub.spineIds.length,
  });

  return {
    id,
    url: `ebook:${id}`,
    canonicalUrl: `ebook:${id}`,
    sourceType: 'ebook',
    title: epub.title || fileTitle(fileName),
    byline: epub.creator,
    excerpt: epub.description,
    siteName: 'EPUB',
    leadImageUrl: cover,
    contentHtml,
    contentHash,
    ebook: {
      metadata: {
        format: 'epub',
        fileName,
        fileSize,
        originalTitle: epub.metadataTitle,
        displayTitle,
        titleCleanupVersion: EPUB_TITLE_CLEANUP_VERSION,
        language: epub.language,
        publisher: epub.publisher,
        description: epub.description,
      },
      chapters,
      index,
    },
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

function isEpubFile(fileName: string, mimeType: string | undefined) {
  return fileName.toLowerCase().endsWith('.epub') || mimeType === EPUB_MIME;
}

function logEpubImportTiming(
  logger: EbookImportOptions['performanceLogger'],
  phase: string,
  startedAt: number,
  data: Record<string, unknown> = {},
) {
  logger?.(`performance.epub_import.${phase}`, {
    elapsedMs: performanceElapsedMs(startedAt),
    ...data,
  });
}

async function readEpubPackage(zip: JSZip): Promise<EpubPackage> {
  const containerText = await zipText(zip, 'META-INF/container.xml');
  if (!containerText) throw new Error('EBOOK_IMPORT_MISSING_CONTAINER');

  const rootfilePath = readXml(containerText, (document) => {
    const rootfile = elementsByLocalName(document, 'rootfile')[0];
    return normalizeZipPath(rootfile?.getAttribute('full-path') || '');
  });
  if (!rootfilePath) throw new Error('EBOOK_IMPORT_MISSING_OPF');

  const opfText = await zipText(zip, rootfilePath);
  if (!opfText) throw new Error('EBOOK_IMPORT_OPF_UNREADABLE');

  return readXml(opfText, (document) => {
    const opfDir = dirname(rootfilePath) === '.' ? '' : dirname(rootfilePath);
    const manifest = elementsByLocalName(document, 'item')
      .map((item) => {
        const href = item.getAttribute('href') || '';
        const mediaType = item.getAttribute('media-type') || '';
        return {
          id: item.getAttribute('id') || '',
          href,
          mediaType,
          properties: (item.getAttribute('properties') || '').split(/\s+/).filter(Boolean),
          path: resolveZipPath(opfDir, href),
        };
      })
      .filter((item) => item.id && item.href);
    const coverId =
      metadataElement(
        document,
        'meta',
        (element) => element.getAttribute('name') === 'cover',
      )?.getAttribute('content') || undefined;

    const metadataTitle = textByLocalName(document, 'title');
    return {
      opfPath: rootfilePath,
      opfDir,
      title: metadataTitle || fileTitle(rootfilePath),
      metadataTitle,
      creator: textsByLocalName(document, 'creator').join(' & ') || undefined,
      language: textByLocalName(document, 'language'),
      publisher: textByLocalName(document, 'publisher'),
      description: textByLocalName(document, 'description'),
      manifest,
      spineIds: elementsByLocalName(document, 'itemref').flatMap((item) => {
        const idref = item.getAttribute('idref');
        return idref ? [idref] : [];
      }),
      guideReferences: elementsByLocalName(document, 'reference').flatMap((reference) => {
        const href = reference.getAttribute('href') || '';
        const type = reference.getAttribute('type') || '';
        return href && type
          ? [{ href, type: type.toLowerCase(), path: resolveZipPath(opfDir, href) }]
          : [];
      }),
      coverId,
    };
  });
}

async function readChapterTitles(zip: JSZip, epub: EpubPackage) {
  const titles = new Map<string, string>();
  const navItem =
    epub.manifest.find((item) => item.properties.includes('nav')) ||
    epub.manifest.find((item) => item.mediaType === 'application/x-dtbncx+xml');
  if (!navItem) return titles;

  const text = await zipText(zip, navItem.path);
  if (!text) return titles;

  if (navItem.mediaType === 'application/x-dtbncx+xml') {
    const dom = parseLooseMarkupDom(text);
    try {
      const document = dom.window.document;
      for (const navPoint of elementsByLocalName(document, 'navPoint')) {
        const content = elementsByLocalName(navPoint, 'content')[0];
        const label = textByLocalName(navPoint, 'text');
        const src = content?.getAttribute('src');
        if (src && label) titles.set(resolveZipPath(dirname(navItem.path), src), label);
      }
    } finally {
      dom.window.close();
    }
    return titles;
  }

  const dom = parseLooseMarkupDom(text);
  try {
    const document = dom.window.document;
    const toc =
      Array.from(document.querySelectorAll('nav')).find((item) => {
        const type = `${item.getAttribute('epub:type') || ''} ${item.getAttribute('type') || ''}`;
        return type.includes('toc');
      }) || document.body;
    for (const anchor of Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const label = cleanString(anchor.textContent);
      const href = anchor.getAttribute('href');
      if (href && label) titles.set(resolveZipPath(dirname(navItem.path), href), label);
    }
    return titles;
  } finally {
    dom.window.close();
  }
}

async function readEpubChapters(
  zip: JSZip,
  epub: EpubPackage,
  chapterTitleByPath: Map<string, string>,
  performanceLogger: EbookImportOptions['performanceLogger'],
): Promise<ImportedEbookChapter[]> {
  const manifestById = new Map(epub.manifest.map((item) => [item.id, item]));
  const chapters: ImportedEbookChapter[] = [];

  for (let spineIndex = 0; spineIndex < epub.spineIds.length; spineIndex += 1) {
    const chapterStartedAt = performanceStart();
    const idref = epub.spineIds[spineIndex];
    const item = manifestById.get(idref);
    if (!item || !XHTML_TYPES.has(item.mediaType)) continue;
    const text = await zipText(zip, item.path);
    if (!text) continue;

    const parseStartedAt = performanceStart();
    const dom = parseLooseMarkupDom(text);
    const parseMs = performanceElapsedMs(parseStartedAt);
    try {
      const imagesStartedAt = performanceStart();
      const imageMetrics = stripChapterImageReferences(dom.window.document);
      const stripImagesMs = performanceElapsedMs(imagesStartedAt);

      const tocStartedAt = performanceStart();
      const isToc = isTocSpineItem(dom.window.document, item, epub);
      const tocCheckMs = performanceElapsedMs(tocStartedAt);
      if (isToc) {
        logEpubImportTiming(performanceLogger, 'chapter', chapterStartedAt, {
          result: 'skipped_toc',
          spineIndex,
          path: item.path,
          href: item.href,
          sourceChars: text.length,
          parseMs,
          stripImagesMs,
          tocCheckMs,
          ...imageMetrics,
        });
        continue;
      }
      const body = dom.window.document.body || dom.window.document.documentElement;
      const rawHtml = body?.innerHTML || '';
      const sanitizeStartedAt = performanceStart();
      const sanitizedContent = sanitizeArticleContent(
        dom.window.document,
        rawHtml,
        `https://ebook.local/${item.path}`,
      );
      const html = sanitizedContent.html;
      const sanitizeMs = performanceElapsedMs(sanitizeStartedAt);

      const paragraphsStartedAt = performanceStart();
      const paragraphs = chapterParagraphs(sanitizedContent.container);
      const paragraphsMs = performanceElapsedMs(paragraphsStartedAt);
      const textLength = paragraphs.join('\n\n').length;
      if (textLength === 0) {
        logEpubImportTiming(performanceLogger, 'chapter', chapterStartedAt, {
          result: 'skipped_empty_text',
          spineIndex,
          path: item.path,
          href: item.href,
          sourceChars: text.length,
          rawHtmlChars: rawHtml.length,
          sanitizedHtmlChars: html.length,
          paragraphCount: paragraphs.length,
          parseMs,
          stripImagesMs,
          tocCheckMs,
          sanitizeMs,
          paragraphsMs,
          ...imageMetrics,
        });
        continue;
      }
      chapters.push({
        id: `chapter-${chapters.length + 1}`,
        href: item.href,
        title:
          chapterTitleByPath.get(item.path) ||
          cleanString(dom.window.document.querySelector('h1,h2,h3,title')?.textContent) ||
          `第 ${chapters.length + 1} 章`,
        html,
        paragraphs,
        textLength,
      });
      logEpubImportTiming(performanceLogger, 'chapter', chapterStartedAt, {
        result: 'imported',
        spineIndex,
        chapterId: `chapter-${chapters.length}`,
        path: item.path,
        href: item.href,
        sourceChars: text.length,
        rawHtmlChars: rawHtml.length,
        sanitizedHtmlChars: html.length,
        paragraphCount: paragraphs.length,
        textChars: textLength,
        parseMs,
        stripImagesMs,
        tocCheckMs,
        sanitizeMs,
        paragraphsMs,
        ...imageMetrics,
      });
    } finally {
      dom.window.close();
    }
  }

  return chapters;
}

function parseLooseMarkupDom(text: string) {
  return new JSDOM(text);
}

function isTocSpineItem(document: Document, item: ManifestItem, epub: EpubPackage) {
  if (item.properties.includes('nav')) return true;
  if (
    epub.guideReferences.some(
      (reference) => reference.type === 'toc' && reference.path === item.path,
    )
  ) {
    return true;
  }
  const bodyText = cleanString(document.body?.textContent);
  const prefix = bodyText?.slice(0, 32).toLowerCase() || '';
  if (
    !bodyText ||
    !(
      prefix.startsWith('目录') ||
      prefix.startsWith('table of contents') ||
      prefix.startsWith('contents')
    )
  ) {
    return false;
  }
  const anchors = Array.from(document.body?.querySelectorAll<HTMLAnchorElement>('a[href]') || []);
  const internalAnchors = anchors.filter((anchor) => {
    const href = anchor.getAttribute('href') || '';
    return href && !/^[a-z][a-z0-9+.-]*:/i.test(href);
  });
  const anchorTextLength = internalAnchors.reduce(
    (length, anchor) => length + (cleanString(anchor.textContent)?.length || 0),
    0,
  );
  return internalAnchors.length >= 5 && anchorTextLength / bodyText.length > 0.5;
}

function stripChapterImageReferences(document: Document) {
  const metrics: ChapterImageMetrics = {
    imageElementCount: 0,
    strippedImageCount: 0,
  };

  const htmlImages = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
  metrics.imageElementCount += htmlImages.length;
  for (const image of htmlImages) {
    if (HTML_IMAGE_REFERENCE_ATTRIBUTES.some((attribute) => image.hasAttribute(attribute))) {
      metrics.strippedImageCount += 1;
    }
    for (const attribute of HTML_IMAGE_REFERENCE_ATTRIBUTES) image.removeAttribute(attribute);
  }

  const svgImages = Array.from(document.querySelectorAll('image'));
  metrics.imageElementCount += svgImages.length;
  for (const image of svgImages) {
    if (image.hasAttribute('href') || image.hasAttribute('xlink:href')) {
      metrics.strippedImageCount += 1;
    }
    image.removeAttribute('href');
    image.removeAttribute('xlink:href');
  }

  return metrics;
}

async function readCoverImage(zip: JSZip, epub: EpubPackage) {
  const cover =
    epub.manifest.find((item) => item.properties.includes('cover-image')) ||
    epub.manifest.find((item) => item.id === epub.coverId) ||
    epub.manifest.find((item) => item.id.toLowerCase().includes('cover')) ||
    epub.manifest.find((item) => /(^|\/)cover\.(jpe?g|png|webp|gif|svg)$/i.test(item.path)) ||
    epub.manifest.find((item) => Boolean(imageMimeType(item.mediaType, item.path)));
  if (!cover) return undefined;

  const file = zipFile(zip, cover.path);
  const mediaType = imageMimeType(cover.mediaType, cover.path);
  if (!file || !mediaType) return undefined;
  return `data:${mediaType};base64,${await file.async('base64')}`;
}

function imageMimeType(mediaType: string | undefined, path: string) {
  if (mediaType?.startsWith('image/')) return mediaType;
  const extension = path.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'svg') return 'image/svg+xml';
  return '';
}

function chaptersToArticleHtml(chapters: EbookChapterRecord[]) {
  return chapters
    .map(
      (chapter, index) =>
        `<section data-ebook-chapter="${index}"><h2>${escapeHtml(chapter.title)}</h2>${chapter.html}</section>`,
    )
    .join('\n');
}

function ebookChapterRecord(chapter: ImportedEbookChapter): EbookChapterRecord {
  return {
    id: chapter.id,
    title: chapter.title,
    href: chapter.href,
    html: chapter.html,
    textLength: chapter.textLength,
  };
}

function chapterParagraphs(root: Element) {
  const blockElements = Array.from(root.querySelectorAll(CHAPTER_PARAGRAPH_SELECTOR)).filter(
    (element) =>
      !Array.from(element.children).some((child) => child.matches(CHAPTER_PARAGRAPH_SELECTOR)),
  );
  const paragraphs = blockElements.flatMap((element) => {
    const text = cleanString(element.textContent);
    return text ? [text] : [];
  });
  if (paragraphs.length > 0) return paragraphs;
  const text = cleanString(root.textContent);
  return text ? [text] : [];
}

function readXml<T>(xml: string, reader: (document: Document) => T): T {
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  try {
    return reader(dom.window.document);
  } finally {
    dom.window.close();
  }
}

function metadataElement(
  document: Document,
  localName: string,
  predicate: (element: Element) => boolean,
) {
  return elementsByLocalName(document, localName).find(predicate);
}

function elementsByLocalName(root: Document | Element, localName: string) {
  const expectedLocalName = localName.toLowerCase();
  return Array.from(root.getElementsByTagName('*')).filter((element) => {
    const elementLocalName = element.localName.toLowerCase();
    return (
      elementLocalName === expectedLocalName || elementLocalName.endsWith(`:${expectedLocalName}`)
    );
  });
}

function textByLocalName(root: Document | Element, localName: string) {
  return cleanString(elementsByLocalName(root, localName)[0]?.textContent);
}

function textsByLocalName(root: Document | Element, localName: string) {
  return elementsByLocalName(root, localName).flatMap((element) => {
    const value = cleanString(element.textContent);
    return value ? [value] : [];
  });
}

async function zipText(zip: JSZip, path: string) {
  const file = zipFile(zip, path);
  return file ? file.async('string') : null;
}

function zipFile(zip: JSZip, path: string) {
  return zip.file(normalizeZipPath(path));
}

function resolveZipPath(baseDir: string, href: string) {
  const path = href.split('#')[0] || href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  const decoded = decodeURIComponent(path);
  return normalizeZipPath(baseDir ? `${baseDir}/${decoded}` : decoded);
}

function normalizeZipPath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/^\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function fileTitle(fileName: string) {
  return basename(fileName).replace(/\.epub$/i, '') || 'Untitled';
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || undefined : undefined;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
