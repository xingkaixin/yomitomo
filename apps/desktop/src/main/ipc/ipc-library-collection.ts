import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';

type LibraryCollectionIpcContext = Pick<
  DesktopMainIpcContext,
  'sendCollectionPatched' | 'sendLibraryPinPatched'
> & {
  getPersistenceModules: () => Promise<{
    storeCollections: typeof import('../store/store-collections');
  }>;
};

export function registerLibraryCollectionIpc(context: LibraryCollectionIpcContext) {
  handleDesktopIpc('distillation-library:list', async (_event, input) => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    return collectionPersistence.listDistillationLibrary(input);
  });
  handleDesktopIpc('library-catalog:list', async (_event, input) => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    return collectionPersistence.listLibraryCatalog(input);
  });
  handleDesktopIpc('library-collection:list', async () => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    return collectionPersistence.listCollections();
  });
  handleDesktopIpc('library-collection:create', async (_event, input) => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    const result = await collectionPersistence.createCollection(input);
    context.sendCollectionPatched(result.patch);
    return result;
  });
  handleDesktopIpc('library-collection:rename', async (_event, input) => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    const patch = await collectionPersistence.renameCollection(input);
    context.sendCollectionPatched(patch);
    return patch;
  });
  handleDesktopIpc('library-collection:delete', async (_event, collectionId) => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    const patch = await collectionPersistence.deleteCollection(collectionId);
    context.sendCollectionPatched(patch);
    return patch;
  });
  handleDesktopIpc('library-collection:add-members', async (_event, input) => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    const patch = await collectionPersistence.addCollectionMembers(input);
    context.sendCollectionPatched(patch);
    return patch;
  });
  handleDesktopIpc('library-collection:remove-member', async (_event, input) => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    const patch = await collectionPersistence.removeCollectionMember(input);
    context.sendCollectionPatched(patch);
    return patch;
  });
  handleDesktopIpc('library-pin:list', async () => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    return collectionPersistence.listLibraryPins();
  });
  handleDesktopIpc('library-pin:set', async (_event, input) => {
    const { storeCollections: collectionPersistence } = await context.getPersistenceModules();
    const patch = await collectionPersistence.setLibraryPin(input);
    context.sendLibraryPinPatched(patch);
    return patch;
  });
}
