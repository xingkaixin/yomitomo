import type { CollectionMember } from '@yomitomo/shared';
import {
  addCollectionMembersRows,
  createCollectionRows,
  deleteCollectionRows,
  readLibraryPinRows,
  removeCollectionMemberRows,
  renameCollectionRows,
  setLibraryPinRows,
  readCollectionsWithMembersRows,
} from '../collections/collection-repository';
import { getDatabase } from './store-db';

export async function listCollections() {
  return readCollectionsWithMembersRows(getDatabase());
}

export async function createCollection(input: { name: string }) {
  return createCollectionRows(getDatabase(), input);
}

export async function renameCollection(input: { collectionId: string; name: string }) {
  return renameCollectionRows(getDatabase(), input);
}

export async function deleteCollection(collectionId: string) {
  return deleteCollectionRows(getDatabase(), collectionId);
}

export async function addCollectionMembers(input: {
  collectionId: string;
  members: CollectionMember['member'][];
}) {
  return addCollectionMembersRows(getDatabase(), input);
}

export async function removeCollectionMember(input: {
  collectionId: string;
  member: CollectionMember['member'];
}) {
  return removeCollectionMemberRows(getDatabase(), input);
}

export async function listLibraryPins() {
  return readLibraryPinRows(getDatabase());
}

export async function setLibraryPin(input: Parameters<typeof setLibraryPinRows>[1]) {
  return setLibraryPinRows(getDatabase(), input);
}
