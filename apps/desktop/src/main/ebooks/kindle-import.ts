import { Buffer } from 'node:buffer';
import { basename } from 'node:path/posix';
import { JSDOM } from 'jsdom';
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
  type EbookFormat,
} from '@yomitomo/shared';
import { MAX_EBOOK_IMPORT_BYTES } from '../../ipc-contract';
import type { EbookImportFileInput, EbookImportOptions } from './ebook-import';

const BOOKMOBI_MAGIC_OFFSET = 60;
const PDB_RECORD_COUNT_OFFSET = 76;
const PDB_RECORD_LIST_OFFSET = 78;
const MOBI_HEADER_OFFSET = 16;
const PALMDOC_COMPRESSION_PALMDOC = 2;
const PALMDOC_COMPRESSION_HUFF_CDIC = 17480;
const KINDLE_HTML_BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,td,th';
const KINDLE_IMAGE_REFERENCE_ATTRIBUTES = [
  'src',
  'srcset',
  'recindex',
  'data-recindex',
  'href',
  'xlink:href',
];
const KINDLE_MIME_TYPES = new Set([
  'application/x-mobipocket-ebook',
  'application/vnd.amazon.ebook',
  'application/octet-stream',
]);
const MAX_KINDLE_CHAPTER_TEXT_CHARS = 1_500_000;
const MAX_KINDLE_TOTAL_TEXT_CHARS = 6_000_000;
const MAX_KINDLE_TOTAL_TEXT_BYTES = 18_000_000;
const MAX_KINDLE_COVER_BYTES = 2_000_000;

type PdbRecord = {
  index: number;
  offset: number;
  data: Buffer;
};

type PalmDocHeader = {
  compression: number;
  textLength: number;
  textRecordCount: number;
  encryptionType: number;
};

type MobiHeader = {
  encoding: number;
  uid: number;
  version: number;
  title: string;
  resourceStart: number;
  huffcdic: number;
  numHuffcdic: number;
  trailingFlags: number;
};

type ExthRecord = {
  id: number;
  data: Buffer;
};

type KindleMetadata = {
  title: string;
  creator?: string;
  language?: string;
  publisher?: string;
  description?: string;
  isbn?: string;
  published?: string;
  coverRecordOffset?: number;
};

type ParsedKindleBook = {
  format: EbookFormat;
  palmDoc: PalmDocHeader;
  mobi: MobiHeader;
  metadata: KindleMetadata;
  html: string;
  cover?: string;
  recordCount: number;
};

type ImportedKindleChapter = EbookChapterRecord & {
  paragraphs: string[];
};

export function isKindleFile(fileName: string, mimeType: string | undefined, data?: ArrayBuffer) {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.azw3') || lowerName.endsWith('.mobi')) return true;
  if (mimeType && KINDLE_MIME_TYPES.has(mimeType)) return true;
  if (!data || data.byteLength < BOOKMOBI_MAGIC_OFFSET + 8) return false;
  return Buffer.from(data, BOOKMOBI_MAGIC_OFFSET, 8).toString('ascii') === 'BOOKMOBI';
}

