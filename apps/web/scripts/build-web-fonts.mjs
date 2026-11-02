import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontverter from 'fontverter';
import { Blob as HbBlob, Buffer as HbBuffer, Face, Feature, Font, shape } from 'harfbuzzjs';
import { chromium } from 'playwright-core';
import subsetFont from 'subset-font';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const sourceDirectory = new URL('../font-sources/', import.meta.url);
const outputDirectory = new URL('../src/fonts/', import.meta.url);

const FACES = [
  { family: 'Source Serif 4', source: 'SourceSerif4-Regular', weight: '400' },
  { family: 'Source Serif 4', source: 'SourceSerif4-Bold', weight: '700 900' },
  { family: 'JetBrains Mono', source: 'JetBrainsMono-Regular', weight: '400' },
  { family: 'JetBrains Mono', source: 'JetBrainsMono-Bold', weight: '600 800' },
  { family: 'Noto Serif SC', source: 'NotoSerifSC-Regular', weight: '400' },
  { family: 'Noto Sans SC', source: 'NotoSansSC-Regular', weight: '400' },
];

// OFL Reserved Font Name "Source": the CSS family stays, the embedded name must not.
const RENAMES = { 'Source Serif 4': 'Yomitomo Serif', SourceSerif4: 'YomitomoSerif' };
const RENAMED_NAME_IDS = new Set([1, 3, 4, 6, 16, 17]);

// Browsers turn these on without any CSS. chws and halt back text-spacing-trim in CJK.
const DEFAULT_FEATURES = ['ccmp', 'chws', 'halt', 'kern', 'locl', 'mark', 'mkmk', 'rclt', 'rlig'];
// Kept only when shaping the site's own text needs them. JetBrains Mono's calt alone is 10 KB.
const LIGATURE_FEATURES = ['calt', 'clig', 'liga'];

const ASCII = codePointRange(0x20, 0x7e);
const CORE_PUNCTUATION = [0xa0, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026];
const LATIN_SUPPLEMENTS = codePointRange(0xa0, 0x17f);

function codePointRange(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function isCjk(codePoint) {
  return (
    (codePoint >= 0x3000 && codePoint < 0xa000) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef) ||
    codePoint >= 0x20000
  );
}

function pickFace(family, weight) {
  const faces = FACES.filter((face) => face.family === family);
  return faces.length > 1 && weight >= 600 ? faces[1] : faces[0];
}

/** Runs in the page: records every string a font may have to draw, keyed by computed font. */
function collectPageText() {
  const usage = {};
  const overrides = new Set();
  const record = (style, text) => {
    if (!text) return;
    const cased =
      style.textTransform === 'uppercase'
        ? text.toUpperCase()
        : style.textTransform === 'lowercase'
          ? text.toLowerCase()
          : text;
    const key = [style.fontFamily, style.fontWeight, style.fontStyle].join('|');
    const entry = (usage[key] ??= { text: '', tabular: false });
    entry.text += `${cased}${style.hyphens === 'auto' ? '‐' : ''}\n`;
    entry.tabular ||= style.fontVariantNumeric.includes('tabular-nums');
    for (const property of [
      'fontFeatureSettings',
      'fontVariantCaps',
      'fontVariantEastAsian',
      'fontVariantLigatures',
      'fontVariantPosition',
    ]) {
      if (style[property] !== 'normal') overrides.add(`${property}: ${style[property]}`);
    }
  };

  const elements = document.body.querySelectorAll('*');
  for (const element of elements) {
    if (element.matches('script, style')) continue;
    const style = getComputedStyle(element);
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) record(style, node.nodeValue);
    }
    for (const value of Object.values(element.dataset)) record(style, value);
    for (const pseudo of ['::before', '::after']) {
      const pseudoStyle = getComputedStyle(element, pseudo);
      if (pseudoStyle.content.startsWith('"')) {
        record(pseudoStyle, pseudoStyle.content.slice(1, -1));
      }
    }
  }

  // Scripts move these strings into elements styled differently from where they are stored.
  const flowDescription = document.querySelector('[data-flow-desc]');
  if (flowDescription) {
    const style = getComputedStyle(flowDescription);
    for (const tab of document.querySelectorAll('[data-flow-tab]')) record(style, tab.dataset.desc);
  }
  const dockLabel = document.querySelector('[data-dock-label]');
  if (dockLabel) {
    const style = getComputedStyle(dockLabel);
    for (const link of document.querySelectorAll('[data-head]')) record(style, link.textContent);
  }
  return { usage, overrides: [...overrides] };
}

