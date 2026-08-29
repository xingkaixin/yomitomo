import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import candidatesManifest from '../evaluation/semantic-retrieval/candidates-v1.json' with { type: 'json' };
import selection from '../evaluation/semantic-retrieval/selection-v1.json' with { type: 'json' };
import {
  semanticRetrievalLanguages,
  semanticRetrievalScenarios,
} from '../src/evaluation/semantic-retrieval-fixtures.ts';
import {
  buildSemanticRetrievalCorpus,
  buildSemanticRetrievalQueries,
  evaluateSemanticRetrievalRankings,
  rankSemanticRetrievalCorpus,
  validateSemanticRetrievalCoverage,
} from '../src/evaluation/semantic-retrieval-evaluation.ts';

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), '..');
const candidateManifestPath = join(
  packageRoot,
  'evaluation',
  'semantic-retrieval',
  'candidates-v1.json',
);
if (process.argv[1] && scriptPath === resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  if (args.prepare) {
    const candidate = candidateById(args.candidate);
    await downloadCandidateFiles(candidate, args.cacheDir || defaultCacheDir());
  } else if (args.worker) {
    const candidate = candidateById(args.candidate);
    const report = await runWorker(candidate, args);
    console.log(JSON.stringify(report));
  } else {
    await runCoordinator(args);
  }
}

async function runCoordinator(options) {
  validateSemanticRetrievalCoverage(
    semanticRetrievalScenarios,
    candidatesManifest.qualityGates.minimumQueriesPerDirection,
  );
  const cacheDir = options.cacheDir || defaultCacheDir();
  const candidates = selectedCandidates(options.candidate);
  const reports = [];

  for (const candidate of candidates) {
    runCandidateDownload(candidate, cacheDir);
    await verifyCandidateFiles(candidate, cacheDir);
    reports.push(runCandidateWorker(candidate, { ...options, cacheDir }));
  }

  const report = {
    schemaVersion: 1,
    evaluationId: candidatesManifest.evaluationId,
    generatedAt: new Date().toISOString(),
    datasetSha256: sha256Text(JSON.stringify(semanticRetrievalScenarios)),
    candidatesManifestSha256: await sha256File(candidateManifestPath),
    mode: options.mode,
    reports,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized);
  }
  process.stdout.write(serialized);
  if (requiresBenchmarkGates(options.mode)) assertBenchmarkGates(reports);
}

function runCandidateDownload(candidate, cacheDir) {
  const child = spawnSync(
    process.execPath,
    [scriptPath, '--prepare', `--candidate=${candidate.id}`, `--cache-dir=${cacheDir}`],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (child.status !== 0) {
    throw new Error(
      `Semantic retrieval preparation failed for ${candidate.id}:\n${child.stderr || child.stdout}`,
    );
  }
}

async function downloadCandidateFiles(candidate, cacheDir) {
  for (const file of candidate.artifact.files) {
    const path = candidateFilePath(candidate, cacheDir, file.path);
    if (await candidateFileMatches(path, file)) continue;

    const temporaryPath = `${path}.download-${process.pid}`;
    await mkdir(dirname(path), { recursive: true });
    await rm(temporaryPath, { force: true });
    try {
      const response = await fetch(candidateFileUrl(candidate, file.path));
      if (!response.ok || !response.body) {
        throw new Error(`Download failed with HTTP ${response.status}`);
      }
      await streamPipeline(
        Readable.fromWeb(response.body),
        byteLimit(file.sizeBytes),
        createWriteStream(temporaryPath),
      );
      if (!(await candidateFileMatches(temporaryPath, file))) {
        throw new Error('Downloaded file does not match the pinned size and SHA-256');
      }
      await rm(path, { force: true });
      await rename(temporaryPath, path);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw new Error(`Failed to prepare ${candidate.id}/${file.path}`, { cause: error });
    }
  }
}

function runCandidateWorker(candidate, options) {
  const startedAt = Date.now();
  const child = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--worker',
      `--candidate=${candidate.id}`,
      `--mode=${options.mode}`,
      `--cache-dir=${options.cacheDir}`,
      `--iterations=${options.iterations}`,
    ],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        YOMITOMO_SEMANTIC_WORKER_STARTED_AT: String(startedAt),
      },
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  if (child.status !== 0) {
    throw new Error(
      `Semantic retrieval worker failed for ${candidate.id}:\n${child.stderr || child.stdout}`,
    );
  }
  const outputLines = child.stdout.trim().split('\n');
  return JSON.parse(outputLines.at(-1));
}

