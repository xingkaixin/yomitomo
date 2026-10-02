import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { join } from 'node:path';
import SQLiteDatabase from 'better-sqlite3';
import { JSDOM } from 'jsdom';
import type { CDPSession, Page } from 'playwright-core';
import { expect, it } from 'vitest';
import type { YomitomoDesktopApi } from '../../src/preload';
import { cleanupE2eData, createE2eRunData, createTextFixture } from '../helpers/e2e-data';
import {
  launchDesktopE2eApp,
  resizeDesktopContent,
  type DesktopE2eApp,
} from '../ui/helpers/electron-app';
import { importTextFileThroughLibraryUi, openLibraryHome } from '../ui/helpers/library';

type TimedEntry = { start: number; duration: number };
type Probe = { tasks: TimedEntry[]; frames: TimedEntry[]; previous: number };
type ProbeWindow = Window & { annotationPerformance?: Probe };
const counts = [100, 500, 1000];
const paragraphs = Array.from(
  { length: 1000 },
  (_, index) =>
    `Paragraph ${String(index).padStart(4, '0')}: Reading a source carefully helps distinguish the author's claims from the reader's own interpretation. This paragraph provides stable text for a saved reading note and its source anchor.`,
);
const profilePhase = process.env.YOMITOMO_ANNOTATION_PROFILE === 'font' ? 'font' : 'scroll';
const profile = ['1', 'font'].includes(process.env.YOMITOMO_ANNOTATION_PROFILE ?? '');

