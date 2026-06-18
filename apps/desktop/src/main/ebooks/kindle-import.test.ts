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
});

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
  header.writeUInt32BE(0, 112);
  header.writeUInt32BE(0, 116);
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
