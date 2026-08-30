import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';
import production from '../../electron.vite.config';

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(fixtureDirectory, '../..');
const repositoryRoot = resolve(desktopRoot, '../..');
const mainEntry = resolve(desktopRoot, 'src/main/index.ts');
const releaseModule = resolve(desktopRoot, 'src/reading-memory-release.ts');
const factoryModules = new Map([
  [
    resolve(desktopRoot, 'src/main/reading-memory/reading-memory-model-lifecycle.ts'),
    resolve(fixtureDirectory, 'reading-memory-fixture-model.ts'),
  ],
  [
    resolve(desktopRoot, 'src/main/reading-memory/reading-memory-semantic-index.ts'),
    resolve(fixtureDirectory, 'reading-memory-fixture-model.ts'),
  ],
  [
    resolve(desktopRoot, 'src/main/app/main-process-runtime.ts'),
    resolve(fixtureDirectory, 'fixture-main-process-runtime.ts'),
  ],
]);

function fixtureDependencies(): Plugin {
  return {
    name: 'reading-memory-fixture-dependencies',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '@napi-rs/keyring') return resolve(fixtureDirectory, 'fixture-keyring.ts');
      if (!importer || !source.startsWith('.')) return;
      const importingFile = resolve(importer.split('?')[0]);
      const path = resolve(dirname(importingFile), source);
      const modulePath = extname(path) ? path : `${path}.ts`;
      if (modulePath === releaseModule) return resolve(fixtureDirectory, 'fixture-release.ts');
      if (importingFile === mainEntry) return factoryModules.get(modulePath);
    },
  };
}

export default defineConfig(() => {
  const configuredDirectory = process.env.YOMITOMO_READING_MEMORY_FIXTURE_DIR;
  if (!configuredDirectory || !isAbsolute(configuredDirectory)) {
    throw new Error('Fixture build requires an absolute, isolated output directory');
  }
  const outputDirectory = resolve(configuredDirectory);
  const relativeOutput = relative(repositoryRoot, outputDirectory);
  if (
    relativeOutput !== '..' &&
    !relativeOutput.startsWith(`..${sep}`) &&
    !isAbsolute(relativeOutput)
  ) {
    throw new Error('Fixture build must not overwrite repository dist outputs');
  }
  const main = production.main!;
  const external = main.build?.rollupOptions?.external;
  if (!Array.isArray(external)) throw new Error('Unexpected desktop main external configuration');
  const preload = production.preload!;
  const renderer = production.renderer!;
  return {
    main: {
      ...main,
      build: {
        ...main.build,
        outDir: resolve(outputDirectory, 'main'),
        rollupOptions: {
          ...main.build?.rollupOptions,
          external: external.filter((dependency) => dependency !== '@napi-rs/keyring'),
          input: {
            ...(main.build?.rollupOptions?.input as Record<string, string>),
            index: resolve(fixtureDirectory, 'fixture-main.ts'),
            'reading-memory-fixture-worker': resolve(
              fixtureDirectory,
              'reading-memory-fixture-worker.ts',
            ),
          },
        },
      },
      plugins: [
        fixtureDependencies(),
        externalizeDepsPlugin({
          exclude: ['@yomitomo/ai', '@yomitomo/core', '@yomitomo/shared', '@napi-rs/keyring'],
        }),
      ],
    },
    preload: {
      ...preload,
      build: { ...preload.build, outDir: resolve(outputDirectory, 'preload') },
      plugins: [fixtureDependencies(), ...(preload.plugins ?? [])],
    },
    renderer: {
      ...renderer,
      build: { ...renderer.build, outDir: resolve(outputDirectory, 'renderer') },
      plugins: [fixtureDependencies(), ...(renderer.plugins ?? [])],
    },
  };
});
