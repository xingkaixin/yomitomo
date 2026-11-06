import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import type { CDPSession, Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { cleanupE2eData, createE2eRunData } from '../helpers/e2e-data';
import {
  launchDesktopE2eApp,
  resizeDesktopContent,
  type DesktopE2eApp,
} from '../ui/helpers/electron-app';
import {
  importEbookFileThroughLibraryUi,
  libraryDocumentButton,
  openLibraryHome,
  waitForLibraryDocument,
} from '../ui/helpers/library';

type LogLine = { event: string; data: Record<string, unknown> };
type ProbeWindow = Window & { ebookDocumentRefs?: WeakRef<Document>[] };

const title = 'Ebook reader measurement';
const normalSectionCount = 40;
const normalParagraphs = 60;
const largeParagraphs = 1100;
const largeSectionPosition = 20;
const pageTurns = 20;
const crossingTurns = 10;
const viewport = { width: 1500, height: 860 };
const sentence =
  '阅读时把作者的论点和自己的理解分开记录，回看时才能判断哪一部分来自原文，哪一部分是读者后来的推断。';

it('observes ebook section loading and retained section documents', async () => {
  const runData = await createE2eRunData('ebook-reader-performance');
  let desktop: DesktopE2eApp | undefined;
  let cdp: CDPSession | undefined;
  try {
    const fixturePath = join(runData.fixtureDir, 'ebook-reader-measurement.epub');
    await writeFile(fixturePath, await createMeasurementEpub());

    desktop = await launchDesktopE2eApp('ebook-reader-performance', {
      runData,
      cleanupOnClose: false,
    });
    const page = desktop.page;
    await openLibraryHome(page);
    await resizeDesktopContent(desktop, viewport);
    await importEbookFileThroughLibraryUi(page, fixturePath);
    await waitForLibraryDocument(page, title, 'Ebook');
    await libraryDocumentButton(page, title, 'Ebook').click();
    await page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready').waitFor({
      timeout: 30_000,
    });
    const logPath = join(runData.userDataDir, 'yomitomo-agent.log');
    // Background pagination opens a second book; wait for it so it doesn't overlap the samples.
    await waitForLog(
      logPath,
      (line) =>
        line.event === 'performance.ebook_pagination' &&
        line.data.phase === 'measure' &&
        line.data.result === 'complete',
    );

    cdp = await page.context().newCDPSession(page);
    await installDocumentProbe(page);
    const heapBefore = await collectHeap(cdp);

    const sectionCount = normalSectionCount + 1;
    for (let index = 1; index < sectionCount; index++) await goToSection(page, index);
    await goToSection(page, largeSectionPosition);
    for (let turn = 0; turn < pageTurns; turn++) await turnPage(page);
    await goToSection(page, 0);
    for (let turn = 0; turn < pageTurns; turn++) await turnPage(page);
    for (let index = 1; index <= crossingTurns; index++) {
      await goToSection(page, index, 1);
      await turnPage(page);
    }

    const heapAfter = await collectHeap(cdp);
    const documents = await page.evaluate(() => {
      const refs = (window as ProbeWindow).ebookDocumentRefs ?? [];
      return { loaded: refs.length, alive: refs.filter((ref) => ref.deref()).length };
    });
    // Log appends are queued in the main process; give the last section entries time to land.
    await page.waitForTimeout(500);
    const lines = await readLog(logPath);
    const sectionLoads = lines
      .filter((line) => line.event === 'performance.ebook_section_load')
      .map((line) => line.data);
    const pageTurnSummary = summarizePageTurns(lines);
    const pagination = lines
      .filter(
        (line) => line.event === 'performance.ebook_pagination' && line.data.phase === 'measure',
      )
      .map(({ data }) => ({
        elapsedMs: data.elapsedMs,
        openMs: data.openMs,
        result: data.result,
        sectionCount: data.sectionCount,
      }));
    expect(sectionLoads.length).toBeGreaterThan(0);

    const result = {
      measuredAt: new Date().toISOString(),
      platform: `${process.platform}-${process.arch}`,
      cpu: cpus()[0]?.model,
      versions: await desktop.app.evaluate(() => ({
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      })),
      viewport,
      fixture: {
        normalSectionCount,
        normalParagraphs,
        largeParagraphs,
        largeSectionIndex: largeSectionPosition,
        imagesPerNormalSection: 2,
        imagesInLargeSection: 20,
        pageTurnsPerSection: pageTurns,
        crossingTurns,
      },
      documents,
      heap: { before: heapBefore, after: heapAfter },
      pagination,
      pageTurns: pageTurnSummary,
      sectionLoads: {
        normal: summarizeSectionLoads(
          sectionLoads.filter((load) => load.index !== largeSectionPosition),
        ),
        large: sectionLoads.filter((load) => load.index === largeSectionPosition),
      },
    };
    await mkdir(desktop.artifactsDir, { recursive: true });
    const path = join(desktop.artifactsDir, 'ebook-reader-performance.json');
    await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
    console.info(`Ebook reader measurements: ${path}`);
  } catch (error) {
    await desktop?.captureFailure('measurement').catch(() => undefined);
    throw error;
  } finally {
    await cdp?.detach().catch(() => undefined);
    await desktop?.close();
    await cleanupE2eData(runData);
  }
});

