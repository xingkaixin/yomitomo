import { constants } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type SQLiteDatabase from 'better-sqlite3';
import { rankReadingEvidenceCandidates, selectReadingRelationEvidence } from '@yomitomo/core';
import type { LlmProvider, ReadingEvidence } from '@yomitomo/shared';
import {
  buildSemanticRetrievalCorpus,
  buildSemanticRetrievalQueries,
  type SemanticRetrievalQuery,
} from '../../../../../packages/ai/src/evaluation/semantic-retrieval-evaluation';
import {
  semanticRetrievalScenarios,
  type SemanticRetrievalLanguage,
} from '../../../../../packages/ai/src/evaluation/semantic-retrieval-fixtures';
import { prepareReadingJudgmentInput } from '../../../../../packages/ai/src/reading-memory/reading-judgment-input';
import { migrations } from '../db/migrations';
import { runReadingMemoryEvidenceProjectionBatch } from './reading-memory-evidence-projection-batch';
import { parseReadingMemoryModelManifest } from './reading-memory-model-manifest';

const timestamp = '2026-08-30T00:00:00.000Z';
const releaseDirectory = fileURLToPath(
  new URL('../../../../download/model-releases/reading-memory-embedding-v1/', import.meta.url),
);
const inputBudgetProvider: LlmProvider = {
  id: 'quality-input-budget',
  name: 'Offline input budget only',
  type: 'openai-chat',
  baseUrl: 'https://example.invalid',
  apiKey: '',
  modelName: 'quality-input-budget',
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const readingMemoryQualityCorpus = buildSemanticRetrievalCorpus(semanticRetrievalScenarios);
export const readingMemoryQualityQueries = buildSemanticRetrievalQueries(
  semanticRetrievalScenarios,
).map((query) => {
  query.necessaryEvidenceIds = query.necessaryEvidenceIds.map(productionEvidenceId);
  query.hardNegativeEvidenceIds = query.hardNegativeEvidenceIds.map(productionEvidenceId);
  return query;
});

export function populateReadingMemoryQualityDatabase(
  database: SQLiteDatabase.Database,
  language: SemanticRetrievalLanguage,
) {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  const insertArticle = database.prepare(`
INSERT INTO articles (id, url, canonical_url, title, source_type, content_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, 'web', ?, ?, ?)
`);
  const insertAnnotation = database.prepare(`
INSERT INTO annotations (id, article_id, anchor, author, color, created_at, updated_at)
VALUES (?, ?, ?, 'user', '#000000', ?, ?)
`);
  const corpus = readingMemoryQualityCorpus.filter((item) => item.language === language);
  database.transaction(() => {
    for (const item of corpus) {
      const articleId = `article:${item.id}`;
      const url = `https://example.invalid/${encodeURIComponent(item.id)}`;
      insertArticle.run(articleId, url, url, item.id, item.id, timestamp, timestamp);
      insertAnnotation.run(
        item.id,
        articleId,
        JSON.stringify({
          exact: item.text,
          prefix: '',
          suffix: '',
          start: 0,
          end: item.text.length,
        }),
        timestamp,
        timestamp,
      );
    }
  })();
  let more = true;
  while (more) {
    const batch = runReadingMemoryEvidenceProjectionBatch(database, { now: new Date(timestamp) });
    if (batch.failures.length > 0) {
      throw new AggregateError(
        batch.failures.map((failure) => failure.error),
        'Quality projection failed',
      );
    }
    more = batch.hasImmediateWork;
  }
  return corpus;
}

export function prepareReadingMemoryQualityEvidence(
  query: SemanticRetrievalQuery,
  candidates: readonly ReadingEvidence[],
) {
  const evidence =
    query.kind === 'relate'
      ? selectReadingRelationEvidence(candidates, {
          articleId: 'quality-current-selection',
          context: { sourceType: 'web', quote: query.text },
        })
      : rankReadingEvidenceCandidates(candidates, 12);
  const input =
    query.kind === 'relate'
      ? { kind: 'reading-relations' as const, selection: query.text }
      : { kind: 'library-answer' as const, question: query.text };
  const prepared = prepareReadingJudgmentInput(inputBudgetProvider, input, evidence);
  return { evidence, prepared };
}

export async function installReadingMemoryQualityModel(modelCache: string, userDataPath: string) {
  const manifestPath = join(releaseDirectory, 'manifest.json');
  const manifest = parseReadingMemoryModelManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  );
  const artifactDirectory = join(modelCache, manifest.artifact.modelId, manifest.artifact.revision);
  const modelDirectory = join(userDataPath, 'models', manifest.internalId);
  const files = [
    ...manifest.artifact.files.map((file) => ({ ...file, directory: artifactDirectory })),
    ...manifest.legal.files.map((file) => ({ ...file, directory: releaseDirectory })),
  ];
  for (const file of files) {
    const destination = join(modelDirectory, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(file.directory, file.path), destination, constants.COPYFILE_FICLONE);
  }
  await copyFile(manifestPath, join(modelDirectory, 'manifest.json'));
  return manifest;
}

function productionEvidenceId(corpusId: string) {
  return `reading_evidence_annotation:${corpusId}`;
}