async function runWorker(candidate, options) {
  const baselineRssBytes = process.memoryUsage().rss;
  let peakRssBytes = baselineRssBytes;
  const sampleMemory = () => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  };
  const sampler = setInterval(sampleMemory, 10);
  const workerStartedAt = Number(process.env.YOMITOMO_SEMANTIC_WORKER_STARTED_AT || Date.now());

  try {
    const { pipeline } = await import('@huggingface/transformers');
    const extractor = await pipeline('feature-extraction', candidate.artifact.modelId, {
      revision: candidate.artifact.revision,
      dtype: candidate.dtype,
      device: 'cpu',
      cache_dir: options.cacheDir,
      local_files_only: true,
      session_options: sessionOptions(),
    });
    const coldStartMs = Date.now() - workerStartedAt;
    sampleMemory();
    const smokeOutput = await extractBatch(
      extractor,
      [
        `${candidate.queryPrefix}跨语言证据检索。`,
        `${candidate.queryPrefix}Cross-language evidence retrieval.`,
        `${candidate.queryPrefix}言語をまたぐ証拠検索。`,
      ],
      candidate,
    );
    assertEmbeddingTensor(smokeOutput, 3, candidate.embeddingDimension);

    const quality =
      options.mode === 'smoke' ? undefined : await evaluateQuality(extractor, candidate);
    sampleMemory();
    const performance =
      options.mode === 'full' || options.mode === 'benchmark'
        ? await evaluatePerformance(extractor, candidate, options.iterations)
        : undefined;
    sampleMemory();
    await extractor.dispose();

    return {
      candidateId: candidate.id,
      platform: `${process.platform}-${process.arch}`,
      runtimeLoaded: true,
      modelBundleBytes: candidate.artifact.files.reduce((total, file) => total + file.sizeBytes, 0),
      embeddingDimension: candidate.embeddingDimension,
      coldStartMs,
      baselineRssBytes,
      peakRssBytes,
      peakAdditionalRssBytes: peakRssBytes - baselineRssBytes,
      quality,
      performance,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        availableCpuThreads: availableParallelism(),
        totalMemoryBytes: totalmem(),
        configuredInferenceThreads: candidatesManifest.runtime.intraOpThreads,
      },
    };
  } finally {
    clearInterval(sampler);
  }
}

async function evaluateQuality(extractor, candidate) {
  const corpus = buildSemanticRetrievalCorpus(semanticRetrievalScenarios);
  const queries = buildSemanticRetrievalQueries(semanticRetrievalScenarios);
  const corpusEmbeddings = await embedTexts(
    extractor,
    corpus.map((item) => item.text),
    candidate.documentPrefix,
    candidate,
  );
  const corpusVectors = corpus.map((item, index) => ({
    id: item.id,
    vector: corpusEmbeddings[index],
  }));
  const corpusVectorsByLanguage = new Map(
    semanticRetrievalLanguages.map((language) => [
      language,
      corpusVectors.filter((_, index) => corpus[index].language === language),
    ]),
  );
  const uniqueQueryTexts = [...new Set(queries.map((query) => query.text))];
  const queryEmbeddings = await embedTexts(
    extractor,
    uniqueQueryTexts,
    candidate.queryPrefix,
    candidate,
  );
  const vectorsByQueryText = new Map(
    uniqueQueryTexts.map((text, index) => [text, queryEmbeddings[index]]),
  );
  const rankingsByDirectionAndText = new Map();
  const directionalRankings = queries.map((query) => {
    const key = `${query.evidenceLanguage}:${query.text}`;
    let ranking = rankingsByDirectionAndText.get(key);
    if (!ranking) {
      ranking = rankSemanticRetrievalCorpus(
        vectorsByQueryText.get(query.text),
        corpusVectorsByLanguage.get(query.evidenceLanguage),
        corpusVectorsByLanguage.get(query.evidenceLanguage).length,
      );
      rankingsByDirectionAndText.set(key, ranking);
    }
    return { queryId: query.id, results: ranking };
  });
  const mixedRankingsByText = new Map();
  const mixedRankings = queries.map((query) => {
    let ranking = mixedRankingsByText.get(query.text);
    if (!ranking) {
      ranking = rankSemanticRetrievalCorpus(
        vectorsByQueryText.get(query.text),
        corpusVectors,
        corpusVectors.length,
      );
      mixedRankingsByText.set(query.text, ranking);
    }
    return { queryId: query.id, results: ranking };
  });
  const evaluation = evaluateSemanticRetrievalRankings(queries, directionalRankings);
  const mixedCorpusEvaluation = evaluateSemanticRetrievalRankings(queries, mixedRankings);
  const gates = candidatesManifest.qualityGates;
  const failures = evaluation.directions.flatMap((direction) => [
    ...(direction.relateHitAt3 < gates.minimumHelpfulHitAt3
      ? [`${direction.direction}:relate_hit_at_3`]
      : []),
    ...(direction.askNecessaryCoverageAt12 < gates.minimumNecessaryCoverageAt12
      ? [`${direction.direction}:ask_coverage_at_12`]
      : []),
  ]);
  return { passed: failures.length === 0, failures, evaluation, mixedCorpusEvaluation };
}

