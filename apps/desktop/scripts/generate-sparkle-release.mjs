import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepareSparkle } from './prepare-sparkle.mjs';

const desktopRoot = dirname(import.meta.dirname);
const version = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')).version;
const output = join(desktopRoot, '../../dist/app/mac-arm64');
const archiveName = `Yomitomo-${version}-mac-arm64.zip`;
const feedName = 'appcast-mac-arm64.xml';
const repository = process.env.GH_REPO || 'xingkaixin/yomitomo';
const key = process.env.SPARKLE_ED_PRIVATE_KEY;
if (!key) throw new Error('SPARKLE_ED_PRIVATE_KEY is required to sign macOS updates');
const archives = mkdtempSync(join(tmpdir(), 'yomitomo-sparkle-release-'));

function downloadAsset(release, name) {
  execFileSync(
    'gh',
    [
      'release',
      'download',
      release.tag_name,
      '--repo',
      repository,
      '--pattern',
      name,
      '--dir',
      archives,
    ],
    { stdio: 'inherit' },
  );
}

try {
  copyFileSync(join(output, archiveName), join(archives, archiveName));
  const releases = JSON.parse(
    execFileSync('gh', ['api', `repos/${repository}/releases?per_page=30`], { encoding: 'utf8' }),
  );
  const previous = releases
    .filter(
      (release) =>
        !release.draft &&
        !release.prerelease &&
        /^v\d+\.\d+\.\d+$/.test(release.tag_name) &&
        release.tag_name.slice(1).localeCompare(version, 'en', { numeric: true }) < 0 &&
        release.assets.some((asset) => asset.name === feedName),
    )
    .slice(0, 2);
  for (const release of previous) {
    downloadAsset(release, `Yomitomo-${release.tag_name.slice(1)}-mac-arm64.zip`);
  }
  const tools = prepareSparkle();
  execFileSync(
    join(tools, 'bin', 'generate_appcast'),
    [
      '--ed-key-file',
      '-',
      '-o',
      join(archives, feedName),
      '--versions',
      version,
      '--maximum-versions',
      '1',
      '--maximum-deltas',
      '2',
      '--download-url-prefix',
      `https://download.yomitomo.app/updates/releases/download/v${version}/`,
      archives,
    ],
    { input: key, stdio: ['pipe', 'inherit', 'inherit'] },
  );
  mkdirSync(output, { recursive: true });
  copyFileSync(join(archives, feedName), join(output, feedName));
  for (const name of readdirSync(archives)) {
    if (name.endsWith('.delta')) copyFileSync(join(archives, name), join(output, name));
  }
} finally {
  rmSync(archives, { recursive: true, force: true });
}
