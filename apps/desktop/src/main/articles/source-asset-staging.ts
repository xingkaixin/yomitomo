import { randomUUID } from 'node:crypto';
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type SourceAssetWrite = {
  data: Uint8Array;
  targetPath: string;
};

export type StagedSourceAssets = {
  abort: () => Promise<void>;
  commit: () => Promise<void>;
  finalize: () => Promise<void>;
};

type StagedAsset = {
  backupPath: string;
  backupCreated: boolean;
  installed: boolean;
  stagingPath: string;
  targetPath: string;
};

export async function stageSourceAssets(writes: SourceAssetWrite[]): Promise<StagedSourceAssets> {
  const operationId = randomUUID();
  const assets = writes.map((write, index) => ({
    backupPath: `${write.targetPath}.backup-${operationId}-${index}`,
    backupCreated: false,
    installed: false,
    stagingPath: `${write.targetPath}.staging-${operationId}-${index}`,
    targetPath: write.targetPath,
  }));

  try {
    for (const [index, write] of writes.entries()) {
      await mkdir(dirname(write.targetPath), { recursive: true });
      await writeFile(assets[index].stagingPath, write.data);
    }
  } catch (error) {
    await removeStagingFiles(assets);
    throw error;
  }

  return {
    abort: () => rollbackSourceAssets(assets),
    commit: () => commitSourceAssets(assets),
    finalize: () => finalizeSourceAssets(assets),
  };
}

async function commitSourceAssets(assets: StagedAsset[]) {
  try {
    for (const asset of assets) {
      if (await pathExists(asset.targetPath)) {
        await rename(asset.targetPath, asset.backupPath);
        asset.backupCreated = true;
      }
      await rename(asset.stagingPath, asset.targetPath);
      asset.installed = true;
    }
  } catch (error) {
    try {
      await rollbackSourceAssets(assets);
    } catch (rollbackError) {
      throw Object.assign(new Error('SOURCE_ASSET_COMMIT_AND_ROLLBACK_FAILED', { cause: error }), {
        rollbackError,
      });
    }
    throw error;
  }
}

async function rollbackSourceAssets(assets: StagedAsset[]) {
  const errors: unknown[] = [];
  for (const asset of assets.toReversed()) {
    if (asset.installed) {
      await rm(asset.targetPath, { force: true }).catch((error) => errors.push(error));
      asset.installed = false;
    }
    if (asset.backupCreated) {
      const restored = await rename(asset.backupPath, asset.targetPath)
        .then(() => true)
        .catch((error) => {
          errors.push(error);
          return false;
        });
      if (restored) asset.backupCreated = false;
    }
    await rm(asset.stagingPath, { force: true }).catch((error) => errors.push(error));
  }
  if (errors.length > 0) throw new AggregateError(errors, 'SOURCE_ASSET_ROLLBACK_FAILED');
}

async function finalizeSourceAssets(assets: StagedAsset[]) {
  await Promise.all(
    assets.flatMap((asset) => [
      rm(asset.backupPath, { force: true }),
      rm(asset.stagingPath, { force: true }),
    ]),
  );
}

async function removeStagingFiles(assets: StagedAsset[]) {
  await Promise.all(assets.map((asset) => rm(asset.stagingPath, { force: true })));
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
