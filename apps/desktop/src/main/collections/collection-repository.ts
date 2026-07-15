import { and, desc, eq } from 'drizzle-orm';
import type {
  Collection,
  CollectionMember,
  CollectionStorePatch,
  CollectionWithMembers,
  ContentRef,
  LibraryPin,
  LibraryPinPatch,
  LibraryPinTargetKind,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import type { StoreDatabase, StoreExecutor } from '../store/store-db';
import * as schema from '../db/schema';
import {
  normalizeContentRef,
  rowToCollection,
  rowToCollectionMember,
  rowToLibraryPin,
} from '../store/store-normalizers';

export function readCollectionRows(database: StoreDatabase): Collection[] {
  return database
    .select()
    .from(schema.collections)
    .orderBy(desc(schema.collections.updatedAt))
    .all()
    .map(rowToCollection);
}

export function readCollectionMemberRows(database: StoreDatabase): CollectionMember[] {
  return database
    .select()
    .from(schema.collectionMembers)
    .orderBy(desc(schema.collectionMembers.addedAt))
    .all()
    .map(rowToCollectionMember)
    .filter((member): member is CollectionMember => Boolean(member));
}

export function readLibraryPinRows(database: StoreDatabase): LibraryPin[] {
  return database
    .select()
    .from(schema.libraryPins)
    .orderBy(desc(schema.libraryPins.pinnedAt))
    .all()
    .map(rowToLibraryPin)
    .filter((pin): pin is LibraryPin => Boolean(pin));
}

export function readCollectionsWithMembersRows(database: StoreDatabase): CollectionWithMembers[] {
  const membersByCollection = new Map<string, CollectionMember[]>();
  for (const member of readCollectionMemberRows(database)) {
    const members = membersByCollection.get(member.collectionId);
    if (members) members.push(member);
    else membersByCollection.set(member.collectionId, [member]);
  }

  const collections: CollectionWithMembers[] = [];
  for (const collection of readCollectionRows(database)) {
    collections.push({
      ...collection,
      members: membersByCollection.get(collection.id) || [],
    });
  }
  return collections;
}

export function createCollectionRows(
  database: StoreDatabase,
  input: { name: string },
): { collection: Collection; patch: CollectionStorePatch } {
  const now = new Date().toISOString();
  const collection: Collection = {
    id: makeId('collection'),
    name: normalizeCollectionNameInput(input.name),
    createdAt: now,
    updatedAt: now,
  };
  writeCollectionRows(database, collection);
  return { collection, patch: buildCollectionUpsertPatch(collection) };
}

export function renameCollectionRows(
  database: StoreDatabase,
  input: { collectionId: string; name: string },
): CollectionStorePatch {
  assertCollectionExists(database, input.collectionId);
  database
    .update(schema.collections)
    .set({
      name: normalizeCollectionNameInput(input.name),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.collections.id, input.collectionId))
    .run();
  return buildCollectionUpsertPatch(readRequiredCollectionRows(database, input.collectionId));
}

export function deleteCollectionRows(
  database: StoreDatabase,
  collectionId: string,
): CollectionStorePatch {
  assertCollectionExists(database, collectionId);
  database.transaction((tx) => {
    tx.delete(schema.libraryPins)
      .where(
        and(
          eq(schema.libraryPins.targetKind, 'collection'),
          eq(schema.libraryPins.targetId, collectionId),
        ),
      )
      .run();
    tx.delete(schema.collections).where(eq(schema.collections.id, collectionId)).run();
  });
  return { type: 'collection-delete', collectionId };
}

export function addCollectionMembersRows(
  database: StoreDatabase,
  input: { collectionId: string; members: ContentRef[] },
): CollectionStorePatch {
  assertCollectionExists(database, input.collectionId);
  const members = uniqueContentRefs(input.members);
  if (members.length === 0) return buildCollectionMembersPatch(database, input.collectionId);

  database.transaction((tx) => {
    const existing = new Set(
      tx
        .select({
          memberKind: schema.collectionMembers.memberKind,
          memberId: schema.collectionMembers.memberId,
        })
        .from(schema.collectionMembers)
        .where(eq(schema.collectionMembers.collectionId, input.collectionId))
        .all()
        .map((row) => contentRefKey({ kind: row.memberKind, id: row.memberId })),
    );
    const addedAt = new Date().toISOString();
    let addedCount = 0;
    for (const member of members) {
      if (existing.has(contentRefKey(member))) continue;
      tx.insert(schema.collectionMembers)
        .values({
          collectionId: input.collectionId,
          memberKind: member.kind,
          memberId: member.id,
          addedAt,
        })
        .run();
      addedCount += 1;
    }
    if (addedCount > 0) touchCollectionRows(tx, input.collectionId, addedAt);
  });

  return buildCollectionMembersPatch(database, input.collectionId);
}

export function removeCollectionMemberRows(
  database: StoreDatabase,
  input: { collectionId: string; member: ContentRef },
): CollectionStorePatch {
  assertCollectionExists(database, input.collectionId);
  database.transaction((tx) => {
    tx.delete(schema.collectionMembers)
      .where(
        and(
          eq(schema.collectionMembers.collectionId, input.collectionId),
          eq(schema.collectionMembers.memberKind, input.member.kind),
          eq(schema.collectionMembers.memberId, input.member.id),
        ),
      )
      .run();
    touchCollectionRows(tx, input.collectionId, new Date().toISOString());
  });
  return buildCollectionMembersPatch(database, input.collectionId);
}

export function setLibraryPinRows(
  database: StoreDatabase,
  input: { target: { kind: LibraryPinTargetKind; id: string }; pinned: boolean },
): LibraryPinPatch {
  const now = new Date().toISOString();
  const existing = readLibraryPinRows(database).find(
    (pin) => pin.targetKind === input.target.kind && pin.targetId === input.target.id,
  );
  const pin: LibraryPin = {
    targetKind: input.target.kind,
    targetId: input.target.id,
    pinnedAt: existing?.pinnedAt || now,
  };

  if (input.pinned) {
    database
      .insert(schema.libraryPins)
      .values(pinToRow({ ...pin, pinnedAt: now }))
      .onConflictDoUpdate({
        target: [schema.libraryPins.targetKind, schema.libraryPins.targetId],
        set: { pinnedAt: now },
      })
      .run();
    return { type: 'library-pin', pin: { ...pin, pinnedAt: now }, pinned: true };
  }

  database
    .delete(schema.libraryPins)
    .where(
      and(
        eq(schema.libraryPins.targetKind, input.target.kind),
        eq(schema.libraryPins.targetId, input.target.id),
      ),
    )
    .run();
  return { type: 'library-pin', pin, pinned: false };
}

export function writeCollectionRows(database: StoreExecutor, collection: Collection) {
  database
    .insert(schema.collections)
    .values(collectionToRow(collection))
    .onConflictDoUpdate({
      target: schema.collections.id,
      set: collectionToRow(collection),
    })
    .run();
}

export function writeCollectionMemberRows(database: StoreExecutor, member: CollectionMember) {
  database
    .insert(schema.collectionMembers)
    .values(collectionMemberToRow(member))
    .onConflictDoUpdate({
      target: [
        schema.collectionMembers.collectionId,
        schema.collectionMembers.memberKind,
        schema.collectionMembers.memberId,
      ],
      set: { addedAt: member.addedAt },
    })
    .run();
}

export function writeLibraryPinRows(database: StoreExecutor, pin: LibraryPin) {
  database
    .insert(schema.libraryPins)
    .values(pinToRow(pin))
    .onConflictDoUpdate({
      target: [schema.libraryPins.targetKind, schema.libraryPins.targetId],
      set: { pinnedAt: pin.pinnedAt },
    })
    .run();
}

function buildCollectionUpsertPatch(collection: Collection): CollectionStorePatch {
  return { type: 'collection-upsert', collection };
}

function buildCollectionMembersPatch(
  database: StoreDatabase,
  collectionId: string,
): CollectionStorePatch {
  return {
    type: 'collection-members',
    collectionId,
    members: readCollectionMembersForCollectionRows(database, collectionId),
  };
}

function readCollectionMembersForCollectionRows(
  database: StoreDatabase,
  collectionId: string,
): CollectionMember[] {
  return database
    .select()
    .from(schema.collectionMembers)
    .where(eq(schema.collectionMembers.collectionId, collectionId))
    .orderBy(desc(schema.collectionMembers.addedAt))
    .all()
    .map(rowToCollectionMember)
    .filter((member): member is CollectionMember => Boolean(member));
}

function readRequiredCollectionRows(database: StoreDatabase, id: string): Collection {
  const row = database.select().from(schema.collections).where(eq(schema.collections.id, id)).get();
  if (!row) throw new Error('COLLECTION_NOT_FOUND');
  return rowToCollection(row);
}

function assertCollectionExists(database: StoreDatabase, id: string) {
  readRequiredCollectionRows(database, id);
}

function normalizeCollectionNameInput(value: string) {
  const name = value.trim();
  if (!name) throw new Error('COLLECTION_NAME_REQUIRED');
  return name;
}

function uniqueContentRefs(members: ContentRef[]) {
  const result: ContentRef[] = [];
  const seen = new Set<string>();
  for (const value of members) {
    const member = normalizeContentRef(value);
    if (!member) continue;
    const key = contentRefKey(member);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(member);
  }
  return result;
}

function contentRefKey(member: { kind: string; id: string }) {
  return `${member.kind}:${member.id}`;
}

function touchCollectionRows(database: StoreExecutor, collectionId: string, updatedAt: string) {
  database
    .update(schema.collections)
    .set({ updatedAt })
    .where(eq(schema.collections.id, collectionId))
    .run();
}

function collectionToRow(collection: Collection): typeof schema.collections.$inferInsert {
  return {
    id: collection.id,
    name: collection.name,
    desc: collection.desc,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

function collectionMemberToRow(
  member: CollectionMember,
): typeof schema.collectionMembers.$inferInsert {
  return {
    collectionId: member.collectionId,
    memberKind: member.member.kind,
    memberId: member.member.id,
    addedAt: member.addedAt,
  };
}

function pinToRow(pin: LibraryPin): typeof schema.libraryPins.$inferInsert {
  return {
    targetKind: pin.targetKind,
    targetId: pin.targetId,
    pinnedAt: pin.pinnedAt,
  };
}
