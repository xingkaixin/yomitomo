import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noticesPath = join(repoRoot, 'THIRD_PARTY_NOTICES.md');
const vendorRoots = ['apps/desktop/src/renderer/src/vendor'];
const checkOnly = process.argv.includes('--check');

const pnpmLicenses = JSON.parse(
  execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
    'licenses',
    'list',
    '--prod',
    '--json',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);

const notices = renderNotices([
  ...licenseEntries(pnpmLicenses),
  ...vendorEntries(),
]);

if (checkOnly) {
  const current = existsSync(noticesPath) ? readFileSync(noticesPath, 'utf8') : '';
  if (current !== notices) {
    console.error('THIRD_PARTY_NOTICES.md is out of date. Run pnpm licenses:generate.');
    process.exit(1);
  }
} else {
  writeFileSync(noticesPath, notices);
}

function licenseEntries(licensesByType) {
  return Object.entries(licensesByType).flatMap(([license, packages]) =>
    packages.map((item) => ({
      name: item.name,
      versions: normalizeVersions(item.versions),
      license: item.license || license,
      homepage: item.homepage || '',
    })),
  );
}

function vendorEntries() {
  return vendorRoots.flatMap((root) => {
    const absoluteRoot = join(repoRoot, root);
    if (!existsSync(absoluteRoot)) return [];

    return readdirSync(absoluteRoot)
      .map((name) => join(absoluteRoot, name))
      .filter((path) => statSync(path).isDirectory())
      .map(vendorEntry)
      .filter(Boolean);
  });
}

function vendorEntry(path) {
  const upstreamPath = join(path, 'UPSTREAM.md');
  if (!existsSync(upstreamPath)) return null;

  const upstream = readFileSync(upstreamPath, 'utf8');
  const source = field(upstream, 'Source');
  const license = field(upstream, 'License');
  if (!source || !license) return null;

  const commit = field(upstream, 'Commit');
  return {
    name: basename(path),
    versions: commit ? `vendored ${commit.slice(0, 7)}` : 'vendored',
    license,
    homepage: source,
  };
}

function renderNotices(entries) {
  const sortedEntries = [...entries].sort(compareEntries);
  const summaryRows = [...licenseCounts(sortedEntries).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([license, count]) => `| ${license} | ${count} |`);
  const packageRows = sortedEntries.map(
    (item) =>
      `| ${item.name} | ${item.versions} | ${item.license} | ${homepageCell(item.homepage)} |`,
  );

  return `# Third Party Notices

This file lists third-party production dependencies and vendored components used by Yomitomo.
It is generated from pnpm dependency metadata and vendor upstream metadata with:

\`\`\`bash
pnpm licenses:generate
\`\`\`

The project source code is licensed under MIT. Third-party packages and vendored components remain under their own licenses.

Vendored components are discovered from:

${vendorRoots.map((root) => `- \`${root}/*/UPSTREAM.md\``).join('\n')}

## License Summary

| License | Packages |
| --- | ---: |
${summaryRows.join('\n')}

## Packages

| Package | Versions | License | Homepage |
| --- | --- | --- | --- |
${packageRows.join('\n')}
`;
}

function licenseCounts(entries) {
  return entries.reduce((counts, item) => {
    counts.set(item.license, (counts.get(item.license) || 0) + 1);
    return counts;
  }, new Map());
}

function compareEntries(left, right) {
  return (
    left.name.localeCompare(right.name) ||
    left.license.localeCompare(right.license) ||
    left.versions.localeCompare(right.versions)
  );
}

function normalizeVersions(versions) {
  return Array.isArray(versions) ? versions.join(', ') : String(versions || '');
}

function homepageCell(homepage) {
  return homepage ? `[link](${homepage})` : '';
}

function field(markdown, name) {
  return markdown.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1].trim() || '';
}
