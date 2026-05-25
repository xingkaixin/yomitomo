import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noticesPath = join(repoRoot, 'THIRD_PARTY_NOTICES.md');
const pnpmLicenseFilter = '@yomitomo/desktop...';
const ignoredWorkspacePackagePaths = ['apps/download/package.json', 'apps/web/package.json'];
const vendorRoots = ['apps/desktop/src/renderer/src/vendor'];
const fontNoticePaths = ['apps/desktop/resources/licenses/fonts/THIRD_PARTY_FONT_NOTICES.md'];
const checkOnly = process.argv.includes('--check');
const ignoredPackageNames = ignoredWorkspacePackageNames();

const pnpmLicenses = JSON.parse(
  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['licenses', 'list', '--prod', '--json', '--filter', pnpmLicenseFilter],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  ),
);

const notices = renderNotices([
  ...licenseEntries(pnpmLicenses),
  ...vendorEntries(),
  ...fontEntries(),
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
    packages
      .filter((item) => !ignoredPackageNames.has(item.name))
      .map((item) => ({
        name: item.name,
        versions: normalizeVersions(item.versions),
        license: item.license || license,
        homepage: item.homepage || '',
      })),
  );
}

function ignoredWorkspacePackageNames() {
  return ignoredWorkspacePackagePaths.reduce((names, packagePath) => {
    const absolutePath = join(repoRoot, packagePath);
    if (!existsSync(absolutePath)) return names;

    const manifest = JSON.parse(readFileSync(absolutePath, 'utf8'));
    for (const key of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      for (const name of Object.keys(manifest[key] || {})) names.add(name);
    }
    return names;
  }, new Set());
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

function fontEntries() {
  return fontNoticePaths.flatMap((noticePath) => {
    const absolutePath = join(repoRoot, noticePath);
    if (!existsSync(absolutePath)) return [];

    return parseFontNotice(readFileSync(absolutePath, 'utf8'));
  });
}

function parseFontNotice(markdown) {
  const entries = [];
  let current;

  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) entries.push(current);
      current = { name: heading[1], body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) entries.push(current);

  return entries
    .map((entry) => {
      const body = entry.body.join('\n');
      return {
        name: entry.name,
        versions: field(body, 'Version') || 'bundled',
        license: normalizeFontLicense(field(body, 'License')),
        homepage: field(body, 'Source'),
      };
    })
    .filter((item) => item.name && item.license);
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

This file lists third-party production dependencies, vendored components, and bundled fonts used by Yomitomo Desktop.
It is generated from pnpm dependency metadata, vendor upstream metadata, and bundled font notices with:

\`\`\`bash
pnpm licenses:generate
\`\`\`

The project source code is licensed under MIT. Third-party packages, vendored components, and bundled fonts remain under their own licenses.

pnpm package licenses are limited to:

- \`${pnpmLicenseFilter}\`

Direct dependencies declared only by non-desktop apps are excluded from the generated desktop notice:

${ignoredWorkspacePackagePaths.map((path) => `- \`${path}\``).join('\n')}

Vendored components are discovered from:

${vendorRoots.map((root) => `- \`${root}/*/UPSTREAM.md\``).join('\n')}

Bundled font notices are discovered from:

${fontNoticePaths.map((path) => `- \`${path}\``).join('\n')}

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

function normalizeFontLicense(license) {
  if (license === 'SIL Open Font License 1.1') return 'OFL-1.1';
  return license;
}

function field(markdown, name) {
  return markdown.match(new RegExp(`^(?:-\\s*)?${name}:\\s*(.+)$`, 'm'))?.[1].trim() || '';
}
