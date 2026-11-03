import { describe, expect, it } from 'vitest';
import { cleanEpubDisplayTitle } from './ebook-title-cleanup';

describe('cleanEpubDisplayTitle', () => {
  it('removes marketing bracket segments from metadata titles', () => {
    expect(
      cleanEpubDisplayTitle({
        metadataTitle: '消失的13级台阶（罗翔推荐！荣获日本推理小说至高荣誉江户川乱步奖！）',
        fileName: 'book.epub',
      }),
    ).toBe('消失的13级台阶');

    expect(
      cleanEpubDisplayTitle({
        metadataTitle: '坏血：一个硅谷巨头的秘密与谎言 (两届普利策奖得主揭露轰动世界的旷世骗局)',
      }),
    ).toBe('坏血：一个硅谷巨头的秘密与谎言');
  });

  it('keeps non-marketing bracket segments', () => {
    expect(cleanEpubDisplayTitle({ metadataTitle: '魔鬼经济学系列(套装共4册)' })).toBe(
      '魔鬼经济学系列(套装共4册)',
    );
    expect(cleanEpubDisplayTitle({ metadataTitle: '人月神话(二十周年纪念版)' })).toBe(
      '人月神话(二十周年纪念版)',
    );
  });

  it('falls back to cleaned file names for unhelpful metadata titles', () => {
    expect(
      cleanEpubDisplayTitle({
        metadataTitle: '未知',
        fileName: '麦田里的守望者 (z-lib.org).epub',
      }),
    ).toBe('麦田里的守望者');

    expect(
      cleanEpubDisplayTitle({
        metadataTitle: 'Unknown',
        fileName: 'The Catcher in the Rye - J. D. Salinger.epub',
        creator: 'J. D. Salinger',
      }),
    ).toBe('The Catcher in the Rye');
  });
});
