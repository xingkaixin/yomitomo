import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { expect, it, vi } from 'vitest';
import { migrations } from '../../src/main/db/migrations';
import * as schema from '../../src/main/db/schema';
import { readLibraryCatalogRows } from '../../src/main/library/library-catalog-repository';

vi.mock('electron', () => ({
  app: {
    getPath() {
      throw new Error('Catalog measurement must not access a user profile');
    },
  },
}));

it('records production catalog queries at 1k, 10k and 50k articles', async () => {
  const results = [];
  for (const count of [1_000, 10_000, 50_000]) {
    const sqlite = new SQLiteDatabase(':memory:');
    try {
      for (const migration of migrations) sqlite.exec(migration.sql);
      const insert = sqlite.prepare(`
        INSERT INTO articles (id, url, canonical_url, source_type, title, content_hash, created_at, updated_at)
        VALUES (?, ?, ?, 'web', ?, ?, ?, ?)
      `);
      sqlite.transaction(() => {
        for (let index = 0; index < count; index++) {
          const id = `article_${index}`;
          const url = `https://example.invalid/${index}`;
          const date = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
          const title = `${index % 10 === 0 ? 'Benchmark 基准' : 'Archive'} paper ${index}`;
          insert.run(id, url, url, title, id, date, date);
        }
      })();
      let queries: { query: string; params: unknown[] }[] = [];
      const database = drizzle(sqlite, {
        schema,
        logger: { logQuery: (query, params) => queries.push({ query, params }) },
      });
      for (const query of ['', 'Benchmark', '基准']) {
        const input = { scope: { kind: 'library' as const }, query, page: 1, pageSize: 12 };
        for (let warmup = 0; warmup < 3; warmup++) readLibraryCatalogRows(database, input);
        const samples = [];
        for (let sample = 0; sample < 20; sample++) {
          queries = [];
          const started = performance.now();
          const result = readLibraryCatalogRows(database, input);
          samples.push(performance.now() - started);
          expect(result.totalCount).toBe(query ? count / 10 : count);
          expect(result.entities).toHaveLength(12);
        }
        const candidateQuery = queries[0];
        if (!candidateQuery) throw new Error('Production candidate query was not recorded');
        const plan = sqlite
          .prepare(`EXPLAIN QUERY PLAN ${candidateQuery.query}`)
          .all(...candidateQuery.params);
        const sorted = samples.toSorted((a, b) => a - b);
        results.push({
          count,
          query,
          medianMs: rounded((sorted[9] + sorted[10]) / 2),
          p95Ms: rounded(sorted[18]),
          statements: queries.length,
          samplesMs: samples.map(rounded),
          plan,
        });
      }
    } finally {
      sqlite.close();
    }
  }
  const path = fileURLToPath(
    new URL('../ui/artifacts/library-catalog-performance.json', import.meta.url),
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        cpu: cpus()[0]?.model,
        storage: 'in-memory SQLite; production migrations',
        fixture: 'web articles only; no pins or collections; 10% title matches',
        warmups: 3,
        samples: 20,
        results,
      },
      null,
      2,
    )}\n`,
  );
  console.table(
    results.map(({ count, query, medianMs, p95Ms, statements }) => ({
      count,
      query,
      medianMs,
      p95Ms,
      statements,
    })),
  );
  console.info(`Catalog measurements: ${path}`);
});

function rounded(value: number) {
  return Number(value.toFixed(3));
}
