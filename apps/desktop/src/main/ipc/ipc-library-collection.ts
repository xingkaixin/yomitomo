import type { DesktopMainIpcContext, DesktopPersistenceModule } from './ipc';
import { handleDesktopIpc } from './ipc';

type LibraryCollectionIpcContext = Pick<
  DesktopMainIpcContext,
  'sendCollectionPatched' | 'sendLibraryPinPatched'
> & {
  getPersistenceModule: () => Promise<{
    collectionPersistence: DesktopPersistenceModule['collectionPersistence'];
  }>;
};

export function registerLibraryCollectionIpc(context: LibraryCollectionIpcContext) {
  handleDesktopIpc('library-catalog:list', async (_event, input) => {
    const { collectionPersistence } = await context.getPersistenceModule();
    return collectionPersistence.listLibraryCatalog(input);
  });
  handleDesktopIpc('library-collection:list', async () => {
    const { collectionPersistence } = await context.getPersistenceModule();
    return collectionPersistence.listCollections();
  });
  handleDesktopIpc('library-collection:create', async (_event, input) => {
    const { collectionPersistence } = await context.getPersistenceModule();
    const result = await collectionPersistence.createCollection(input);
    context.sendCollectionPatched(result.patch);
    return result;
  });
  handleDesktopIpc('library-collection:rename', async (_event, input) => {
    const { collectionPersistence } = await context.getPersistenceModule();
    const patch = await collectionPersistence.renameCollection(input);
    context.sendCollectionPatched(patch);
    return patch;
  });
  handleDesktopIpc('library-collection:delete', async (_event, collectionId) => {
    const { collectionPersistence } = await context.getPersistenceModule();
    const patch = await collectionPersistence.deleteCollection(collectionId);
    context.sendCollectionPatched(patch);
    return patch;
  });
  handleDesktopIpc('library-collection:add-members', async (_event, input) => {
    const { collectionPersistence } = await context.getPersistenceModule();
    const patch = await collectionPersistence.addCollectionMembers(input);
    context.sendCollectionPatched(patch);
    return patch;
  });
  handleDesktopIpc('library-collection:remove-member', async (_event, input) => {
    const { collectionPersistence } = await context.getPersistenceModule();
    const patch = await collectionPersistence.removeCollectionMember(input);
    context.sendCollectionPatched(patch);
    return patch;
  });
  handleDesktopIpc('library-pin:list', async () => {
    const { collectionPersistence } = await context.getPersistenceModule();
    return collectionPersistence.listLibraryPins();
  });
  handleDesktopIpc('library-pin:set', async (_event, input) => {
    const { collectionPersistence } = await context.getPersistenceModule();
    const patch = await collectionPersistence.setLibraryPin(input);
    context.sendLibraryPinPatched(patch);
    return patch;
  });
}
