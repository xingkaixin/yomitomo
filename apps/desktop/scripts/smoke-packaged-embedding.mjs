import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '../../..');
const releaseDirectory = join(
  repositoryRoot,
  'apps/desktop/model-releases/reading-memory-embedding-v1',
);
const resultPrefix = 'YOMITOMO_PACKAGED_EMBEDDING_RESULT ';
const smokeTexts = [
  '阅读时保留自己的判断，之后再与新的证据比较。',
  'Keep your own judgment while reading, then compare it with new evidence.',
  '読書中に自分の判断を残し、あとで新しい証拠と比較する。',
];

if (process.argv.includes('--probe')) await runPackagedProbe();
else await runPackagedSmoke();

async function runPackagedSmoke() {
  const packageOutput = await realpath(requiredArgument('package-output'));
  if (packageOutput === repositoryRoot || isInside(repositoryRoot, packageOutput)) {
    throw new Error('Package outside the repository before running the isolated embedding smoke');
  }
  const modelCache = resolve(requiredArgument('model-cache'));
  const archives = await findAppArchives(packageOutput);
  if (archives.length !== 1) {
    throw new Error(`Expected one packaged app.asar, found ${archives.length}`);
  }
  const appArchive = archives[0];
  const resourcesDirectory = dirname(appArchive);
  const executable =
    process.platform === 'darwin'
      ? join(resourcesDirectory, '../MacOS/Yomitomo')
      : join(resourcesDirectory, '../Yomitomo.exe');
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yomitomo-embedding-package-'));

  try {
    const modelDirectory = join(temporaryDirectory, '本地 模型');
    const manifest = await prepareModelInstallation(modelCache, modelDirectory);
    await verifyPackagedNativeFiles(resourcesDirectory, manifest);
    const output = execFileSync(
      executable,
      [scriptPath, '--probe', `--app-archive=${appArchive}`, `--model-directory=${modelDirectory}`],
      {
        cwd: temporaryDirectory,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          NODE_OPTIONS: '',
          NODE_PATH: '',
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        timeout: 180_000,
      },
    );
    process.stdout.write(output);
    const line = output.split(/\r?\n/).find((value) => value.startsWith(resultPrefix));
    if (!line) throw new Error('Packaged embedding smoke exited without a result');
    const result = JSON.parse(line.slice(resultPrefix.length));
    const outputPath = argumentValue('output');
    if (outputPath) {
      await mkdir(dirname(resolve(outputPath)), { recursive: true });
      await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function runPackagedProbe() {
  if (!process.versions.electron) throw new Error('Run the probe with the packaged Electron');
  const appArchive = resolve(requiredArgument('app-archive'));
  const modelDirectory = resolve(requiredArgument('model-directory'));
  const manifest = JSON.parse(await readFile(join(modelDirectory, 'manifest.json'), 'utf8'));
  const platform = `${process.platform}-${process.arch}`;
  if (!manifest.supportedPlatforms.includes(platform)) {
    throw new Error(`Unsupported packaged embedding platform: ${platform}`);
  }

  const requireFromApp = createRequire(join(appArchive, 'package.json'));
  const transformersEntry = requireFromApp.resolve('@huggingface/transformers');
  const requireFromTransformers = createRequire(transformersEntry);
  const onnxRuntimeEntry = requireFromTransformers.resolve('onnxruntime-node');
  const sharpEntry = requireFromTransformers.resolve('sharp');
  for (const entry of [transformersEntry, onnxRuntimeEntry, sharpEntry]) {
    if (!isInside(appArchive, entry))
      throw new Error(`Runtime resolved outside the package: ${entry}`);
  }
  const transformersPackage = await packageMetadata(transformersEntry);
  const onnxRuntimePackage = await packageMetadata(onnxRuntimeEntry);
  const sharpPackage = await packageMetadata(sharpEntry);
  if (transformersPackage.version !== manifest.runtime.version) {
    throw new Error(`Unexpected packaged Transformers version: ${transformersPackage.version}`);
  }
  if (onnxRuntimePackage.version !== manifest.runtime.backendVersion) {
    throw new Error(`Unexpected packaged ONNX Runtime version: ${onnxRuntimePackage.version}`);
  }

  const serviceUrl = pathToFileURL(
    join(appArchive, 'dist/main/reading-memory-embedding-service.js'),
  );
  const { createReadingMemoryEmbeddingService } = await import(serviceUrl.href);
  const service = createReadingMemoryEmbeddingService({
    status: 'available',
    internalId: manifest.internalId,
    downloadSizeBytes: manifest.distributionDownloadSizeBytes,
    directory: modelDirectory,
    manifest,
  });
  let heartbeats = 0;
  const heartbeat = setInterval(() => {
    heartbeats += 1;
  }, 10);
  const started = performance.now();
  let result;

  try {
    const documents = await service.embed({ purpose: 'document', texts: smokeTexts });
    assertVectors(documents, smokeTexts.length, manifest);
    const coldBatchMs = performance.now() - started;
    const query = await service.embed({ purpose: 'query', texts: [smokeTexts[0]] });
    assertVectors(query, 1, manifest);
    const cancellation = await verifyCancellationAndRecovery(service, manifest);
    if (heartbeats === 0) throw new Error('Embedding blocked the main event loop');
    result = {
      label: 'formal-package-real-model',
      platform,
      electronVersion: process.versions.electron,
      transformersVersion: transformersPackage.version,
      onnxRuntimeVersion: onnxRuntimePackage.version,
      sharpVersion: sharpPackage.version,
      modelVersion: documents.modelVersion,
      dimension: documents.dimension,
      documentCount: smokeTexts.length,
      queryCount: 1,
      coldBatchMs,
      mainThreadHeartbeats: heartbeats,
      ...cancellation,
    };
  } finally {
    clearInterval(heartbeat);
    await service.dispose();
  }
  console.log(`${resultPrefix}${JSON.stringify(result)}`);
}

async function verifyCancellationAndRecovery(service, manifest) {
  const canceledCode = 'READING_MEMORY_EMBEDDING_CANCELED';
  const controller = new AbortController();
  const texts = Array.from({ length: 4 }, () => 'evidence '.repeat(4096));
  const started = performance.now();
  let abortedAt;
  // The session is already warm; cancel the long batch during native inference, not model loading.
  const abortTimer = setTimeout(() => {
    abortedAt = performance.now();
    console.log(`Canceling warmed embedding batch after ${(abortedAt - started).toFixed(0)}ms`);
    controller.abort();
  }, 2000);
  try {
    await service.embed({ purpose: 'document', texts }, { signal: controller.signal });
    throw new Error('Long embedding batch completed without observing cancellation');
  } catch (error) {
    if (error?.code !== canceledCode) throw error;
    if (abortedAt === undefined) {
      throw new Error('Embedding canceled before the scheduled native-inference interruption', {
        cause: error,
      });
    }
  } finally {
    clearTimeout(abortTimer);
  }
  const cancellationLatencyMs = performance.now() - abortedAt;
  const recoveryStarted = performance.now();
  const recoveredQuery = await service.embed({ purpose: 'query', texts: [smokeTexts[0]] });
  assertVectors(recoveredQuery, 1, manifest);
  return {
    cancellationBatchSize: texts.length,
    cancellationErrorCode: canceledCode,
    cancellationDelayMs: abortedAt - started,
    cancellationLatencyMs,
    recoveryQueryCount: 1,
    recoveryQueryMs: performance.now() - recoveryStarted,
  };
}

async function prepareModelInstallation(modelCache, modelDirectory) {
  const manifestPath = join(releaseDirectory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const artifactDirectory = join(modelCache, manifest.artifact.modelId, manifest.artifact.revision);
  const files = [
    ...manifest.artifact.files.map((file) => ({ ...file, sourceDirectory: artifactDirectory })),
    ...manifest.legal.files.map((file) => ({ ...file, sourceDirectory: releaseDirectory })),
  ];
  for (const file of files) {
    const destination = resolve(modelDirectory, file.path);
    if (!isInside(modelDirectory, destination)) throw new Error(`Unsafe model file: ${file.path}`);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(file.sourceDirectory, file.path), destination, constants.COPYFILE_FICLONE);
    const metadata = await stat(destination);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(destination)) hash.update(chunk);
    if (metadata.size !== file.sizeBytes || hash.digest('hex') !== file.sha256) {
      throw new Error(`Model file does not match the release manifest: ${file.path}`);
    }
  }
  await copyFile(manifestPath, join(modelDirectory, 'manifest.json'));
  return manifest;
}

async function verifyPackagedNativeFiles(resourcesDirectory, manifest) {
  const unpackedNodeModules = join(resourcesDirectory, 'app.asar.unpacked/node_modules');
  const onnxRoot = join(unpackedNodeModules, 'onnxruntime-node/bin/napi-v6');
  const targetRoot = join(onnxRoot, process.platform, process.arch);
  const onnxFiles = await readdir(targetRoot);
  const onnxLibrary =
    process.platform === 'darwin'
      ? `libonnxruntime.${manifest.runtime.backendVersion}.dylib`
      : 'onnxruntime.dll';
  for (const file of ['onnxruntime_binding.node', onnxLibrary]) {
    if (!onnxFiles.includes(file)) throw new Error(`Packaged ONNX Runtime is missing ${file}`);
  }
  const platforms = await readdir(onnxRoot);
  const architectures = await readdir(join(onnxRoot, process.platform));
  if (platforms.length !== 1 || architectures.length !== 1) {
    throw new Error('Packaged ONNX Runtime contains unused platform binaries');
  }

  const sharpRoot = join(unpackedNodeModules, '@img', `sharp-${process.platform}-${process.arch}`);
  const sharpFiles = await readdir(join(sharpRoot, 'lib'));
  if (!sharpFiles.some((file) => file.endsWith('.node'))) {
    throw new Error('Packaged sharp native binding is missing');
  }
  if (process.platform === 'win32') {
    if (
      !sharpFiles.includes('libvips-42.dll') ||
      !sharpFiles.some((file) => /^libvips-cpp-.+\.dll$/.test(file))
    ) {
      throw new Error('Packaged sharp libvips DLLs are missing');
    }
    return;
  }
  const vipsRoot = join(
    unpackedNodeModules,
    '@img',
    `sharp-libvips-${process.platform}-${process.arch}`,
  );
  const vipsFiles = await readdir(join(vipsRoot, 'lib'));
  if (!vipsFiles.some((file) => file.endsWith('.dylib'))) {
    throw new Error('Packaged sharp libvips library is missing');
  }
}

function assertVectors(result, count, manifest) {
  if (
    result.modelVersion !== manifest.internalId ||
    result.dimension !== manifest.vector.dimension ||
    !(result.vectors instanceof Float32Array) ||
    result.vectors.length !== count * manifest.vector.dimension
  ) {
    throw new Error('Packaged embedding returned an unexpected matrix');
  }
  for (let row = 0; row < count; row += 1) {
    let squaredNorm = 0;
    for (let column = 0; column < result.dimension; column += 1) {
      const value = result.vectors[row * result.dimension + column];
      if (!Number.isFinite(value))
        throw new Error('Packaged embedding contains a non-finite value');
      squaredNorm += value * value;
    }
    if (Math.abs(Math.sqrt(squaredNorm) - 1) > 0.001) {
      throw new Error('Packaged embedding is not normalized');
    }
  }
}

async function findAppArchives(directory, depth = 0) {
  if (depth > 6) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isFile() && entry.name === 'app.asar') return [path];
      return entry.isDirectory() ? findAppArchives(path, depth + 1) : [];
    }),
  );
  return paths.flat();
}

async function packageMetadata(entry) {
  return JSON.parse(await readFile(join(dirname(dirname(entry)), 'package.json'), 'utf8'));
}

function isInside(parent, path) {
  const fromParent = relative(parent, path);
  return (
    fromParent !== '' &&
    fromParent !== '..' &&
    !isAbsolute(fromParent) &&
    !fromParent.startsWith(`..${sep}`)
  );
}

function argumentValue(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function requiredArgument(name) {
  const value = argumentValue(name);
  if (!value) throw new Error(`Missing --${name}= argument`);
  return value;
}