async function installDocumentProbe(page: Page) {
  await page.evaluate(() => {
    const view = document.querySelector('.ebook-foliate-frame .ebook-foliate-view');
    if (!view) throw new Error('Ebook view is missing');
    const probe = window as ProbeWindow;
    probe.ebookDocumentRefs = [];
    view.addEventListener('load', (event) => {
      const { doc } = (event as CustomEvent<{ doc: Document }>).detail;
      probe.ebookDocumentRefs?.push(new WeakRef(doc));
    });
  });
}

async function goToSection(page: Page, index: number, anchor = 0) {
  await page.evaluate(
    async (target) => {
      const view = document.querySelector('.ebook-foliate-frame .ebook-foliate-view') as
        | (Element & {
            renderer?: { goTo(target: { index: number; anchor: number }): Promise<void> };
          })
        | null;
      if (!view?.renderer) throw new Error('Ebook renderer is missing');
      await view.renderer.goTo(target);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    },
    { index, anchor },
  );
}

async function turnPage(page: Page) {
  await page.keyboard.press('ArrowRight');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(80);
}

async function collectHeap(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const usage = (await cdp.send('Runtime.getHeapUsage')) as {
    usedSize: number;
    embedderHeapUsedSize?: number;
  };
  return {
    jsMb: Number((usage.usedSize / 1024 / 1024).toFixed(1)),
    embedderMb: Number(((usage.embedderHeapUsedSize ?? 0) / 1024 / 1024).toFixed(1)),
  };
}

