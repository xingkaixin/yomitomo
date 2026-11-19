import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Tick01Icon } from '@hugeicons/core-free-icons';
import React, { useMemo, useReducer } from 'react';
import type {
  ArticleSummaryRecord,
  Collection,
  CollectionMember,
  ContentRef,
} from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { articleDisplayTitle } from './app-reading-library-utils';
import { CollectionIcon } from './collection-icon';

type EditMetadataFormState = {
  title: string;
  byline: string;
  error: string;
  submitting: boolean;
};

type EditMetadataFormEvent =
  | { type: 'titleEdited'; title: string }
  | { type: 'bylineEdited'; byline: string }
  | { type: 'titleMissing'; message: string }
  | { type: 'submitStarted' }
  | { type: 'submitFailed'; message: string }
  | { type: 'submitSucceeded' };

function editMetadataFormReducer(
  state: EditMetadataFormState,
  event: EditMetadataFormEvent,
): EditMetadataFormState {
  switch (event.type) {
    case 'titleEdited':
      return { ...state, title: event.title, error: '' };
    case 'bylineEdited':
      return { ...state, byline: event.byline, error: '' };
    case 'titleMissing':
      return { ...state, error: event.message };
    case 'submitStarted':
      return { ...state, error: '', submitting: true };
    case 'submitFailed':
      return { ...state, error: event.message, submitting: false };
    case 'submitSucceeded':
      return { ...state, submitting: false };
  }
}

function initialArticleByline(article: ArticleSummaryRecord) {
  if (article.sourceType === 'pdf') return article.byline || article.pdf?.metadata.author || '';
  return article.byline || '';
}

