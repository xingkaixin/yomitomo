import { describe, expect, it } from 'vitest';
import { cleanEpubDisplayTitle, cleanEpubFileNameTitle } from './ebook-title-cleanup';

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

  it('removes unfinished marketing bracket tails from legacy titles', () => {
    expect(
      cleanEpubDisplayTitle({
        metadataTitle: '艾伦·图灵传——如谜的解谜者（87届奥斯卡最佳改编剧本奖《模仿游戏》原著',
      }),
    ).toBe('艾伦·图灵传——如谜的解谜者');

    expect(
      cleanEpubDisplayTitle({
        metadataTitle: '人类灭绝（读客熊猫君出品，《消失的13级台阶》作者经典之作',
      }),
    ).toBe('人类灭绝');
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

  it('compacts accidental spaces between CJK text and digits', () => {
    expect(
      cleanEpubDisplayTitle({
        metadataTitle: '一个故事的 99种讲法【豆瓣评分9.0近500人标记',
      }),
    ).toBe('一个故事的99种讲法');
  });

  it('removes publisher suffixes after marketing bracket cleanup', () => {
    expect(
      cleanEpubDisplayTitle({
        metadataTitle:
          '一个故事的99种讲法【豆瓣评分9.0近500人标记，中文读者翘首以盼，风靡欧美的动漫画工作坊经典教科书，呈现讲述同一个故事的99种“脑洞”】浦睿文化出品',
      }),
    ).toBe('一个故事的99种讲法');
  });
});

describe('cleanEpubFileNameTitle', () => {
  it('removes source noise and matching creator suffixes', () => {
    expect(cleanEpubFileNameTitle('book/Z-Library/失控 (Z-Library).epub')).toBe('失控');
    expect(cleanEpubFileNameTitle('必然_凯文·凯利.epub', '凯文·凯利')).toBe('必然');
  });
});
