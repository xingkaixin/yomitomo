import { Buffer } from 'node:buffer';
import { basename, dirname } from 'node:path/posix';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { buildEpubBookIndex, epubIndexText, type EpubBookIndexChapterInput } from '@yomitomo/core';
import { sanitizeArticleContentHtml } from '@yomitomo/core/article-extraction';
import { hashText, type ArticleRecord, type EbookChapterRecord } from '@yomitomo/shared';

const MAX_EPUB_BYTES = 80 * 1024 * 1024;
const EPUB_MIME = 'application/epub+zip';
const XHTML_TYPES = new Set(['application/xhtml+xml', 'text/html', 'application/xml', 'text/xml']);
const CHAPTER_PARAGRAPH_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,td,th';

export type EbookImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
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

export async function articleRecordFromEpubFile(
  input: EbookImportFileInput,
): Promise<ArticleRecord> {
  const fileName = input.fileName.trim() || 'Untitled.epub';
  const fileSize = input.data.byteLength;
  if (!isEpubFile(fileName, input.mimeType)) throw new Error('请选择 EPUB 文件');
  if (fileSize > MAX_EPUB_BYTES) throw new Error('EPUB 文件不能超过 80MB');

  const zip = await JSZip.loadAsync(Buffer.from(input.data));
  const epub = await readEpubPackage(zip);
  const chapterTitleByPath = await readChapterTitles(zip, epub);
  const importedChapters = await readEpubChapters(zip, epub, chapterTitleByPath);
  if (importedChapters.length === 0) throw new Error('EPUB 中没有可读取章节');

  const cover = await readCoverImage(zip, epub);
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
  const now = new Date().toISOString();

  return {
    id,
    url: `ebook:${id}`,
    canonicalUrl: `ebook:${id}`,
    sourceType: 'ebook',
    title: epub.title || fileTitle(fileName),
    byline: epub.creator,
    excerpt: epub.description,
    siteName: '电子书',
    leadImageUrl: cover,
    contentHtml: chaptersToArticleHtml(chapters),
    contentHash,
    ebook: {
      metadata: {
        format: 'epub',
        fileName,
        fileSize,
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

async function readEpubPackage(zip: JSZip): Promise<EpubPackage> {
  const containerText = await zipText(zip, 'META-INF/container.xml');
  if (!containerText) throw new Error('EPUB 缺少 container.xml');

  const rootfilePath = readXml(containerText, (document) => {
    const rootfile = elementsByLocalName(document, 'rootfile')[0];
    return normalizeZipPath(rootfile?.getAttribute('full-path') || '');
  });
  if (!rootfilePath) throw new Error('EPUB 缺少 OPF 包描述');

  const opfText = await zipText(zip, rootfilePath);
  if (!opfText) throw new Error('无法读取 EPUB 包描述');

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

    return {
      opfPath: rootfilePath,
      opfDir,
      title: textByLocalName(document, 'title') || fileTitle(rootfilePath),
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
): Promise<ImportedEbookChapter[]> {
  const manifestById = new Map(epub.manifest.map((item) => [item.id, item]));
  const chapters: ImportedEbookChapter[] = [];

  for (const idref of epub.spineIds) {
    const item = manifestById.get(idref);
    if (!item || !XHTML_TYPES.has(item.mediaType)) continue;
    const text = await zipText(zip, item.path);
    if (!text) continue;

    const dom = parseLooseMarkupDom(text);
    try {
      await inlineChapterImages(dom.window.document, zip, item.path, epub.manifest);
      if (isTocSpineItem(dom.window.document, item, epub)) continue;
      const body = dom.window.document.body || dom.window.document.documentElement;
      const rawHtml = body?.innerHTML || '';
      const html = sanitizeArticleContentHtml(
        dom.window.document,
        rawHtml,
        `https://ebook.local/${item.path}`,
      );
      const paragraphs = chapterParagraphs(html);
      const textLength = paragraphs.join('\n\n').length;
      if (textLength === 0) continue;
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

async function inlineChapterImages(
  document: Document,
  zip: JSZip,
  chapterPath: string,
  manifest: ManifestItem[],
) {
  const mediaTypeByPath = new Map(manifest.map((item) => [item.path, item.mediaType]));
  const baseDir = dirname(chapterPath) === '.' ? '' : dirname(chapterPath);

  for (const image of Array.from(document.querySelectorAll<HTMLImageElement>('img[src]'))) {
    const src = image.getAttribute('src');
    const dataUrl = src
      ? await imageDataUrl(zip, resolveZipPath(baseDir, src), mediaTypeByPath)
      : '';
    if (dataUrl) image.setAttribute('src', dataUrl);
    else image.removeAttribute('src');
    image.removeAttribute('srcset');
  }

  for (const image of Array.from(document.querySelectorAll('image'))) {
    const href = image.getAttribute('href') || image.getAttribute('xlink:href');
    const dataUrl = href
      ? await imageDataUrl(zip, resolveZipPath(baseDir, href), mediaTypeByPath)
      : '';
    if (!dataUrl) continue;
    image.setAttribute('href', dataUrl);
    image.removeAttribute('xlink:href');
  }
}

async function imageDataUrl(zip: JSZip, imagePath: string, mediaTypeByPath: Map<string, string>) {
  if (imagePath.startsWith('data:image/')) return imagePath;
  const file = zipFile(zip, imagePath);
  if (!file) return '';
  const mediaType = imageMimeType(mediaTypeByPath.get(imagePath), imagePath);
  if (!mediaType) return '';
  return `data:${mediaType};base64,${await file.async('base64')}`;
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

function chapterParagraphs(html: string) {
  const dom = new JSDOM(`<article>${html}</article>`);
  try {
    const body = dom.window.document.body;
    const blockElements = Array.from(body.querySelectorAll(CHAPTER_PARAGRAPH_SELECTOR)).filter(
      (element) =>
        !Array.from(element.children).some((child) => child.matches(CHAPTER_PARAGRAPH_SELECTOR)),
    );
    const paragraphs = blockElements.flatMap((element) => {
      const text = cleanString(element.textContent);
      return text ? [text] : [];
    });
    if (paragraphs.length > 0) return paragraphs;
    const text = cleanString(body.textContent);
    return text ? [text] : [];
  } finally {
    dom.window.close();
  }
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