export function EditArticleMetadataDialog({
  article,
  onClose,
  onSave,
}: {
  article: ArticleSummaryRecord;
  onClose: () => void;
  onSave: (input: { articleId: string; title: string; byline?: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [{ title, byline, error, submitting }, dispatch] = useReducer(editMetadataFormReducer, {
    title: articleDisplayTitle(article),
    byline: initialArticleByline(article),
    error: '',
    submitting: false,
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      dispatch({ type: 'titleMissing', message: t('library.editMetadata.titleRequired') });
      return;
    }
    dispatch({ type: 'submitStarted' });
    try {
      await onSave({
        articleId: article.id,
        title: nextTitle,
        byline: byline.trim(),
      });
      dispatch({ type: 'submitSucceeded' });
      onClose();
    } catch (cause) {
      dispatch({
        type: 'submitFailed',
        message: cause instanceof Error ? cause.message : t('library.editMetadata.saveFailed'),
      });
    }
  }

  if (typeof document === 'undefined') return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="library-collection-dialog-overlay">
          <DialogContent className="library-collection-dialog">
            <form onSubmit={submit}>
              <header>
                <DialogTitle>{t('library.editMetadata.title')}</DialogTitle>
                <DialogDescription>{t('library.editMetadata.description')}</DialogDescription>
              </header>
              <label className="library-collection-name-field">
                <span>{t('library.editMetadata.titleLabel')}</span>
                <Input
                  autoFocus
                  value={title}
                  placeholder={t('library.editMetadata.titlePlaceholder')}
                  onChange={(event) => dispatch({ type: 'titleEdited', title: event.target.value })}
                />
              </label>
              <label className="library-collection-name-field">
                <span>{t('library.editMetadata.authorLabel')}</span>
                <Input
                  value={byline}
                  placeholder={t('library.editMetadata.authorPlaceholder')}
                  onChange={(event) =>
                    dispatch({ type: 'bylineEdited', byline: event.target.value })
                  }
                />
              </label>
              {error ? <p className="library-collection-dialog-error">{error}</p> : null}
              <footer>
                <Button type="button" variant="secondary" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {t('library.editMetadata.save')}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

type ItemCollectionsState = {
  pendingIds: ReadonlySet<string>;
  newCollectionName: string;
  creating: boolean;
  error: string;
};

type ItemCollectionsEvent =
  | { type: 'toggleStarted'; collectionId: string }
  | { type: 'toggleFinished'; collectionId: string; error?: string }
  | { type: 'newNameEdited'; name: string }
  | { type: 'createStarted' }
  | { type: 'createSucceeded' }
  | { type: 'createFailed'; message: string };

function itemCollectionsReducer(
  state: ItemCollectionsState,
  event: ItemCollectionsEvent,
): ItemCollectionsState {
  switch (event.type) {
    case 'toggleStarted': {
      const next = new Set(state.pendingIds);
      next.add(event.collectionId);
      return { ...state, pendingIds: next, error: '' };
    }
    case 'toggleFinished': {
      const next = new Set(state.pendingIds);
      next.delete(event.collectionId);
      return { ...state, pendingIds: next, error: event.error || '' };
    }
    case 'newNameEdited':
      return { ...state, newCollectionName: event.name, error: '' };
    case 'createStarted':
      return { ...state, creating: true, error: '' };
    case 'createSucceeded':
      return { ...state, creating: false, newCollectionName: '', error: '' };
    case 'createFailed':
      return { ...state, creating: false, error: event.message };
  }
}

export function ItemCollectionsDialog({
  collections,
  collectionMembers,
  itemTitle,
  memberRef,
  onAddMember,
  onClose,
  onCreateCollection,
  onRemoveMember,
}: {
  collections: Collection[];
  collectionMembers: CollectionMember[];
  itemTitle: string;
  memberRef: ContentRef;
  onAddMember: (collectionId: string, member: ContentRef) => Promise<void>;
  onClose: () => void;
  onCreateCollection: (name: string) => Promise<Collection>;
  onRemoveMember: (collectionId: string, member: ContentRef) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [{ pendingIds, newCollectionName, creating, error }, dispatch] = useReducer(
    itemCollectionsReducer,
    {
      pendingIds: new Set<string>(),
      newCollectionName: '',
      creating: false,
      error: '',
    },
  );

  const memberCollectionIds = useMemo(
    () =>
      new Set(
        collectionMembers
          .filter(
            (entry) => entry.member.kind === memberRef.kind && entry.member.id === memberRef.id,
          )
          .map((entry) => entry.collectionId),
      ),
    [collectionMembers, memberRef.id, memberRef.kind],
  );

  async function toggleCollection(collectionId: string) {
    if (pendingIds.has(collectionId)) return;
    dispatch({ type: 'toggleStarted', collectionId });
    try {
      if (memberCollectionIds.has(collectionId)) {
        await onRemoveMember(collectionId, memberRef);
      } else {
        await onAddMember(collectionId, memberRef);
      }
      dispatch({ type: 'toggleFinished', collectionId });
    } catch (cause) {
      dispatch({
        type: 'toggleFinished',
        collectionId,
        error: cause instanceof Error ? cause.message : t('library.collection.saveFailed'),
      });
    }
  }

  async function createAndAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCollectionName.trim();
    if (!name || creating) return;
    dispatch({ type: 'createStarted' });
    try {
      const created = await onCreateCollection(name);
      await onAddMember(created.id, memberRef);
      dispatch({ type: 'createSucceeded' });
    } catch (cause) {
      dispatch({
        type: 'createFailed',
        message: cause instanceof Error ? cause.message : t('library.collection.saveFailed'),
      });
    }
  }

  if (typeof document === 'undefined') return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="library-collection-dialog-overlay">
          <DialogContent className="library-collection-dialog library-item-collections-dialog">
            <header>
              <DialogTitle>{t('library.collection.manageTitle')}</DialogTitle>
              <DialogDescription>{itemTitle}</DialogDescription>
            </header>
            <div className="library-item-collections-list" role="group">
              {collections.length > 0 ? (
                collections.map((collection) => {
                  const checked = memberCollectionIds.has(collection.id);
                  const pending = pendingIds.has(collection.id);
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={pending}
                      className={
                        checked
                          ? 'library-item-collection-option is-checked'
                          : 'library-item-collection-option'
                      }
                      onClick={() => void toggleCollection(collection.id)}
                    >
                      <span className="library-type-filter-check">
                        {checked ? <HugeiconsIcon icon={Tick01Icon} size={13} /> : null}
                      </span>
                      <HugeiconsIcon icon={CollectionIcon} size={15} />
                      <span className="library-item-collection-option-name">{collection.name}</span>
                    </button>
                  );
                })
              ) : (
                <p className="library-item-collections-empty">
                  {t('library.collection.manageEmpty')}
                </p>
              )}
            </div>
            <form className="library-item-collection-create" onSubmit={createAndAdd}>
              <Input
                value={newCollectionName}
                placeholder={t('library.collection.quickCreatePlaceholder')}
                onChange={(event) => dispatch({ type: 'newNameEdited', name: event.target.value })}
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={creating || !newCollectionName.trim()}
              >
                <HugeiconsIcon icon={Add01Icon} size={14} />
                <span>{t('library.collection.create')}</span>
              </Button>
            </form>
            {error ? <p className="library-collection-dialog-error">{error}</p> : null}
            <footer>
              <Button type="button" onClick={onClose}>
                {t('common.done')}
              </Button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
