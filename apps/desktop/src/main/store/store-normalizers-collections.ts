import type {
  Collection,
  CollectionMember,
  ContentRef,
  ContentRefKind,
  LibraryPin,
  LibraryPinTargetKind,
} from '@yomitomo/shared';
import type * as schema from '../db/schema';

type CollectionRow = typeof schema.collections.$inferSelect;
type CollectionMemberRow = typeof schema.collectionMembers.$inferSelect;
type LibraryPinRow = typeof schema.libraryPins.$inferSelect;

export function normalizeContentRefKind(value: unknown): ContentRefKind | null {
  return value === 'article' || value === 'weread' ? value : null;
}

export function normalizeLibraryPinTargetKind(value: unknown): LibraryPinTargetKind | null {
  return value === 'article' || value === 'weread' || value === 'collection' ? value : null;
}

export function normalizeContentRef(value: unknown): ContentRef | null {
  if (!isRecord(value)) return null;
  const kind = normalizeContentRefKind(value.kind);
  const id = normalizeId(value.id);
  return kind && id ? { kind, id } : null;
}

export function rowToCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    name: normalizeCollectionName(row.name),
    ...(row.desc ? { desc: row.desc } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToCollectionMember(row: CollectionMemberRow): CollectionMember | null {
  const kind = normalizeContentRefKind(row.memberKind);
  const id = normalizeId(row.memberId);
  if (!kind || !id) return null;
  return {
    collectionId: row.collectionId,
    member: { kind, id },
    addedAt: row.addedAt,
  };
}

export function rowToLibraryPin(row: LibraryPinRow): LibraryPin | null {
  const targetKind = normalizeLibraryPinTargetKind(row.targetKind);
  const targetId = normalizeId(row.targetId);
  if (!targetKind || !targetId) return null;
  return {
    targetKind,
    targetId,
    pinnedAt: row.pinnedAt,
  };
}

function normalizeCollectionName(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name || '未命名合集';
}

function normalizeId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
