import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';

export function prepareFixtureProfile(configuredUserData: string | undefined) {
  if (!configuredUserData || !isAbsolute(configuredUserData)) {
    throw new Error('Fixture application requires a harness-created temporary profile');
  }
  const userData = realpathSync(configuredUserData);
  const root = dirname(userData);
  const withinTemporary = relative(realpathSync(tmpdir()), root);
  if (
    !withinTemporary ||
    withinTemporary.startsWith('..') ||
    isAbsolute(withinTemporary) ||
    !basename(root).startsWith('yomitomo-e2e-') ||
    basename(userData) !== 'user-data'
  ) {
    throw new Error('Fixture application refuses a non-harness profile');
  }
  const marker = JSON.parse(readFileSync(join(root, 'desktop-e2e-run.json'), 'utf8')) as {
    kind?: string;
  };
  if (marker.kind !== 'desktop-e2e-run') throw new Error('Fixture profile marker is invalid');
  const appData = join(root, 'app-data');
  mkdirSync(appData, { recursive: true });
  return { appData, userData };
}
