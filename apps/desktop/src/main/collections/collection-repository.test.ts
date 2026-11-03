import { afterEach, describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';
import {
  addCollectionMembersRows,
  createCollectionRows,
  deleteCollectionRows,
  readCollectionMemberRows,
  readCollectionsWithMembersRows,
  readLibraryPinRows,
  removeCollectionMemberRows,
  setLibraryPinRows,
} from './collection-repository';

let sqlite: SQLiteDatabase.Database | null = null;

afterEach(() => {
  sqlite?.close();
  sqlite = null;
});

describe('collection repository', () => {
  it('removes one member without deleting sibling members', () => {
    const database = repositoryDatabase();
    const { collection } = createCollectionRows(database, { name: '合集' });
    addCollectionMembersRows(database, {
      collectionId: collection.id,
      members: [
        { kind: 'article', id: 'article_1' },
        { kind: 'weread', id: 'book_1' },
      ],
    });

    const patch = removeCollectionMemberRows(database, {
      collectionId: collection.id,
      member: { kind: 'article', id: 'article_1' },
    });

    expect(patch).toMatchObject({
      type: 'collection-members',
      members: [expect.objectContaining({ member: { kind: 'weread', id: 'book_1' } })],
    });
    expect(readCollectionMemberRows(database).map((member) => member.member)).toEqual([
      { kind: 'weread', id: 'book_1' },
    ]);
  });

  it('deletes members and collection pins with the collection', () => {
    const database = repositoryDatabase();
    const { collection } = createCollectionRows(database, { name: '合集' });
    addCollectionMembersRows(database, {
      collectionId: collection.id,
      members: [{ kind: 'article', id: 'article_1' }],
    });
    setLibraryPinRows(database, {
      target: { kind: 'collection', id: collection.id },
      pinned: true,
    });

    const patch = deleteCollectionRows(database, collection.id);

    expect(patch).toEqual({ type: 'collection-delete', collectionId: collection.id });
    expect(readCollectionsWithMembersRows(database)).toEqual([]);
    expect(readCollectionMemberRows(database)).toEqual([]);
    expect(readLibraryPinRows(database)).toEqual([]);
  });
});

function repositoryDatabase(): StoreDatabase {
  sqlite = new SQLiteDatabase(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
CREATE TABLE collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  desc TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE collection_members (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  member_kind TEXT NOT NULL,
  member_id TEXT NOT NULL,
  added_at TEXT NOT NULL
);
CREATE UNIQUE INDEX collection_members_unique_idx
ON collection_members(collection_id, member_kind, member_id);
CREATE TABLE library_pins (
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  pinned_at TEXT NOT NULL
);
CREATE UNIQUE INDEX library_pins_unique_idx
ON library_pins(target_kind, target_id);
`);
  return drizzle(sqlite, { schema });
}