async function readLog(path: string): Promise<LogLine[]> {
  const text = await readFile(path, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter((line) => line.includes('"performance.ebook_'))
    .map((line) => JSON.parse(line) as LogLine);
}

async function waitForLog(path: string, matches: (line: LogLine) => boolean) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if ((await readLog(path)).some(matches)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for ebook pagination measurement');
}

function summarizeSectionLoads(loads: Record<string, unknown>[]) {
  const keys = [
    'totalMs',
    'loadMs',
    'readMs',
    'parseMs',
    'resourceMs',
    'serializeMs',
    'iframeMs',
    'setupMs',
    'styleMs',
    'renderMs',
    'imageSizeMs',
    'anchorMs',
  ];
  return {
    count: loads.length,
    ...Object.fromEntries(
      keys.map((key) => [key, percentiles(loads.map((load) => Number(load[key] ?? 0)))]),
    ),
  };
}

function summarizePageTurns(lines: LogLine[]) {
  const turns = new Map<string, Map<string, Record<string, unknown>>>();
  for (const { event, data } of lines) {
    if (event !== 'performance.ebook_page_turn' || data.source !== 'control') continue;
    const turnId = String(data.turnId);
    const phases = turns.get(turnId) ?? new Map();
    phases.set(String(data.phase), data);
    turns.set(turnId, phases);
  }
  const withinNormal: number[] = [];
  const withinLarge: number[] = [];
  const crossing: number[] = [];
  for (const phases of turns.values()) {
    const done = phases.get('view_go_done');
    if (!done) continue;
    const elapsedMs = Number(done.elapsedMs);
    const start = phases.get('start')?.pageInfo as { sectionIndex?: number } | undefined;
    if (phases.has('load')) crossing.push(elapsedMs);
    else if (start?.sectionIndex === largeSectionPosition) withinLarge.push(elapsedMs);
    else withinNormal.push(elapsedMs);
  }
  return {
    withinNormal: percentiles(withinNormal),
    withinLarge: percentiles(withinLarge),
    crossing: percentiles(crossing),
  };
}

function percentiles(values: number[]) {
  const sorted = values.toSorted((left, right) => left - right);
  const at = (ratio: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  return sorted.length
    ? { n: sorted.length, p50: at(0.5), p90: at(0.9), max: sorted.at(-1) }
    : { n: 0 };
}

async function createMeasurementEpub() {
  const zip = new JSZip();
  const image = createGradientPng(800, 600);
  const sections: { id: string; body: string }[] = [];
  const imageItems: string[] = [];
  const addImage = (name: string) => {
    zip.file(`OPS/images/${name}`, image);
    imageItems.push(`<item id="${name}" href="images/${name}" media-type="image/png"/>`);
    return `<p><img src="images/${name}" alt=""/></p>`;
  };
  const paragraphs = (count: number, prefix: string) =>
    Array.from(
      { length: count },
      (_, index) => `<p>${prefix}第 ${index + 1} 段：${sentence.repeat(3)}</p>`,
    ).join('');

  for (let index = 0; index < normalSectionCount; index++) {
    sections.push({
      id: `c${index}`,
      body: `<h1>第 ${index + 1} 章</h1>${addImage(`c${index}-a.png`)}${paragraphs(normalParagraphs / 2, `${index + 1}-`)}${addImage(`c${index}-b.png`)}${paragraphs(normalParagraphs / 2, `${index + 1}-`)}`,
    });
  }
  const largeImages = Array.from({ length: 20 }, (_, index) => addImage(`large-${index}.png`));
  const largeChunk = largeParagraphs / largeImages.length;
  sections.splice(largeSectionPosition, 0, {
    id: 'large',
    body: `<h1>长章节</h1>${largeImages.map((img, index) => `${img}${paragraphs(largeChunk, `L${index}-`)}`).join('')}`,
  });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    'OPS/package.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">ebook-reader-measurement</dc:identifier><dc:title>${title}</dc:title><dc:creator>Yomitomo Performance</dc:creator><dc:language>zh</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${sections
      .map(
        (section) =>
          `<item id="${section.id}" href="${section.id}.xhtml" media-type="application/xhtml+xml"/>`,
      )
      .join('')}${imageItems.join('')}</manifest><spine>${sections
      .map((section) => `<itemref idref="${section.id}"/>`)
      .join('')}</spine></package>`,
  );
  zip.file(
    'OPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>${sections
      .map((section) => `<li><a href="${section.id}.xhtml">${section.id}</a></li>`)
      .join('')}</ol></nav></body></html>`,
  );
  for (const section of sections) {
    zip.file(
      `OPS/${section.id}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="zh"><head><title>${section.id}</title></head><body>${section.body}</body></html>`,
    );
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

function createGradientPng(width: number, height: number) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 3;
      raw[offset] = (x * 255) / width;
      raw[offset + 1] = (y * 255) / height;
      raw[offset + 2] = ((x ^ y) & 0xff) / 2;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