async function serveDist() {
  const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript' };
  const server = createServer((request, response) => {
    let path = join(dist, decodeURIComponent(new URL(request.url, 'http://local').pathname));
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    createReadStream(path).pipe(response);
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function listPages() {
  const entries = await readdir(dist, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => `/${relative(dist, join(entry.parentPath, entry.name))}`);
}

async function auditSite(codePointsByFace) {
  const pages = await listPages();
  if (pages.length === 0) throw new Error('dist has no pages: build the site first.');

  const usage = new Map(
    FACES.map((face) => [face, { all: new Set(), english: new Set(), runs: new Set() }]),
  );
  const italicSerif = new Set();
  const overrides = new Set();
  const { server, origin } = await serveDist();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    route.request().url().startsWith(origin) ? route.continue() : route.abort(),
  );

  for (const path of pages) {
    await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(collectPageText);
    for (const override of result.overrides) overrides.add(override);
    for (const [key, entry] of Object.entries(result.usage)) {
      const [stack, weight, style] = key.split('|');
      const stackFaces = stack
        .split(',')
        .map((family) => pickFace(family.trim().replace(/^["']|["']$/g, ''), Number(weight)))
        .filter(Boolean);
      let run = '';
      let runFace;
      for (const character of entry.text) {
        const codePoint = character.codePointAt(0);
        const face =
          codePoint < 0x20
            ? undefined
            : stackFaces.find((candidate) => codePointsByFace.get(candidate).has(codePoint));
        if (face !== runFace) {
          if (runFace) usage.get(runFace).runs.add(run);
          run = '';
          runFace = face;
        }
        if (!face) continue;
        run += character;
        const used = usage.get(face);
        used.all.add(codePoint);
        if (path.startsWith('/en/')) used.english.add(codePoint);
        if (entry.tabular) face.tabular = true;
        if (style !== 'normal' && face.family === 'Source Serif 4') italicSerif.add(character);
      }
    }
  }

  await browser.close();
  server.close();
  return { pageCount: pages.length, usage, italicSerif, overrides };
}

function splitFace(available, used) {
  const inFont = (codePoint) => available.has(codePoint);
  const core = new Set([
    ...ASCII,
    ...CORE_PUNCTUATION,
    ...used.english,
    // Kerning stops at a file boundary, so a script's letters and punctuation must not split.
    // Noto kerns kana against 、。, which is why CJK punctuation stays with the CJK letters.
    ...[...used.all].filter((codePoint) => !isCjk(codePoint)),
  ]);
  const extended = new Set(
    [...used.all, ...LATIN_SUPPLEMENTS].filter((codePoint) => !core.has(codePoint)),
  );
  return { core: [...core].filter(inFont), extended: [...extended].filter(inFont) };
}

function renameFont(sfnt, renames) {
  const tableCount = sfnt.readUInt16BE(4);
  const tables = Array.from({ length: tableCount }, (_, index) => {
    const entry = 12 + index * 16;
    const offset = sfnt.readUInt32BE(entry + 8);
    const length = sfnt.readUInt32BE(entry + 12);
    return {
      tag: sfnt.toString('latin1', entry, entry + 4),
      data: sfnt.subarray(offset, offset + length),
    };
  });
  const nameTable = tables.find((table) => table.tag === 'name');
  nameTable.data = rewriteNames(nameTable.data, renames);

  const headerLength = 12 + tableCount * 16;
  const padded = (length) => (length + 3) & ~3;
  const totalLength = tables.reduce((sum, table) => sum + padded(table.data.length), headerLength);
  const output = Buffer.alloc(totalLength);
  sfnt.copy(output, 0, 0, 12);

  const checksum = (buffer) => {
    let sum = 0;
    for (let offset = 0; offset < buffer.length; offset += 4) {
      const word = Buffer.alloc(4);
      buffer.copy(word, 0, offset, offset + 4);
      sum = (sum + word.readUInt32BE(0)) >>> 0;
    }
    return sum;
  };

  let offset = headerLength;
  for (const [index, table] of tables.entries()) {
    const entry = 12 + index * 16;
    if (table.tag === 'head') table.data.writeUInt32BE(0, 8);
    output.write(table.tag, entry, 'latin1');
    output.writeUInt32BE(checksum(table.data), entry + 4);
    output.writeUInt32BE(offset, entry + 8);
    output.writeUInt32BE(table.data.length, entry + 12);
    table.data.copy(output, offset);
    offset += padded(table.data.length);
  }

  const head = tables.findIndex((table) => table.tag === 'head');
  const headOffset = output.readUInt32BE(12 + head * 16 + 8);
  output.writeUInt32BE((0xb1b0afba - checksum(output)) >>> 0, headOffset + 8);
  return output;
}

function rewriteNames(name, renames) {
  const count = name.readUInt16BE(2);
  const stringsStart = name.readUInt16BE(4);
  const records = Array.from({ length: count }, (_, index) => {
    const record = 6 + index * 12;
    const nameId = name.readUInt16BE(record + 6);
    const length = name.readUInt16BE(record + 8);
    const start = stringsStart + name.readUInt16BE(record + 10);
    const encoding = name.readUInt16BE(record) === 1 ? 'latin1' : 'utf16le';
    const raw = Buffer.from(name.subarray(start, start + length));
    if (!RENAMED_NAME_IDS.has(nameId)) return { record, value: raw };
    if (encoding === 'utf16le') raw.swap16();
    let text = raw.toString(encoding);
    for (const [from, to] of Object.entries(renames)) text = text.replaceAll(from, to);
    const value = Buffer.from(text, encoding);
    if (encoding === 'utf16le') value.swap16();
    return { record, value };
  });

  const header = Buffer.from(name.subarray(0, stringsStart));
  const strings = [];
  let offset = 0;
  for (const { record, value } of records) {
    header.writeUInt16BE(value.length, record + 8);
    header.writeUInt16BE(offset, record + 10);
    strings.push(value);
    offset += value.length;
  }
  return Buffer.concat([header, ...strings]);
}

function glyphIds(font, text, features) {
  const buffer = new HbBuffer();
  buffer.addText(text);
  buffer.guessSegmentProperties();
  shape(font, buffer, features);
  return buffer
    .getGlyphInfos()
    .map((glyph) => glyph.codepoint)
    .join();
}

function usedLigatureFeatures(sourceFace, runs) {
  const font = new Font(sourceFace);
  return LIGATURE_FEATURES.filter((tag) => {
    const without = [new Feature(tag, 0)];
    return [...runs].some((run) => glyphIds(font, run) !== glyphIds(font, run, without));
  });
}

function openFace(sfnt) {
  return new Face(new HbBlob(sfnt));
}

function metrics(face) {
  const hhea = Buffer.from(face.referenceTable('hhea'));
  const os2 = Buffer.from(face.referenceTable('OS/2'));
  return [
    face.upem,
    hhea.readInt16BE(4),
    hhea.readInt16BE(6),
    hhea.readInt16BE(8),
    os2.readInt16BE(68),
    os2.readInt16BE(70),
    os2.readInt16BE(72),
    os2.readUInt16BE(74),
    os2.readUInt16BE(76),
    os2.readUInt16BE(62),
  ].join();
}

function verifySubset(name, sfnt, sourceFace, codePoints) {
  const face = openFace(sfnt);
  const written = [...face.collectUnicodes()].toSorted((a, b) => a - b);
  const expected = [...codePoints].toSorted((a, b) => a - b);
  if (written.join() !== expected.join()) throw new Error(`${name}: cmap differs from request`);
  if (metrics(face) !== metrics(sourceFace)) throw new Error(`${name}: vertical metrics changed`);
  for (const tag of ['fpgm', 'prep', 'cvt ', 'hdmx', 'VDMX', 'LTSH', 'vhea', 'vmtx', 'fvar']) {
    if (face.referenceTable(tag)?.length) throw new Error(`${name}: ${tag} table survived`);
  }
  return {
    gsub: face.getTableFeatureTags('GSUB'),
    gpos: face.getTableFeatureTags('GPOS'),
    written,
  };
}

function toUnicodeRange(sortedCodePoints) {
  const ranges = [];
  for (const codePoint of sortedCodePoints) {
    const last = ranges.at(-1);
    if (last && last[1] === codePoint - 1) last[1] = codePoint;
    else ranges.push([codePoint, codePoint]);
  }
  const hex = (value) => value.toString(16).toUpperCase().padStart(4, '0');
  return ranges
    .map(([first, last]) => (first === last ? `U+${hex(first)}` : `U+${hex(first)}-${hex(last)}`))
    .join(', ');
}

function fontFaceRule(face, file, unicodeRange) {
  return `@font-face {
  font-family: '${face.family}';
  src: url('./${file}') format('woff2');
  font-weight: ${face.weight};
  font-style: normal;
  font-display: swap;
  unicode-range: ${unicodeRange};
}
`;
}

async function subsetAndWrite(face, part, codePoints, source, sourceFace, keepFeatures) {
  const sfnt = await subsetFont(source, String.fromCodePoint(...codePoints), {
    targetFormat: 'sfnt',
    noHinting: true,
    keepFeatures,
    dropTables: ['vhea', 'vmtx', 'VORG'],
    preserveNameIds: [13, 14],
  });
  const named = face.family === 'Source Serif 4' ? renameFont(Buffer.from(sfnt), RENAMES) : sfnt;
  const name = `${face.source}.${part}.woff2`;
  const { written, gsub, gpos } = verifySubset(name, named, sourceFace, codePoints);
  const woff2 = await fontverter.convert(named, 'woff2', 'sfnt');
  await writeFile(new URL(name, outputDirectory), woff2);
  console.log(
    `${name.padEnd(38)} ${String(woff2.length).padStart(7)} B  ${String(written.length).padStart(4)} chars  GSUB ${gsub.join(' ')}  GPOS ${gpos.join(' ')}`,
  );
  return fontFaceRule(face, name, toUnicodeRange(written));
}

const sources = new Map();
const sourceFaces = new Map();
const codePointsByFace = new Map();
for (const face of FACES) {
  const woff2 = await readFile(new URL(`${face.source}.woff2`, sourceDirectory));
  const sfnt = await fontverter.convert(woff2, 'sfnt');
  const opened = openFace(sfnt);
  sources.set(face, sfnt);
  sourceFaces.set(face, opened);
  codePointsByFace.set(face, new Set(opened.collectUnicodes()));
}

const audit = await auditSite(codePointsByFace);
console.log(`Audited ${audit.pageCount} pages.`);
if (audit.italicSerif.size > 0) {
  console.warn(
    `Source Serif 4 Italic is not shipped, but italic text uses it: ${[...audit.italicSerif].join('')}`,
  );
}
if (audit.overrides.size > 0) {
  console.warn(`Features this script does not keep: ${[...audit.overrides].join('; ')}`);
}

await mkdir(outputDirectory, { recursive: true });
for (const file of await readdir(outputDirectory)) {
  if (file.endsWith('.woff2')) await rm(new URL(file, outputDirectory));
}

const rules = [];
for (const face of FACES) {
  const available = codePointsByFace.get(face);
  const used = audit.usage.get(face);
  const { core, extended } = splitFace(available, used);
  const keepFeatures = [
    ...DEFAULT_FEATURES,
    ...usedLigatureFeatures(sourceFaces.get(face), used.runs),
    ...(face.tabular ? ['tnum'] : []),
  ];
  for (const [part, codePoints] of [
    ['core', core],
    ['ext', extended],
  ]) {
    rules.push(
      await subsetAndWrite(
        face,
        part,
        codePoints,
        sources.get(face),
        sourceFaces.get(face),
        keepFeatures,
      ),
    );
  }
}

await writeFile(
  new URL('web-fonts.css', outputDirectory),
  `/* Generated by scripts/build-web-fonts.mjs. Rerun rules: docs/web-performance.md. */\n\n${rules.join('\n')}`,
);