async function evaluatePerformance(extractor, candidate, iterations) {
  const corpus = buildSemanticRetrievalCorpus(semanticRetrievalScenarios);
  const sourceVectors = await embedTexts(
    extractor,
    corpus.map((item) => item.text),
    candidate.documentPrefix,
    candidate,
  );
  const dimension = candidate.embeddingDimension;
  const assetCount = candidatesManifest.performanceGate.assetCount;
  const matrix = new Float32Array(assetCount * dimension);
  for (let index = 0; index < assetCount; index += 1) {
    matrix.set(sourceVectors[index % sourceVectors.length], index * dimension);
  }
  const idMapBytes = Buffer.byteLength(
    JSON.stringify(Array.from({ length: assetCount }, (_, index) => `asset:${index}`)),
  );
  const queryTexts = buildSemanticRetrievalQueries(semanticRetrievalScenarios)
    .filter((query) => query.kind === 'relate')
    .map((query) => query.text);

  for (let index = 0; index < 5; index += 1) {
    const vector = await embedOne(
      extractor,
      `${candidate.queryPrefix}${queryTexts[index]}`,
      candidate,
    );
    scanTopK(vector, matrix, dimension, 12);
  }

  const latencyMs = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    const vector = await embedOne(
      extractor,
      `${candidate.queryPrefix}${queryTexts[index % queryTexts.length]}`,
      candidate,
    );
    scanTopK(vector, matrix, dimension, 12);
    latencyMs.push(performance.now() - started);
  }
  const p95LatencyMs = percentileNearestRank(latencyMs, 0.95);
  return {
    passed: p95LatencyMs <= candidatesManifest.performanceGate.maximumCandidateP95Ms,
    assetCount,
    iterations,
    p95LatencyMs,
    medianLatencyMs: percentileNearestRank(latencyMs, 0.5),
    minimumLatencyMs: Math.min(...latencyMs),
    maximumLatencyMs: Math.max(...latencyMs),
    vectorIndexBytes: matrix.byteLength,
    idMapBytes,
    storage: {
      scalar: 'float32',
      byteOrder: 'little-endian',
      layout: 'row-major',
      normalized: true,
    },
  };
}

async function embedTexts(extractor, texts, prefix, candidate) {
  const embeddings = [];
  const batchSize = 16;
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize).map((text) => `${prefix}${text}`);
    const output = await extractBatch(extractor, batch, candidate);
    assertEmbeddingTensor(output, batch.length, candidate.embeddingDimension);
    for (let index = 0; index < batch.length; index += 1) {
      const offset = index * candidate.embeddingDimension;
      embeddings.push(
        new Float32Array(output.data.slice(offset, offset + candidate.embeddingDimension)),
      );
    }
  }
  return embeddings;
}

async function embedOne(extractor, text, candidate) {
  const output = await extractBatch(extractor, text, candidate);
  assertEmbeddingTensor(output, 1, candidate.embeddingDimension);
  return new Float32Array(output.data);
}