export async function articleRecordFromKindleFile(
  input: EbookImportFileInput,
  options: EbookImportOptions = {},
): Promise<ArticleRecord> {
  const importStartedAt = performanceStart();
  const fileName = input.fileName.trim() || 'Untitled.mobi';
  const fileSize = input.data.byteLength;
  if (!isKindleFile(fileName, input.mimeType, input.data))
    throw new Error('EBOOK_IMPORT_INVALID_FILE');
  if (fileSize > MAX_EBOOK_IMPORT_BYTES) throw new Error('EBOOK_IMPORT_FILE_TOO_LARGE');

  const parseStartedAt = performanceStart();
  const parsed = parseKindleBook(Buffer.from(input.data), detectKindleFormat(fileName));
  logKindleImportTiming(options.performanceLogger, 'parse', parseStartedAt, {
    fileName,
    fileSize,
    format: parsed.format,
    mobiVersion: parsed.mobi.version,
    textRecordCount: parsed.palmDoc.textRecordCount,
    recordCount: parsed.recordCount,
    htmlChars: parsed.html.length,
  });

  const titleCleanupStartedAt = performanceStart();
  const displayTitle = cleanEpubDisplayTitle({
    metadataTitle: parsed.metadata.title,
    fileName,
    creator: parsed.metadata.creator,
  });
  logKindleImportTiming(options.performanceLogger, 'title_cleanup', titleCleanupStartedAt, {
    fileName,
    fileSize,
    metadataTitleChars: parsed.metadata.title.length,
    displayTitleChars: displayTitle.length,
  });

  const chaptersStartedAt = performanceStart();
  const importedChapters = readKindleChapters(
    parsed.html,
    parsed.metadata.title || fileTitle(fileName),
  );
  logKindleImportTiming(options.performanceLogger, 'chapters', chaptersStartedAt, {
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
  const title = parsed.metadata.title || fileTitle(fileName);
  const id = hashText(
    `ebook:${parsed.format}:${title}:${parsed.metadata.creator || ''}:${contentHash}`,
  );
  const index = buildEpubBookIndex({ articleId: id, chapters: indexChapters });
  logKindleImportTiming(options.performanceLogger, 'index', indexStartedAt, {
    fileName,
    fileSize,
    chapterCount: chapters.length,
    paragraphCount: index.paragraphs.length,
    segmentCount: index.segments.length,
    textChars: fullText.length,
    chapterHtmlChars: chapters.reduce((total, chapter) => total + chapter.html.length, 0),
  });

  const now = new Date().toISOString();
  logKindleImportTiming(options.performanceLogger, 'total', importStartedAt, {
    fileName,
    fileSize,
    format: parsed.format,
    chapterCount: chapters.length,
    paragraphCount: index.paragraphs.length,
    segmentCount: index.segments.length,
    textChars: fullText.length,
  });

  return {
    id,
    url: `ebook:${id}`,
    canonicalUrl: `ebook:${id}`,
    sourceType: 'ebook',
    title,
    byline: parsed.metadata.creator,
    excerpt: parsed.metadata.description,
    siteName: parsed.format.toUpperCase(),
    leadImageUrl: parsed.cover,
    contentHash,
    ebook: {
      metadata: {
        format: parsed.format,
        fileName,
        fileSize,
        originalTitle: parsed.metadata.title || undefined,
        displayTitle,
        titleCleanupVersion: EPUB_TITLE_CLEANUP_VERSION,
        language: parsed.metadata.language,
        publisher: parsed.metadata.publisher,
        description: parsed.metadata.description,
      },
      chapters,
      index,
    },
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

function parseKindleBook(buffer: Buffer, fallbackFormat: EbookFormat): ParsedKindleBook {
  const records = readPdbRecords(buffer);
  const headerRecord = records[0]?.data;
  if (!headerRecord) throw new Error('EBOOK_IMPORT_INVALID_FILE');
  if (ascii(buffer, BOOKMOBI_MAGIC_OFFSET, BOOKMOBI_MAGIC_OFFSET + 8) !== 'BOOKMOBI') {
    throw new Error('EBOOK_IMPORT_INVALID_FILE');
  }

  const palmDoc = readPalmDocHeader(headerRecord);
  if (palmDoc.encryptionType !== 0) throw new Error('EBOOK_IMPORT_DRM_PROTECTED');

  const mobi = readMobiHeader(headerRecord);
  const exthRecords = readExthRecords(headerRecord);
  const metadata = readKindleMetadata(mobi, exthRecords);
  const html = readKindleHtml(records, palmDoc, mobi);
  const cover = readKindleCover(records, mobi.resourceStart, metadata.coverRecordOffset);
  const format = fallbackFormat === 'epub' ? (mobi.version >= 8 ? 'azw3' : 'mobi') : fallbackFormat;

  return {
    format,
    palmDoc,
    mobi,
    metadata,
    html,
    cover,
    recordCount: records.length,
  };
}

function readPdbRecords(buffer: Buffer): PdbRecord[] {
  const recordCount = uint16(buffer, PDB_RECORD_COUNT_OFFSET);
  if (recordCount <= 0) throw new Error('EBOOK_IMPORT_INVALID_FILE');
  const records: PdbRecord[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const entryOffset = PDB_RECORD_LIST_OFFSET + index * 8;
    const offset = uint32(buffer, entryOffset);
    const nextOffset =
      index + 1 < recordCount ? uint32(buffer, entryOffset + 8) : buffer.byteLength;
    if (offset < 0 || nextOffset < offset || nextOffset > buffer.byteLength) {
      throw new Error('EBOOK_IMPORT_INVALID_FILE');
    }
    records.push({ index, offset, data: buffer.subarray(offset, nextOffset) });
  }
  return records;
}

function readPalmDocHeader(record: Buffer): PalmDocHeader {
  return {
    compression: uint16(record, 0),
    textLength: uint32(record, 4),
    textRecordCount: uint16(record, 8),
    encryptionType: uint16(record, 12),
  };
}

function readMobiHeader(record: Buffer): MobiHeader {
  if (ascii(record, MOBI_HEADER_OFFSET, MOBI_HEADER_OFFSET + 4) !== 'MOBI') {
    throw new Error('EBOOK_IMPORT_INVALID_FILE');
  }
  const encoding = uint32(record, 28);
  const titleOffset = uint32(record, 84);
  const titleLength = uint32(record, 88);
  return {
    encoding,
    uid: uint32(record, 32),
    version: uint32(record, 36),
    title: decodeBytes(record.subarray(titleOffset, titleOffset + titleLength), encoding),
    resourceStart: uint32(record, 108),
    huffcdic: uint32(record, 112),
    numHuffcdic: uint32(record, 116),
    trailingFlags: safeUint32(record, 240, 0),
  };
}

function readExthRecords(record: Buffer): ExthRecord[] {
  const mobiLength = uint32(record, 20);
  const exthOffset = MOBI_HEADER_OFFSET + mobiLength;
  if (ascii(record, exthOffset, exthOffset + 4) !== 'EXTH') return [];
  const exthLength = uint32(record, exthOffset + 4);
  const exthCount = uint32(record, exthOffset + 8);
  if (exthLength <= 12 || exthOffset + exthLength > record.byteLength) return [];

  const records: ExthRecord[] = [];
  let cursor = exthOffset + 12;
  for (let index = 0; index < exthCount && cursor + 8 <= exthOffset + exthLength; index += 1) {
    const id = uint32(record, cursor);
    const length = uint32(record, cursor + 4);
    if (length < 8 || cursor + length > record.byteLength) break;
    records.push({ id, data: record.subarray(cursor + 8, cursor + length) });
    cursor += length;
  }
  return records;
}

function readKindleMetadata(mobi: MobiHeader, exthRecords: ExthRecord[]): KindleMetadata {
  const strings = new Map<number, string[]>();
  const integers = new Map<number, number>();
  for (const record of exthRecords) {
    if (record.data.byteLength === 4) integers.set(record.id, uint32(record.data, 0));
    const text = decodeBytes(record.data, mobi.encoding);
    if (text) strings.set(record.id, [...(strings.get(record.id) || []), text]);
  }
  return {
    title: firstString(strings, 503) || mobi.title,
    creator: strings.get(100)?.join(' & '),
    publisher: firstString(strings, 101),
    description: firstString(strings, 103),
    isbn: firstString(strings, 104),
    published: firstString(strings, 106),
    language: firstString(strings, 524),
    coverRecordOffset: integers.get(201),
  };
}

function readKindleHtml(records: PdbRecord[], palmDoc: PalmDocHeader, mobi: MobiHeader) {
  const decompress = kindleDecompressor(records, palmDoc, mobi);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  for (let recordIndex = 1; recordIndex <= palmDoc.textRecordCount; recordIndex += 1) {
    const record = records[recordIndex]?.data;
    if (!record) break;
    const textRecord = decompress(removeTrailingEntries(record, mobi.trailingFlags));
    totalBytes += textRecord.byteLength;
    if (totalBytes > MAX_KINDLE_TOTAL_TEXT_BYTES) throw new Error('EBOOK_IMPORT_ENTRY_TOO_LARGE');
    chunks.push(textRecord);
  }
  const html = decodeBytes(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), mobi.encoding)
    .replaceAll('\u0000', '')
    .trim();
  if (html.length > MAX_KINDLE_TOTAL_TEXT_CHARS) throw new Error('EBOOK_IMPORT_ENTRY_TOO_LARGE');
  return html;
}

function kindleDecompressor(
  records: PdbRecord[],
  palmDoc: PalmDocHeader,
  mobi: MobiHeader,
): (record: Uint8Array) => Uint8Array {
  if (palmDoc.compression === 1) return (record) => record;
  if (palmDoc.compression === PALMDOC_COMPRESSION_PALMDOC) return decompressPalmDoc;
  if (palmDoc.compression === PALMDOC_COMPRESSION_HUFF_CDIC) {
    return huffCdicDecompressor(mobi, (index) => records[index]?.data || Buffer.alloc(0));
  }
  throw new Error('EBOOK_IMPORT_UNSUPPORTED_COMPRESSION');
}

function readKindleCover(
  records: PdbRecord[],
  resourceStart: number,
  coverRecordOffset: number | undefined,
) {
  if (coverRecordOffset === undefined) return undefined;
  const record = records[resourceStart + coverRecordOffset]?.data;
  if (!record || record.byteLength > MAX_KINDLE_COVER_BYTES) return undefined;
  const mimeType = imageMimeType(record);
  return mimeType ? `data:${mimeType};base64,${record.toString('base64')}` : undefined;
}

function readKindleChapters(html: string, bookTitle: string): ImportedKindleChapter[] {
  const dom = new JSDOM(html);
  let headingChapters: ImportedKindleChapter[];
  try {
    headingChapters = chaptersFromDocument(dom.window.document, bookTitle);
  } finally {
    dom.window.close();
  }
  if (headingChapters.length > 1) return headingChapters;

  const pageSections = html
    .split(/<mbp:pagebreak\b[^>]*\/?>/gi)
    .map((section) => section.trim())
    .filter(Boolean);
  if (pageSections.length <= 1) return headingChapters;

  return pageSections.flatMap((sectionHtml, index) =>
    chapterFromHtmlSection(
      sectionHtml,
      `chapter-${index + 1}`,
      `kindle:section:${index}`,
      bookTitle,
    ),
  );
}

function chaptersFromDocument(document: Document, bookTitle: string): ImportedKindleChapter[] {
  const body = document.body || document.documentElement;
  if (!body) return [];
  const blocks = leafTextBlocks(body);
  if (blocks.length === 0) return [];

  const chapters: ImportedKindleChapter[] = [];
  let currentTitle = bookTitle || 'Untitled';
  let currentBlocks: Element[] = [];

  for (const block of blocks) {
    const blockTitle = cleanString(block.textContent);
    if (isHeadingElement(block) && blockTitle && currentBlocks.length > 0) {
      pushChapter(chapters, currentTitle, currentBlocks);
      currentTitle = blockTitle;
      currentBlocks = [block];
      continue;
    }
    if (isHeadingElement(block) && blockTitle && currentBlocks.length === 0)
      currentTitle = blockTitle;
    currentBlocks.push(block);
  }
  pushChapter(chapters, currentTitle, currentBlocks);
  return chapters;
}

function chapterFromHtmlSection(
  html: string,
  id: string,
  href: string,
  fallbackTitle: string,
): ImportedKindleChapter[] {
  const document = new JSDOM(html).window.document;
  const blocks = leafTextBlocks(document.body || document.documentElement);
  if (blocks.length === 0) return [];
  const title =
    cleanString(blocks.find((block) => isHeadingElement(block))?.textContent) ||
    cleanString(blocks[0]?.textContent) ||
    fallbackTitle ||
    'Untitled';
  const chapter = importedChapter(id, title, href, blocks);
  return chapter ? [chapter] : [];
}

function pushChapter(chapters: ImportedKindleChapter[], title: string, blocks: Element[]) {
  const chapter = importedChapter(
    `chapter-${chapters.length + 1}`,
    title || `Chapter ${chapters.length + 1}`,
    `kindle:section:${chapters.length}`,
    blocks,
  );
  if (chapter) chapters.push(chapter);
}

function importedChapter(
  id: string,
  title: string,
  href: string,
  blocks: Element[],
): ImportedKindleChapter | null {
  const html = sanitizeKindleHtml(blocks.map((block) => block.outerHTML).join('\n'));
  const paragraphs = chapterParagraphs(html);
  const textLength = paragraphs.join('\n\n').length;
  if (paragraphs.length === 0 || textLength === 0) return null;
  if (textLength > MAX_KINDLE_CHAPTER_TEXT_CHARS) throw new Error('EBOOK_IMPORT_ENTRY_TOO_LARGE');
  return {
    id,
    title,
    href,
    html,
    textLength,
    paragraphs,
  };
}

function sanitizeKindleHtml(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  try {
    stripChapterImageReferences(dom.window.document);
    return sanitizeArticleContent(
      dom.window.document,
      dom.window.document.body.innerHTML,
      'ebook://kindle/',
    ).html;
  } finally {
    dom.window.close();
  }
}

function stripChapterImageReferences(document: Document) {
  for (const image of Array.from(document.querySelectorAll('img,image'))) {
    for (const attribute of KINDLE_IMAGE_REFERENCE_ATTRIBUTES) image.removeAttribute(attribute);
  }
}

function chapterParagraphs(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  try {
    const blocks = leafTextBlocks(dom.window.document.body);
    const paragraphs = blocks.flatMap((element) => {
      const text = cleanString(element.textContent);
      return text ? [text] : [];
    });
    if (paragraphs.length > 0) return paragraphs;
    const text = cleanString(dom.window.document.body.textContent);
    return text ? [text] : [];
  } finally {
    dom.window.close();
  }
}

function leafTextBlocks(root: Element) {
  return Array.from(root.querySelectorAll(KINDLE_HTML_BLOCK_SELECTOR)).filter(
    (element) =>
      !Array.from(element.children).some((child) => child.matches(KINDLE_HTML_BLOCK_SELECTOR)),
  );
}

function isHeadingElement(element: Element) {
  return /^H[1-6]$/i.test(element.tagName);
}

function ebookChapterRecord(chapter: ImportedKindleChapter): EbookChapterRecord {
  return {
    id: chapter.id,
    title: chapter.title,
    href: chapter.href,
    html: chapter.html,
    textLength: chapter.textLength,
  };
}

function detectKindleFormat(fileName: string): EbookFormat {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.azw3')) return 'azw3';
  if (lowerName.endsWith('.mobi')) return 'mobi';
  return 'mobi';
}

function logKindleImportTiming(
  logger: EbookImportOptions['performanceLogger'],
  phase: string,
  startedAt: number,
  data: Record<string, unknown> = {},
) {
  logger?.(`performance.kindle_import.${phase}`, {
    elapsedMs: performanceElapsedMs(startedAt),
    ...data,
  });
}

function firstString(records: Map<number, string[]>, id: number) {
  return records.get(id)?.find(Boolean);
}

function imageMimeType(record: Buffer) {
  if (record[0] === 0xff && record[1] === 0xd8) return 'image/jpeg';
  if (record.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (ascii(record, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(record, 0, 4) === 'RIFF' && ascii(record, 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function decompressPalmDoc(input: Uint8Array) {
  const output: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const byte = input[index] ?? 0;
    if (byte === 0) output.push(byte);
    else if (byte <= 8) {
      for (const value of input.subarray(index + 1, (index += byte) + 1)) output.push(value);
    } else if (byte <= 0x7f) output.push(byte);
    else if (byte <= 0xbf) {
      const bytes = (byte << 8) | (input[(index += 1)] ?? 0);
      const distance = (bytes & 0x3fff) >>> 3;
      const length = (bytes & 0x07) + 3;
      for (let offset = 0; offset < length; offset += 1) {
        output.push(output[output.length - distance] ?? 0);
      }
    } else output.push(32, byte ^ 0x80);
  }
  return Uint8Array.from(output);
}

function huffCdicDecompressor(
  mobi: MobiHeader,
  loadRecord: (index: number) => Uint8Array,
): (record: Uint8Array) => Uint8Array {
  const huffRecord = loadRecord(mobi.huffcdic);
  if (ascii(huffRecord, 0, 4) !== 'HUFF') throw new Error('EBOOK_IMPORT_INVALID_HUFF');
  const offset1 = uint32(huffRecord, 8);
  const offset2 = uint32(huffRecord, 12);
  const table1 = Array.from({ length: 256 }, (_, index) =>
    uint32(huffRecord, offset1 + index * 4),
  ).map((value) => [value & 0x80, value & 0x1f, value >>> 8] as const);
  const table2 = [null as [number, number] | null].concat(
    Array.from(
      { length: 32 },
      (_, index) =>
        [uint32(huffRecord, offset2 + index * 8), uint32(huffRecord, offset2 + index * 8 + 4)] as [
          number,
          number,
        ],
    ),
  );
  const dictionary: Array<[Uint8Array, boolean]> = [];
  for (let index = 1; index < mobi.numHuffcdic; index += 1) {
    const record = loadRecord(mobi.huffcdic + index);
    if (ascii(record, 0, 4) !== 'CDIC') throw new Error('EBOOK_IMPORT_INVALID_CDIC');
    const length = uint32(record, 4);
    const numEntries = uint32(record, 8);
    const codeLength = uint32(record, 12);
    const entryCount = Math.min(1 << codeLength, numEntries - dictionary.length);
    const buffer = record.subarray(length);
    for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
      const offset = uint16(buffer, entryIndex * 2);
      const value = uint16(buffer, offset);
      const entryLength = value & 0x7fff;
      dictionary.push([
        buffer.subarray(offset + 2, offset + 2 + entryLength),
        Boolean(value & 0x8000),
      ]);
    }
  }

  const decompress = (byteArray: Uint8Array): Uint8Array => {
    let output = new Uint8Array();
    const bitLength = byteArray.byteLength * 8;
    for (let cursor = 0; cursor < bitLength; ) {
      const bits = Number(read32Bits(byteArray, cursor));
      let [found, codeLength, value] = table1[bits >>> 24] || [0, 0, 0];
      if (!found) {
        while (bits >>> (32 - codeLength) < (table2[codeLength]?.[0] ?? 0)) codeLength += 1;
        value = table2[codeLength]?.[1] ?? value;
      }
      cursor += codeLength;
      if (cursor > bitLength) break;
      const code = value - (bits >>> (32 - codeLength));
      const dictionaryEntry = dictionary[code];
      if (!dictionaryEntry) break;
      let [result, decompressed] = dictionaryEntry;
      if (!decompressed) {
        result = decompress(result);
        dictionary[code] = [result, true];
      }
      output = concatUint8Array(output, result);
    }
    return output;
  };
  return decompress;
}

function removeTrailingEntries(input: Uint8Array, trailingFlags: number) {
  let array = input;
  const multibyte = trailingFlags & 1;
  const trailingEntryCount = countBitsSet(trailingFlags >>> 1);
  for (let index = 0; index < trailingEntryCount; index += 1) {
    const length = getVarLenFromEnd(array);
    array = array.subarray(0, -length);
  }
  if (multibyte && array.length > 0) {
    const length = ((array[array.length - 1] ?? 0) & 0x03) + 1;
    array = array.subarray(0, -length);
  }
  return array;
}

function getVarLenFromEnd(byteArray: Uint8Array) {
  let value = 0;
  for (const byte of byteArray.subarray(-4)) {
    if (byte & 0x80) value = 0;
    value = (value << 7) | (byte & 0x7f);
  }
  return value;
}

function read32Bits(byteArray: Uint8Array, from: number) {
  const startByte = from >> 3;
  const end = from + 32;
  const endByte = end >> 3;
  let bits = 0n;
  for (let index = startByte; index <= endByte; index += 1) {
    bits = (bits << 8n) | BigInt(byteArray[index] ?? 0);
  }
  return (bits >> (8n - BigInt(end & 7))) & 0xffffffffn;
}

function concatUint8Array(left: Uint8Array, right: Uint8Array) {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}

function countBitsSet(value: number) {
  let count = 0;
  for (let cursor = value; cursor > 0; cursor >>= 1) if ((cursor & 1) === 1) count += 1;
  return count;
}

function decodeBytes(buffer: Uint8Array, encoding: number) {
  const label = encoding === 1252 ? 'windows-1252' : 'utf-8';
  return trimTrailingNullCharacters(new TextDecoder(label).decode(buffer));
}

function trimTrailingNullCharacters(value: string) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}

function safeUint32(buffer: Uint8Array, offset: number, fallback: number) {
  return offset + 4 <= buffer.byteLength ? uint32(buffer, offset) : fallback;
}

function uint16(buffer: Uint8Array, offset: number) {
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength).readUInt16BE(offset);
}

function uint32(buffer: Uint8Array, offset: number) {
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength).readUInt32BE(offset);
}

function ascii(buffer: Uint8Array, start: number, end: number) {
  return Buffer.from(buffer.buffer, buffer.byteOffset + start, Math.max(0, end - start)).toString(
    'ascii',
  );
}

function fileTitle(fileName: string) {
  return basename(fileName).replace(/\.(?:azw3|mobi)$/i, '') || 'Untitled';
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || undefined : undefined;
}
