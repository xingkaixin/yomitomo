import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { articleRecordFromEbookFile } from './ebook-import';
import { articleRecordFromKindleFile } from './kindle-import';

function arrayBufferFromBuffer(buffer: Buffer) {
  const data = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(data).set(buffer);
  return data;
}

describe('articleRecordFromKindleFile', () => {
  it('extracts AZW3 metadata, chapters, and cover image', async () => {
    const data = arrayBufferFromBuffer(
      kindleBook({
        version: 8,
        compression: 1,
        title: '测试 Kindle 书',
        author: '作者甲',
        fileHtml:
          '<html><body><h1>第一章</h1><p>第一章正文。</p><h1>第二章</h1><p>第二章正文。</p></body></html>',
        cover: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
      }),
    );

    const article = await articleRecordFromKindleFile({
      fileName: 'book.azw3',
      mimeType: 'application/vnd.amazon.ebook',
      data,
    });

    expect(article.sourceType).toBe('ebook');
    expect(article.siteName).toBe('AZW3');
    expect(article.title).toBe('测试 Kindle 书');
    expect(article.byline).toBe('作者甲');
    expect(article.leadImageUrl).toBe('data:image/jpeg;base64,/9j/2Q==');
    expect(article.ebook?.metadata.format).toBe('azw3');
    expect(article.ebook?.metadata.fileName).toBe('book.azw3');
    expect(article.ebook?.chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章']);
    expect(article.ebook?.index?.paragraphs.map((paragraph) => paragraph.previewStart)).toEqual([
      '第一章',
      '第一章正文。',
      '第二章',
      '第二章正文。',
    ]);
  });

  it('routes MOBI files through the unified ebook import entry', async () => {
    const data = arrayBufferFromBuffer(
      kindleBook({
        version: 6,
        compression: 1,
        title: '分页 MOBI',
        author: '作者乙',
        fileHtml:
          '<html><body><p>第一节</p><p>第一节正文。</p><mbp:pagebreak/><p>第二节</p><p>第二节正文。</p></body></html>',
      }),
    );

    const article = await articleRecordFromEbookFile({
      fileName: 'book.mobi',
      mimeType: 'application/x-mobipocket-ebook',
      data,
    });

    expect(article.siteName).toBe('MOBI');
    expect(article.ebook?.metadata.format).toBe('mobi');
    expect(article.ebook?.chapters.map((chapter) => chapter.title)).toEqual(['第一节', '第二节']);
  });

  it('rejects DRM-protected Kindle files', async () => {
    const data = arrayBufferFromBuffer(
      kindleBook({
        version: 6,
        compression: 1,
        encryptionType: 1,
        title: '加密 MOBI',
        author: '作者丙',
        fileHtml: '<html><body><p>正文。</p></body></html>',
      }),
    );

    await expect(
      articleRecordFromKindleFile({
        fileName: 'locked.mobi',
        data,
      }),
    ).rejects.toThrow('EBOOK_IMPORT_DRM_PROTECTED');
  });

  it('decodes a HUFF/CDIC book through the dictionary', async () => {
    const article = await articleRecordFromKindleFile({
      fileName: 'huff.mobi',
      data: arrayBufferFromBuffer(
        huffCdicBook([
          literalEntry('<html><body><h1>压缩章节</h1>'),
          literalEntry('<p>压缩正文。</p>'),
          literalEntry('</body></html>'),
        ]),
      ),
    });

    expect(article.ebook?.chapters.map((chapter) => chapter.title)).toEqual(['压缩章节']);
    expect(article.ebook?.chapters[0]?.html).toContain('压缩正文。');
  });

  it('rejects a dictionary entry that expands into itself', async () => {
    await expect(
      articleRecordFromKindleFile({
        fileName: 'cyclic.mobi',
        data: arrayBufferFromBuffer(huffCdicBook([compressedEntry([0])])),
      }),
    ).rejects.toThrow('EBOOK_IMPORT_INVALID_FILE');
  });

  it('rejects a two entry dictionary cycle', async () => {
    await expect(
      articleRecordFromKindleFile({
        fileName: 'cyclic-pair.mobi',
        data: arrayBufferFromBuffer(
          huffCdicBook([compressedEntry([1]), compressedEntry([0])], [0]),
        ),
      }),
    ).rejects.toThrow('EBOOK_IMPORT_INVALID_FILE');
  });

  it('rejects a dictionary nested deeper than the expansion budget', async () => {
    const depth = 40;
    const entries = Array.from({ length: depth }, (_, index) =>
      index === depth - 1 ? literalEntry('末端') : compressedEntry([index + 1]),
    );

    await expect(
      articleRecordFromKindleFile({
        fileName: 'deep.mobi',
        data: arrayBufferFromBuffer(huffCdicBook(entries, [0])),
      }),
    ).rejects.toThrow('EBOOK_IMPORT_INVALID_FILE');
  });

  it('rejects a dictionary that expands past the text budget', async () => {
    await expect(
      articleRecordFromKindleFile({
        fileName: 'oversize.mobi',
        data: arrayBufferFromBuffer(
          huffCdicBook(
            [literalEntry('x'.repeat(30_000))],
            Array.from({ length: 1000 }, () => 0),
            700,
          ),
        ),
      }),
    ).rejects.toThrow('EBOOK_IMPORT_ENTRY_TOO_LARGE');
  });

  it('rejects a CDIC record that claims an impossible code length', async () => {
    await expect(
      articleRecordFromKindleFile({
        fileName: 'wide-codes.mobi',
        data: arrayBufferFromBuffer(
          huffCdicBook([literalEntry('文本')], [0], 1, { codeLength: 24 }),
        ),
      }),
    ).rejects.toThrow('EBOOK_IMPORT_INVALID_CDIC');
  });
});

type HuffCdicDictionaryEntry = { bytes: Buffer; literal: boolean };

function literalEntry(text: string): HuffCdicDictionaryEntry {
  return { bytes: Buffer.from(text, 'utf8'), literal: true };
}

/**
 * An entry the decoder must expand: its bytes are another code stream, one byte per code.
 */
function compressedEntry(codes: number[]): HuffCdicDictionaryEntry {
  return { bytes: Buffer.from(codes), literal: false };
}

/**
 * Builds a MOBI whose text records are HUFF/CDIC code streams. table1 maps byte `b` to an
 * 8 bit code that resolves to dictionary entry `b`, so a text record is simply the list of
 * entry indices to emit.
 */
function huffCdicBook(
  entries: HuffCdicDictionaryEntry[],
  codes: number[] = entries.map((_, index) => index),
  textRecordCount = 1,
  options: { codeLength?: number } = {},
) {
  const record0 = kindleHeaderRecord({
    version: 6,
    compression: 0x4448,
    textLength: 1024,
    textRecordCount,
    resourceStart: 2 + textRecordCount,
    title: 'HUFF 书',
    author: '作者丁',
    huffcdic: 1 + textRecordCount,
    numHuffcdic: 2,
  });
  const textRecords = Array.from({ length: textRecordCount }, () => Buffer.from(codes));
  return palmDatabase([
    record0,
    ...textRecords,
    huffRecord(),
    cdicRecord(entries, options.codeLength ?? 16),
  ]);
}

function huffRecord() {
  const header = Buffer.alloc(16);
  header.write('HUFF', 0, 'ascii');
  header.writeUInt32BE(16, 8);
  header.writeUInt32BE(16 + 1024, 12);

  const table1 = Buffer.alloc(1024);
  for (let byte = 0; byte < 256; byte += 1) {
    // found | code length 8 | value = 2b, so code = value - (bits >>> 24) = b.
    table1.writeUInt32BE((((byte * 2) << 8) | 0x80 | 8) >>> 0, byte * 4);
  }
  return Buffer.concat([header, table1, Buffer.alloc(256)]);
}

function cdicRecord(entries: HuffCdicDictionaryEntry[], codeLength: number) {
  const header = Buffer.alloc(16);
  header.write('CDIC', 0, 'ascii');
  header.writeUInt32BE(16, 4);
  header.writeUInt32BE(entries.length, 8);
  header.writeUInt32BE(codeLength, 12);

  const offsets = Buffer.alloc(entries.length * 2);
  const payloads: Buffer[] = [];
  let cursor = offsets.byteLength;
  for (const [index, entry] of entries.entries()) {
    offsets.writeUInt16BE(cursor, index * 2);
    const payload = Buffer.alloc(2 + entry.bytes.byteLength);
    payload.writeUInt16BE((entry.literal ? 0x8000 : 0) | entry.bytes.byteLength, 0);
    entry.bytes.copy(payload, 2);
    payloads.push(payload);
    cursor += payload.byteLength;
  }
  return Buffer.concat([header, offsets, ...payloads]);
}

function kindleBook(input: {
  version: number;
  compression: number;
  encryptionType?: number;
  title: string;
  author: string;
  fileHtml: string;
  cover?: Buffer;
}) {
  const textRecord = Buffer.from(input.fileHtml, 'utf8');
  const cover = input.cover ?? Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const resourceStart = 2;
  const record0 = kindleHeaderRecord({
    ...input,
    textLength: textRecord.byteLength,
    textRecordCount: 1,
    resourceStart,
  });
  return palmDatabase([record0, textRecord, cover]);
}

function kindleHeaderRecord(input: {
  version: number;
  compression: number;
  encryptionType?: number;
  textLength: number;
  textRecordCount: number;
  resourceStart: number;
  title: string;
  author: string;
  huffcdic?: number;
  numHuffcdic?: number;
}) {
  const header = Buffer.alloc(248);
  header.writeUInt16BE(input.compression, 0);
  header.writeUInt32BE(input.textLength, 4);
  header.writeUInt16BE(input.textRecordCount, 8);
  header.writeUInt16BE(4096, 10);
  header.writeUInt16BE(input.encryptionType ?? 0, 12);
  header.write('MOBI', 16, 'ascii');
  header.writeUInt32BE(232, 20);
  header.writeUInt32BE(2, 24);
  header.writeUInt32BE(65001, 28);
  header.writeUInt32BE(1234, 32);
  header.writeUInt32BE(input.version, 36);
  header.writeUInt32BE(input.resourceStart, 108);
  header.writeUInt32BE(input.huffcdic ?? 0, 112);
  header.writeUInt32BE(input.numHuffcdic ?? 0, 116);
  header.writeUInt32BE(0x40, 128);
  header.writeUInt32BE(0, 240);

  const exth = exthHeader([
    exthString(100, input.author),
    exthString(101, '测试出版社'),
    exthString(503, input.title),
    exthString(524, 'zh'),
    exthInteger(201, 0),
  ]);
  const title = Buffer.from(input.title, 'utf8');
  header.writeUInt32BE(header.byteLength + exth.byteLength, 84);
  header.writeUInt32BE(title.byteLength, 88);
  return Buffer.concat([header, exth, title]);
}

function exthHeader(records: Buffer[]) {
  const length = 12 + records.reduce((sum, record) => sum + record.byteLength, 0);
  const header = Buffer.alloc(12);
  header.write('EXTH', 0, 'ascii');
  header.writeUInt32BE(length, 4);
  header.writeUInt32BE(records.length, 8);
  return Buffer.concat([header, ...records]);
}

function exthString(id: number, value: string) {
  return exthRecord(id, Buffer.from(value, 'utf8'));
}

function exthInteger(id: number, value: number) {
  const data = Buffer.alloc(4);
  data.writeUInt32BE(value, 0);
  return exthRecord(id, data);
}

function exthRecord(id: number, data: Buffer) {
  const record = Buffer.alloc(8);
  record.writeUInt32BE(id, 0);
  record.writeUInt32BE(8 + data.byteLength, 4);
  return Buffer.concat([record, data]);
}

function palmDatabase(records: Buffer[]) {
  const header = Buffer.alloc(78 + records.length * 8 + 2);
  header.write('TestBook', 0, 'ascii');
  header.write('BOOK', 60, 'ascii');
  header.write('MOBI', 64, 'ascii');
  header.writeUInt16BE(records.length, 76);

  let offset = header.byteLength;
  for (let index = 0; index < records.length; index += 1) {
    header.writeUInt32BE(offset, 78 + index * 8);
    offset += records[index]?.byteLength ?? 0;
  }

  return Buffer.concat([header, ...records]);
}