async function extractBatch(extractor, texts, candidate) {
  if (candidate.pooling !== 'sentence_embedding') {
    return extractor(texts, { pooling: candidate.pooling, normalize: true });
  }
  const inputs = extractor.tokenizer(texts, { padding: true, truncation: true });
  const outputs = await extractor.model(inputs);
  if (!outputs.sentence_embedding) {
    throw new Error(`${candidate.id} did not return sentence_embedding`);
  }
  return outputs.sentence_embedding.normalize(2, -1);
}

function scanTopK(query, matrix, dimension, limit) {
  const scores = [];
  const assetCount = matrix.length / dimension;
  for (let row = 0; row < assetCount; row += 1) {
    let score = 0;
    const offset = row * dimension;
    for (let column = 0; column < dimension; column += 1) {
      score += query[column] * matrix[offset + column];
    }
    const insertion = scores.findIndex((item) => score > item.score);
    if (insertion >= 0) scores.splice(insertion, 0, { row, score });
    else if (scores.length < limit) scores.push({ row, score });
    if (scores.length > limit) scores.pop();
  }
  return scores;
}

async function verifyCandidateFiles(candidate, cacheDir) {
  for (const file of candidate.artifact.files) {
    const path = candidateFilePath(candidate, cacheDir, file.path);
    if (!(await candidateFileMatches(path, file))) {
      throw new Error(`Unexpected size or SHA-256 for ${candidate.id}/${file.path}`);
    }
  }
}

async function candidateFileMatches(path, file) {
  try {
    const metadata = await stat(path);
    return metadata.size === file.sizeBytes && (await sha256File(path)) === file.sha256;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function candidateFilePath(candidate, cacheDir, filePath) {
  const artifactRoot = resolve(cacheDir, candidate.artifact.modelId, candidate.artifact.revision);
  const path = resolve(artifactRoot, filePath);
  if (!path.startsWith(`${artifactRoot}${sep}`)) {
    throw new Error(`Unsafe semantic retrieval artifact path: ${filePath}`);
  }
  return path;
}

function candidateFileUrl(candidate, filePath) {
  return `https://huggingface.co/${candidate.artifact.modelId}/resolve/${candidate.artifact.revision}/${filePath}`;
}

function byteLimit(maximumBytes) {
  let receivedBytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > maximumBytes) {
        callback(new Error(`Download exceeded the pinned size of ${maximumBytes} bytes`));
        return;
      }
      callback(null, chunk);
    },
  });
}

function assertEmbeddingTensor(output, count, dimension) {
  if (
    output.dims.length !== 2 ||
    output.dims[0] !== count ||
    output.dims[1] !== dimension ||
    output.data.length !== count * dimension
  ) {
    throw new Error(`Expected ${count} embeddings with dimension ${dimension}`);
  }
  for (let row = 0; row < count; row += 1) {
    let squaredNorm = 0;
    const offset = row * dimension;
    for (let column = 0; column < dimension; column += 1) {
      const value = output.data[offset + column];
      if (!Number.isFinite(value)) throw new Error('Embedding contains a non-finite value');
      squaredNorm += value * value;
    }
    if (Math.abs(Math.sqrt(squaredNorm) - 1) > 0.001) {
      throw new Error('Embedding is not L2 normalized');
    }
  }
}

function selectedCandidates(candidateId) {
  if (candidateId === 'all') return candidatesManifest.candidates;
  return [candidateById(candidateId)];
}

function candidateById(candidateId) {
  const resolvedId = candidateId === 'selected' ? selection.selectedCandidateId : candidateId;
  const candidate = candidatesManifest.candidates.find((item) => item.id === resolvedId);
  if (!candidate) throw new Error(`Unknown semantic retrieval candidate: ${candidateId}`);
  return candidate;
}