it('observes annotation cards without machine-specific performance thresholds', async () => {
  const runData = await createE2eRunData('annotation-card-performance');
  let desktop: DesktopE2eApp | undefined;
  let cdp: CDPSession | undefined;
  try {
    desktop = await launchDesktopE2eApp('annotation-card-seed', { runData, cleanupOnClose: false });
    await openLibraryHome(desktop.page);
    for (const count of counts) {
      const title = `Annotation measurement ${count}`;
      const fixture = await createTextFixture(runData.fixtureDir, {
        fileName: `notes-${count}.md`,
        content: `# ${title}\n\n${paragraphs.join('\n\n')}`,
      });
      await importTextFileThroughLibraryUi(desktop.page, fixture.path, { title });
    }
    await desktop.close();
    desktop = undefined;
    const articleIds = seedAnnotations(runData.userDataDir);
    desktop = await launchDesktopE2eApp('annotation-card-performance', {
      runData,
      cleanupOnClose: false,
    });
    await openLibraryHome(desktop.page);
    await resizeDesktopContent(desktop, { width: 1500, height: 860 });
    const page = desktop.page;
    await installProbe(page);
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const results = [];
    for (const count of profile ? [1000] : counts) {
      for (let sample = 0; sample < (profile ? 1 : 3); sample++) {
        const articleId = articleIds.get(count);
        if (!articleId) throw new Error('Missing measured article');
        await resetReader(page, articleId);
        const phases = [];
        phases.push(
          await measure(page, cdp, 'open', async () => {
            await page
              .getByRole('button', {
                name: `Open article: Annotation measurement ${count}`,
                exact: true,
              })
              .click();
            await page.locator('.reader-article').waitFor();
            await page.waitForFunction(
              (expected) =>
                new Set(
                  Array.from(
                    document.querySelectorAll('.reader-highlight[aria-label]'),
                    (element) => element.getAttribute('aria-label'),
                  ),
                ).size === expected,
              count,
            );
            await page.evaluate(async () => {
              await document.fonts.ready;
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              );
            });
          }),
        );
        if (profile && profilePhase === 'scroll') {
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.start');
        }
        phases.push(
          await measure(page, cdp, 'scroll', async () => {
            await page.evaluate(async () => {
              const surface = document.querySelector<HTMLElement>('.reader-surface');
              if (!surface) throw new Error('Reader surface is missing');
              for (let step = 0; step < 20; step++) {
                surface.scrollTo({
                  top: surface.scrollTop + surface.clientHeight * 0.75,
                  behavior: 'instant',
                });
                await new Promise<void>((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
                );
              }
            });
          }),
        );
        if (profile && profilePhase === 'scroll') {
          const { profile: cpuProfile } = await cdp.send('Profiler.stop');
          await writeFile(
            join(desktop.artifactsDir, 'annotation-cards-scroll.cpuprofile'),
            JSON.stringify(cpuProfile),
          );
        }
        await page.getByRole('button', { name: 'Font size', exact: true }).click();
        await expect(
          page.getByRole('slider', { name: 'Font size', exact: true }).inputValue(),
        ).resolves.toBe('20');
        if (profile && profilePhase === 'font') {
          await cdp.send('Profiler.enable');
          await cdp.send('Profiler.start');
        }
        phases.push(
          await measure(page, cdp, 'font', async () => {
            await page.getByRole('button', { name: '增加Font size', exact: true }).click();
            await page.evaluate(
              () =>
                new Promise<void>((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
                ),
            );
          }),
        );
        if (profile && profilePhase === 'font') {
          const { profile: cpuProfile } = await cdp.send('Profiler.stop');
          await writeFile(
            join(desktop.artifactsDir, 'annotation-cards-font.cpuprofile'),
            JSON.stringify(cpuProfile),
          );
        }
        await page.keyboard.press('Escape');
        if (sample === 0)
          await page.screenshot({
            path: join(desktop.artifactsDir, `annotation-cards-${count}.png`),
          });
        expect(phases[0].anchoredAnnotations).toBe(count);
        results.push({ count, sample, phases });
        await page.getByRole('button', { name: 'Back to library', exact: true }).click();
      }
    }
    const path = join(
      desktop.artifactsDir,
      profile ? 'annotation-cards-profiled.json' : 'annotation-cards-performance.json',
    );
    await mkdir(desktop.artifactsDir, { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          platform: `${process.platform}-${process.arch}`,
          cpu: cpus()[0]?.model,
          versions: await desktop.app.evaluate(() => ({
            electron: process.versions.electron,
            chrome: process.versions.chrome,
          })),
          profile,
          profilePhase: profile ? profilePhase : undefined,
          viewport: { width: 1500, height: 860 },
          fixture: {
            paragraphs: 1000,
            commentsPerAnnotation: 1,
            fontSize: 20,
            contentWidth: 600,
            scrollSteps: 20,
          },
          observationTailMs: 500,
          results,
        },
        null,
        2,
      )}\n`,
    );
    console.info(`Annotation measurements: ${path}`);
  } catch (error) {
    await desktop?.captureFailure('measurement').catch(() => undefined);
    throw error;
  } finally {
    await cdp?.detach().catch(() => undefined);
    await desktop?.close();
    await cleanupE2eData(runData);
  }
});

function seedAnnotations(userDataDir: string) {
  const sqlite = new SQLiteDatabase(join(userDataDir, 'yomitomo.sqlite'));
  const articleIds = new Map<number, string>();
  try {
    sqlite.pragma('foreign_keys = ON');
    const insert = sqlite.prepare(`INSERT INTO annotations
      (id, article_id, anchor, author, color, user_username, created_at, updated_at)
      VALUES (?, ?, ?, 'user', '#facc15', 'benchmark', ?, ?)`);
    const insertComment = sqlite.prepare(`INSERT INTO comments
      (id, annotation_id, author, content, created_at, user_username)
      VALUES (?, ?, 'user', ?, ?, 'benchmark')`);
    const now = new Date().toISOString();
    // Keep unrelated startup price refresh out of the renderer observation.
    sqlite
      .prepare(`INSERT INTO model_price_records
      (id, provider_id, model_id, currency, source, fetched_at, updated_at)
      VALUES ('performance-price', 'performance', 'fixture', 'USD', 'models.dev', ?, ?)`)
      .run(now, now);
    const createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    for (const count of counts) {
      const row = sqlite
        .prepare('SELECT id, content_html FROM articles WHERE title = ?')
        .get(`Annotation measurement ${count}`) as { id: string; content_html: string } | undefined;
      if (!row) throw new Error(`Missing article for ${count} annotations`);
      articleIds.set(count, row.id);
      const dom = new JSDOM(row.content_html);
      const text = dom.window.document.body.textContent;
      dom.window.close();
      sqlite.transaction(() => {
        for (let index = 0; index < count; index++) {
          const exact = paragraphs[Math.floor((index * 1000) / count)];
          const start = text.indexOf(exact);
          if (start < 0) throw new Error('Annotation quote is absent from the imported text');
          const anchor = {
            exact,
            prefix: text.slice(Math.max(0, start - 32), start),
            suffix: text.slice(start + exact.length, start + exact.length + 32),
            start,
            end: start + exact.length,
          };
          const id = `measurement-${count}-${index}`;
          insert.run(id, row.id, JSON.stringify(anchor), createdAt, createdAt);
          insertComment.run(
            `${id}-thought`,
            id,
            `Note ${index}: This saved interpretation refers to the quoted passage. Keep the claim connected to its evidence when reviewing it later.`,
            createdAt,
          );
        }
      })();
    }
    return articleIds;
  } finally {
    sqlite.close();
  }
}

async function resetReader(page: Page, articleId: string) {
  await page.evaluate(async (id) => {
    localStorage.setItem(
      'yomitomo.desktop.readerSettings',
      JSON.stringify({ fontSize: 20, contentWidth: 600 }),
    );
    const desktop = (window as Window & { yomitomoDesktop?: YomitomoDesktopApi }).yomitomoDesktop;
    if (!desktop) throw new Error('Desktop API is missing');
    await desktop.article.saveReadingProgress({
      articleId: id,
      progress: { kind: 'scroll', progress: 0, updatedAt: new Date().toISOString() },
    });
  }, articleId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add content', exact: true }).waitFor();
}

async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: Probe = { tasks: [], frames: [], previous: 0 };
    (window as ProbeWindow).annotationPerformance = probe;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        probe.tasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask' });
    const frame = (now: number) => {
      if (probe.previous)
        probe.frames.push({ start: probe.previous, duration: now - probe.previous });
      probe.previous = now;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

async function measure(page: Page, cdp: CDPSession, name: string, action: () => Promise<void>) {
  const before = await metrics(cdp);
  const start = await page.evaluate(() => performance.now());
  await action();
  const ready = await page.evaluate(() => performance.now());
  await page.waitForTimeout(500);
  const end = await page.evaluate(() => performance.now());
  const after = await metrics(cdp);
  const observation = await page.evaluate(
    ({ from, until }) => {
      const probe = (window as ProbeWindow).annotationPerformance;
      if (!probe) throw new Error('Annotation performance probe is missing');
      const tasks = probe.tasks.filter((entry) => entry.start >= from && entry.start < until);
      const frames = probe.frames.filter((entry) => entry.start >= from && entry.start < until);
      const highlights = document.querySelectorAll('.reader-highlight[aria-label]');
      return {
        longTasks: tasks.length,
        longTaskTotalMs: tasks.reduce((sum, entry) => sum + entry.duration, 0),
        longTaskMaxMs: Math.max(0, ...tasks.map((entry) => entry.duration)),
        frameGapMaxMs: Math.max(0, ...frames.map((entry) => entry.duration)),
        mountedCards: document.querySelectorAll(
          '.reader-annotation-rail .reader-note[data-annotation-id]',
        ).length,
        anchoredAnnotations: new Set(
          Array.from(highlights, (element) => element.getAttribute('aria-label')),
        ).size,
        highlightSpans: highlights.length,
        domNodes: document.querySelectorAll('*').length,
      };
    },
    { from: start, until: end },
  );
  const costs = Object.fromEntries(
    [
      'TaskDuration',
      'ScriptDuration',
      'LayoutDuration',
      'RecalcStyleDuration',
      'LayoutCount',
      'RecalcStyleCount',
    ].map((key) => {
      if (!(key in before) || !(key in after)) throw new Error(`Missing CDP metric: ${key}`);
      return [key, (after[key] - before[key]) * (key.endsWith('Duration') ? 1000 : 1)];
    }),
  );
  return { name, readyMs: ready - start, observationMs: end - start, ...costs, ...observation };
}

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
  const result: { metrics: { name: string; value: number }[] } =
    await cdp.send('Performance.getMetrics');
  return Object.fromEntries(result.metrics.map(({ name, value }) => [name, value]));
}
