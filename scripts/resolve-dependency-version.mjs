import { execSync } from 'node:child_process';
import { dirname } from 'node:path';

const catalog = JSON.parse(
  execSync('pnpm config get catalog --json', {
    cwd: dirname(import.meta.dirname),
    encoding: 'utf8',
  }),
);

export function resolveDependencyVersion(name, version) {
  return version === 'catalog:' ? catalog?.[name] : version;
}