function parseArgs(values) {
  const options = {
    prepare: false,
    worker: false,
    candidate: 'all',
    mode: 'full',
    cacheDir: undefined,
    output: undefined,
    iterations: 100,
  };
  for (const value of values) {
    if (value === '--prepare') options.prepare = true;
    else if (value === '--worker') options.worker = true;
    else if (value.startsWith('--candidate=')) options.candidate = value.slice(12);
    else if (value.startsWith('--mode=')) options.mode = value.slice(7);
    else if (value.startsWith('--cache-dir=')) options.cacheDir = resolve(value.slice(12));
    else if (value.startsWith('--output=')) options.output = value.slice(9);
    else if (value.startsWith('--iterations=')) options.iterations = Number(value.slice(13));
    else throw new Error(`Unknown semantic retrieval evaluation argument: ${value}`);
  }
  if (!['smoke', 'quality', 'benchmark', 'full'].includes(options.mode)) {
    throw new Error(`Unknown semantic retrieval evaluation mode: ${options.mode}`);
  }
  if (!Number.isSafeInteger(options.iterations) || options.iterations < 1) {
    throw new Error('Semantic retrieval iterations must be a positive safe integer');
  }
  if (options.prepare && options.worker) {
    throw new Error('Semantic retrieval process cannot prepare and evaluate simultaneously');
  }
  return options;
}

function sessionOptions() {
  return {
    intraOpNumThreads: candidatesManifest.runtime.intraOpThreads,
    interOpNumThreads: 1,
  };
}

function defaultCacheDir() {
  return resolve(
    process.env.YOMITOMO_SEMANTIC_MODEL_CACHE || join(tmpdir(), 'yomitomo-semantic-models'),
  );
}

export function assertBenchmarkGates(reports) {
  const failedPerformance = reports.filter(
    (report) =>
      report.performance?.passed !== true ||
      report.performance.p95LatencyMs > candidatesManifest.performanceGate.maximumCandidateP95Ms,
  );
  if (failedPerformance.length > 0) {
    throw new Error(
      `Semantic retrieval performance gate failed: ${failedPerformance
        .map((report) => report.candidateId)
        .join(', ')}`,
    );
  }

  const selectedReport = reports.find(
    (report) => report.candidateId === selection.selectedCandidateId,
  );
  if (!selectedReport?.quality) {
    throw new Error('Semantic retrieval benchmark is missing selected-model quality results');
  }
  const directions = selectedReport.quality.evaluation.directions;
  const derivedFailures = directions.flatMap((direction) => [
    ...(direction.relateHitAt3 < candidatesManifest.qualityGates.minimumHelpfulHitAt3
      ? [`${direction.direction}:relate_hit_at_3`]
      : []),
    ...(direction.askNecessaryCoverageAt12 <
    candidatesManifest.qualityGates.minimumNecessaryCoverageAt12
      ? [`${direction.direction}:ask_coverage_at_12`]
      : []),
  ]);
  if (
    JSON.stringify(derivedFailures.toSorted(compareText)) !==
    JSON.stringify([...selectedReport.quality.failures].toSorted(compareText))
  ) {
    throw new Error('Semantic retrieval quality failures do not match the measured directions');
  }

  const allowedFailures = new Set(selection.pureSemanticQuality.remainingFailures);
  const unexpectedFailures = derivedFailures.filter((failure) => !allowedFailures.has(failure));
  const top3Passed = directions.filter(
    (direction) => direction.relateHitAt3 >= candidatesManifest.qualityGates.minimumHelpfulHitAt3,
  ).length;
  const top12Passed = directions.filter(
    (direction) =>
      direction.askNecessaryCoverageAt12 >=
      candidatesManifest.qualityGates.minimumNecessaryCoverageAt12,
  ).length;
  const remainingDirection = directions.find(
    (direction) =>
      direction.direction === selection.pureSemanticQuality.remainingDirection.direction,
  );
  if (
    unexpectedFailures.length > 0 ||
    top3Passed < selection.pureSemanticQuality.top3DirectionsPassed ||
    top12Passed < selection.pureSemanticQuality.top12DirectionsPassed ||
    !remainingDirection ||
    remainingDirection.relateHitAt3 < selection.pureSemanticQuality.remainingDirection.helpfulHitAt3
  ) {
    throw new Error(
      `Semantic retrieval quality regressed from the selected baseline: ${[
        ...unexpectedFailures,
        `top3:${top3Passed}`,
        `top12:${top12Passed}`,
      ].join(', ')}`,
    );
  }
}

export function requiresBenchmarkGates(mode) {
  return mode === 'benchmark' || mode === 'full';
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function percentileNearestRank(values, percentile) {
  if (values.length === 0) throw new Error('Cannot calculate a percentile without values');
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)];
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}
