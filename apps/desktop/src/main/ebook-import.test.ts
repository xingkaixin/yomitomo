import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import JSZip from 'jszip';
import { articleRecordFromEpubFile } from './ebook-import';

function arrayBufferFromBuffer(buffer: Buffer) {
  const data = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(data).set(buffer);
  return data;
}

describe('articleRecordFromEpubFile', () => {
  it('extracts epub metadata and chapters into an article record', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>`,
    );
    zip.file(
      'OPS/package.opf',
      `<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>测试电子书</dc:title>
          <dc:creator>作者甲</dc:creator>
          <dc:creator>作者乙</dc:creator>
          <dc:language>zh-CN</dc:language>
          <dc:description>一本测试书。</dc:description>
          <meta name="cover" content="cover"/>
        </metadata>
        <manifest>
          <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
          <item id="cover" href="cover.jpeg" media-type="image/jpeg"/>
          <item id="tocpage" href="tocpage.xhtml" media-type="application/xhtml+xml"/>
          <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
          <item id="c2" href="chapter2.xhtml" media-type="application/xhtml+xml"/>
          <item id="backtoc" href="backtoc.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine>
          <itemref idref="tocpage"/>
          <itemref idref="c1"/>
          <itemref idref="c2"/>
          <itemref idref="backtoc"/>
        </spine>
        <guide>
          <reference href="backtoc.xhtml" type="toc" title="Table of Contents"/>
        </guide>
      </package>`,
    );
    zip.file(
      'OPS/nav.xhtml',
      `<html><body><nav epub:type="toc"><ol>
        <li><a href="chapter1.xhtml">第一章</a></li>
        <li><a href="chapter2.xhtml">第二章</a></li>
      </ol></nav></body></html>`,
    );
    zip.file('OPS/cover.jpeg', Buffer.from([255, 216, 255, 217]));
    zip.file(
      'OPS/tocpage.xhtml',
      `<html><body><p>目录</p><ul>
        <li><a href="chapter1.xhtml">第一章</a></li>
        <li><a href="chapter2.xhtml">第二章</a></li>
        <li><a href="chapter1.xhtml">第一章</a></li>
        <li><a href="chapter2.xhtml">第二章</a></li>
        <li><a href="chapter1.xhtml">第一章</a></li>
      </ul></body></html>`,
    );
    zip.file(
      'OPS/chapter1.xhtml',
      '<html><body><p>第一章第一段。</p><p>第一章第二段。</p></body></html>',
    );
    zip.file('OPS/chapter2.xhtml', '<html><body><p>第二章正文。</p></body></html>');
    zip.file(
      'OPS/backtoc.xhtml',
      `<html><body><p>Table of Contents</p>
        <p><a href="chapter1.xhtml">第一章</a></p>
        <p><a href="chapter2.xhtml">第二章</a></p>
        <p><a href="chapter1.xhtml">第一章</a></p>
        <p><a href="chapter2.xhtml">第二章</a></p>
        <p><a href="chapter1.xhtml">第一章</a></p>
      </body></html>`,
    );

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const data = arrayBufferFromBuffer(buffer);
    const article = await articleRecordFromEpubFile({
      fileName: 'book.epub',
      mimeType: 'application/epub+zip',
      data,
    });

    expect(article.sourceType).toBe('ebook');
    expect(article.title).toBe('测试电子书');
    expect(article.byline).toBe('作者甲 & 作者乙');
    expect(article.leadImageUrl).toBe('data:image/jpeg;base64,/9j/2Q==');
    expect(article.ebook?.metadata.language).toBe('zh-CN');
    expect(article.ebook?.chapters.map((chapter) => chapter.title)).toEqual(['第一章', '第二章']);
    expect(article.contentHtml).toContain('第一章第一段');
    expect(article.contentHtml).not.toContain('Table of Contents');
    expect(article.ebook?.index?.chapters.map((chapter) => chapter.id)).toEqual([
      'chapter-1',
      'chapter-2',
    ]);
    expect(article.ebook?.index?.paragraphs.map((paragraph) => paragraph.previewStart)).toEqual([
      '第一章第一段。',
      '第一章第二段。',
      '第二章正文。',
    ]);
    expect(article.ebook?.index?.segments[0]).toMatchObject({
      id: 'chapter-1-segment-1',
      chapterId: 'chapter-1',
      indexInChapter: 0,
      textStart: 0,
      textLength: '第一章第一段。\n\n第一章第二段。'.length,
      previewStart: '第一章第一段。',
      previewEnd: '第一章第二段。',
    });
  });

  it('imports malformed chapter and ncx markup with stray close tags', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>`,
    );
    zip.file(
      'OPS/package.opf',
      `<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>松散标记电子书</dc:title>
          <dc:creator>作者乙</dc:creator>
        </metadata>
        <manifest>
          <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
          <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine toc="toc">
          <itemref idref="c1"/>
        </spine>
      </package>`,
    );
    zip.file(
      'OPS/toc.ncx',
      `<ncx><navMap><navPoint><navLabel><text>宽松章节</strong></text></navLabel><content src="chapter1.xhtml"/></navPoint></navMap></ncx>`,
    );
    zip.file(
      'OPS/chapter1.xhtml',
      '<html><body><h1>备用标题</h1><p>真实 EPUB 正文</span></p></body></html>',
    );

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const data = arrayBufferFromBuffer(buffer);
    const article = await articleRecordFromEpubFile({
      fileName: 'loose.epub',
      mimeType: 'application/epub+zip',
      data,
    });

    expect(article.title).toBe('松散标记电子书');
    expect(article.ebook?.chapters[0]?.title).toBe('宽松章节');
    expect(article.contentHtml).toContain('真实 EPUB 正文');
  });

  it('extracts sanitized paragraphs from nested chapter blocks', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>`,
    );
    zip.file(
      'OPS/package.opf',
      `<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>复杂段落电子书</dc:title>
        </metadata>
        <manifest>
          <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
        </manifest>
        <spine>
          <itemref idref="c1"/>
        </spine>
      </package>`,
    );
    zip.file(
      'OPS/chapter.xhtml',
      `<html><body>
        <h1>复杂章节</h1>
        <div><p>嵌套第一段。</p></div>
        <blockquote><p>引用段落。</p></blockquote>
        <table><tbody><tr><th>表头。</th><td>表格内容。</td></tr></tbody></table>
        <script>隐藏文本。</script>
      </body></html>`,
    );

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const data = arrayBufferFromBuffer(buffer);
    const article = await articleRecordFromEpubFile({
      fileName: 'nested.epub',
      mimeType: 'application/epub+zip',
      data,
    });

    expect(article.ebook?.index?.paragraphs.map((paragraph) => paragraph.previewStart)).toEqual([
      '复杂章节',
      '嵌套第一段。',
      '引用段落。',
      '表头。',
      '表格内容。',
    ]);
    expect(article.contentHtml).not.toContain('隐藏文本');
  });

  it('inlines html and svg chapter images', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>`,
    );
    zip.file(
      'OPS/package.opf',
      `<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>图片电子书</dc:title>
        </metadata>
        <manifest>
          <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
          <item id="photo" href="images/photo.png" media-type="image/png"/>
          <item id="vector" href="images/vector.svg" media-type="image/svg+xml"/>
        </manifest>
        <spine>
          <itemref idref="c1"/>
        </spine>
      </package>`,
    );
    zip.file(
      'OPS/chapter.xhtml',
      `<html><body>
        <p>带图片的正文。</p>
        <img src="images/photo.png" srcset="images/photo@2x.png 2x">
        <svg xmlns="http://www.w3.org/2000/svg"><image href="images/vector.svg"/></svg>
      </body></html>`,
    );
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    zip.file('OPS/images/photo.png', Buffer.from([1, 2, 3]));
    zip.file('OPS/images/vector.svg', svg);

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const data = arrayBufferFromBuffer(buffer);
    const events: { event: string; data?: Record<string, unknown> }[] = [];
    const article = await articleRecordFromEpubFile(
      {
        fileName: 'images.epub',
        mimeType: 'application/epub+zip',
        data,
      },
      {
        performanceLogger: (event, eventData) => events.push({ event, data: eventData }),
      },
    );

    expect(article.contentHtml).toContain('src="data:image/png;base64,AQID"');
    expect(article.contentHtml).toContain(
      `href="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"`,
    );
    expect(article.contentHtml).not.toContain('srcset=');
    expect(
      events.find(
        (entry) =>
          entry.event === 'performance.epub_import.chapter' && entry.data?.result === 'imported',
      )?.data,
    ).toMatchObject({
      imageElementCount: 2,
      inlinedImageCount: 2,
    });
  });
});
