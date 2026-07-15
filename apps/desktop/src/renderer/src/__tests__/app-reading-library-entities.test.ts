import { describe, expect, it } from 'vitest';
import type { ArticleSummaryRecord, Collection, CollectionMember } from '@yomitomo/shared';
import {
  buildLibraryEntities,
  contentRefKey,
  libraryTypeFilterFromScope,
} from '../reading-library/app-reading-library-entities';
import type { LibraryItemType, LibraryTypeFilter } from '../reading-library/library-entity-types';

const now = '2026-06-23T00:00:00.000Z';

function summary(id: string, sourceType?: 'ebook' | 'pdf'): ArticleSummaryRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: id,
    contentHash: `hash_${id}`,
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...(sourceType ? { sourceType } : {}),
  } as ArticleSummaryRecord;
}

const articles: ArticleSummaryRecord[] = [
  summary('web_1'),
  summary('ebook_1', 'ebook'),
  summary('pdf_1', 'pdf'),
  summary('web_collected'),
];

const collections: Collection[] = [
  { id: 'col_1', name: '合集一', createdAt: now, updatedAt: now } as Collection,
];

const collectionMembers: CollectionMember[] = [
  {
    collectionId: 'col_1',
    member: { kind: 'article', id: 'web_collected' },
    addedAt: now,
  } as CollectionMember,
];

const enabledTypes: LibraryItemType[] = ['web', 'ebook', 'pdf', 'weread'];

function build(typeFilter: ReadonlySet<LibraryTypeFilter>) {
  return buildLibraryEntities({
    articles,
    collectionMembers,
    collections,
    enabledTypes,
    pins: [],
    query: '',
    typeFilter,
    wereadBooks: [],
  });
}

function itemIds(entities: ReturnType<typeof build>) {
  return entities.filter((e) => e.kind === 'item').map((e) => e.ref.id);
}

function hasCollection(entities: ReturnType<typeof build>) {
  return entities.some((e) => e.kind === 'col');
}

describe('buildLibraryEntities type filter (multi-select union)', () => {
  it('空集合 = 全部：含合集卡片，已入合集的散件被去重隐藏', () => {
    const entities = build(new Set());
    expect(hasCollection(entities)).toBe(true);
    const ids = itemIds(entities);
    expect(ids).toEqual(expect.arrayContaining(['web_1', 'ebook_1', 'pdf_1']));
    expect(ids).not.toContain('web_collected');
  });

  it('keeps stable member order across multiple and empty collections', () => {
    const entities = buildLibraryEntities({
      articles: [summary('first'), summary('second'), summary('third')],
      collectionMembers: [
        { collectionId: 'col-a', member: { kind: 'article', id: 'second' }, addedAt: now },
        { collectionId: 'col-b', member: { kind: 'article', id: 'third' }, addedAt: now },
        { collectionId: 'col-a', member: { kind: 'article', id: 'first' }, addedAt: now },
      ],
      collections: [
        { id: 'col-a', name: 'A', createdAt: now, updatedAt: now },
        { id: 'col-b', name: 'B', createdAt: now, updatedAt: now },
        { id: 'col-empty', name: 'Empty', createdAt: now, updatedAt: now },
      ],
      enabledTypes,
      pins: [],
      query: '',
      typeFilter: new Set(),
      wereadBooks: [],
    });
    const collectionById = new Map(
      entities
        .filter((entity) => entity.kind === 'col')
        .map((entity) => [entity.collection.id, entity]),
    );

    expect(collectionById.get('col-a')?.searchMembers?.map((item) => item.ref.id)).toEqual([
      'second',
      'first',
    ]);
    expect(collectionById.get('col-b')?.searchMembers?.map((item) => item.ref.id)).toEqual([
      'third',
    ]);
    expect(collectionById.get('col-empty')).toMatchObject({
      coverMembers: [],
      searchMembers: [],
      memberCount: 0,
    });
  });

  it('单选具体类型时不显示合集卡片，已入合集的散件正常出现', () => {
    const entities = build(new Set(['web']));
    expect(hasCollection(entities)).toBe(false);
    expect(itemIds(entities)).toEqual(expect.arrayContaining(['web_1', 'web_collected']));
    expect(itemIds(entities)).not.toContain('pdf_1');
  });

  it('多选多个类型取并集', () => {
    const entities = build(new Set(['web', 'pdf']));
    const ids = itemIds(entities);
    expect(ids).toEqual(expect.arrayContaining(['web_1', 'pdf_1', 'web_collected']));
    expect(ids).not.toContain('ebook_1');
    expect(hasCollection(entities)).toBe(false);
  });

  it('合集与具体类型可并存：显示合集卡片 + 该类型散件，并对已入合集散件去重', () => {
    const entities = build(new Set(['collection', 'web']));
    expect(hasCollection(entities)).toBe(true);
    const ids = itemIds(entities);
    expect(ids).toContain('web_1');
    expect(ids).not.toContain('web_collected');
    expect(ids).not.toContain('pdf_1');
  });

  it('libraryTypeFilterFromScope：all 映射为空集，具体类型映射为单元素集', () => {
    expect(libraryTypeFilterFromScope('all').size).toBe(0);
    expect([...libraryTypeFilterFromScope('pdf')]).toEqual(['pdf']);
  });
});

describe('contentRefKey', () => {
  it('生成稳定的 ref key', () => {
    expect(contentRefKey({ kind: 'article', id: 'a' })).toBe(
      contentRefKey({ kind: 'article', id: 'a' }),
    );
  });
});
