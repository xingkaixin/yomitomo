import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noticesPath = join(repoRoot, 'THIRD_PARTY_NOTICES.md');
const desktopPackageName = '@yomitomo/desktop';
const pnpmLicenseFilter = `${desktopPackageName}...`;
const electronNativeDir = 'apps/desktop/electron-native';
// electron-vite externalizes only desktop dependencies and bundles the devDependencies that
// main, preload, and renderer import (docs/release-guide.md), so every desktop devDependency
// counts as shipped except these build and test packages. Electron ships its own license
// files, and the packaged better-sqlite3 comes from electron-native.
const desktopToolPackages = [
  '@effect/vitest',
  '@electron/rebuild',
  '@tailwindcss/postcss',
  '@vitejs/plugin-react',
  'better-sqlite3',
  'drizzle-kit',
  'electron',
  'electron-builder',
  'electron-builder-squirrel-windows',
  'electron-vite',
  'playwright-core',
  'postcss',
  'vite',
  'vitest',
];
// Type declarations and the compiler are never packaged, even when a runtime package lists them
// as a dependency or an optional peer.
const typePackages = ['@types/*', '@cloudflare/workers-types', 'typescript'];
const vendorRoots = ['apps/desktop/src/renderer/src/vendor'];
const fontNoticePaths = ['apps/desktop/resources/licenses/fonts/THIRD_PARTY_FONT_NOTICES.md'];
const checkOnly = process.argv.includes('--check');

if (!existsSync(join(repoRoot, electronNativeDir, 'node_modules'))) {
  console.error(
    `${electronNativeDir}/node_modules is missing. Run pnpm --filter ${desktopPackageName} native:install.`,
  );
  process.exit(1);
}

const notices = renderNotices([
  ...licenseEntries(
    // pnpm 12's licenses --prod omits transitive optional dependencies, including native binaries.
    pnpmJson(['licenses', 'list', '--json', '--filter', pnpmLicenseFilter]),
    shippedVersions(
      pnpmJson(['list', '--depth', 'Infinity', '--json', '--filter', pnpmLicenseFilter]),
      desktopRuntimeDependencies,
    ),
  ),
  ...licenseEntries(
    pnpmJson(['licenses', 'list', '--json', '--dir', electronNativeDir]),
    shippedVersions(
      pnpmJson(['list', '--prod', '--depth', 'Infinity', '--json', '--dir', electronNativeDir]),
      (project) => dependencyEntries(project),
    ),
  ),
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

function licenseEntries(licensesByType, shipped) {
  return Object.entries(licensesByType).flatMap(([license, packages]) =>
    packages.flatMap((item) => {
      const versions = item.versions.filter((version) => shipped.has(`${item.name}@${version}`));
      if (versions.length === 0) return [];
      return [
        {
          name: item.name,
          versions: normalizeVersions(versions),
          license: item.license || license,
          homepage: item.homepage || '',
        },
      ];
    }),
  );
}

function desktopRuntimeDependencies(project) {
  const dependencies = dependencyEntries(project);
  if (project.name !== desktopPackageName) return dependencies;

  return [
    ...dependencies,
    ...dependencyEntries(project, ['devDependencies']).filter(
      ([name]) => !matchesPackage(name, desktopToolPackages),
    ),
  ];
}

function matchesPackage(name, patterns) {
  return patterns.some((pattern) =>
    pattern.endsWith('/*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern,
  );
}

function shippedVersions(projects, rootDependencies) {
  // pnpm list prints a package's children at only one of its occurrences.
  const childrenByPath = new Map();
  const pending = projects.flatMap((project) =>
    dependencyEntries(project, ['dependencies', 'optionalDependencies', 'devDependencies']),
  );
  for (const [, node] of pending) {
    const children = dependencyEntries(node);
    childrenByPath.set(node.path, [...(childrenByPath.get(node.path) || []), ...children]);
    pending.push(...children);
  }

  const versions = new Set();
  const visitedPaths = new Set();
  const queue = projects.flatMap(rootDependencies);
  for (const [name, node] of queue) {
    // Workspace links also list their devDependencies; each workspace project is its own root.
    if (node.version.startsWith('link:') || matchesPackage(name, typePackages)) continue;
    if (visitedPaths.has(node.path)) continue;
    visitedPaths.add(node.path);
    versions.add(`${name}@${node.version}`);
    queue.push(...childrenByPath.get(node.path));
  }
  return versions;
}

function dependencyEntries(node, groups = ['dependencies', 'optionalDependencies']) {
  return groups.flatMap((group) => Object.entries(node[group] || {}));
}

function pnpmJson(args) {
  return JSON.parse(
    execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
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

This file lists third-party packages, vendored components, and bundled fonts distributed with Yomitomo Desktop.
It is generated from pnpm dependency metadata, vendor upstream metadata, and bundled font notices with:

\`\`\`bash
pnpm licenses:generate
\`\`\`

The project source code is licensed under MIT. Third-party packages, vendored components, and bundled fonts remain under their own licenses.

pnpm packages are the dependency closures of:

- \`${desktopPackageName}\` dependencies and the devDependencies bundled into the app
- the \`dependencies\` of workspace packages matched by \`${pnpmLicenseFilter}\`
- the \`dependencies\` of \`${electronNativeDir}\`

Desktop devDependencies used only to build or test the app are excluded:

${desktopToolPackages.map((name) => `- \`${name}\``).join('\n')}

Type declarations and the TypeScript compiler are excluded wherever they appear:

${typePackages.map((name) => `- \`${name}\``).join('\n')}

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
