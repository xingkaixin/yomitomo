import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import JSZip from 'jszip';

const e2eKeepDataEnv = 'YOMITOMO_E2E_KEEP_DATA';

export type E2eRunData = {
  fixtureDir: string;
  rootDir: string;
  userDataDir: string;
};

export type E2eFixtureFile = {
  data: Buffer;
  fileName: string;
  mimeType: string;
  path: string;
};

type CleanupE2eDataOptions = {
  keep?: boolean;
  log?: (message: string) => void;
};

type TinyEpubOptions = {
  chapterText?: string;
  creator?: string;
  fileName?: string;
  title?: string;
};

type TextFixtureOptions = {
  content?: string;
  fileName?: string;
};

type PdfFixtureOptions = {
  fileName?: string;
  title?: string;
};

export async function createE2eRunData(label: string): Promise<E2eRunData> {
  const safeLabel = safeE2eName(label);
  const rootDir = await mkdtemp(join(tmpdir(), `yomitomo-e2e-${safeLabel}-`));
  const userDataDir = join(rootDir, 'user-data');
  const fixtureDir = join(rootDir, 'fixtures');
  await mkdir(userDataDir, { recursive: true });
  await mkdir(fixtureDir, { recursive: true });
  return { fixtureDir, rootDir, userDataDir };
}

export async function createE2eUserDataDir(label: string) {
  return mkdtemp(join(tmpdir(), `yomitomo-e2e-${safeE2eName(label)}-user-data-`));
}

export async function cleanupE2eData(data: E2eRunData, options: CleanupE2eDataOptions = {}) {
  const keep = options.keep ?? process.env[e2eKeepDataEnv] === '1';
  if (keep) {
    const log = options.log ?? console.info;
    log(`YOMITOMO_E2E_ROOT_DIR=${data.rootDir}`);
    log(`YOMITOMO_E2E_USER_DATA_DIR=${data.userDataDir}`);
    log(`YOMITOMO_E2E_FIXTURE_DIR=${data.fixtureDir}`);
    return;
  }
  await rm(data.rootDir, { recursive: true, force: true });
}

export async function cleanupE2ePath(path: string) {
  await rm(path, { recursive: true, force: true });
}

export function createE2eDesktopEnv(data: E2eRunData, baseEnv = process.env) {
  return {
    ...baseEnv,
    ELECTRON_ENABLE_LOGGING: '1',
    YOMITOMO_DISABLE_TELEMETRY: '1',
    YOMITOMO_E2E: '1',
    YOMITOMO_USER_DATA_DIR: data.userDataDir,
  };
}

export async function createTinyEpubData(options: TinyEpubOptions = {}) {
  const title = options.title ?? 'E2E Smoke Book';
  const creator = options.creator ?? 'Yomitomo Test';
  const chapterText = options.chapterText ?? 'This is the first E2E smoke paragraph.';
  const zip = new JSZip();
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
      </rootfiles>
    </container>`,
  );
  zip.file(
    'OPS/package.opf',
    `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>${escapeXmlText(title)}</dc:title>
        <dc:creator>${escapeXmlText(creator)}</dc:creator>
        <dc:language>en</dc:language>
      </metadata>
      <manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
        <itemref idref="c1"/>
      </spine>
    </package>`,
  );
  zip.file(
    'OPS/nav.xhtml',
    `<html><body><nav epub:type="toc"><ol>
      <li><a href="chapter1.xhtml">Chapter One</a></li>
    </ol></nav></body></html>`,
  );
  zip.file(
    'OPS/chapter1.xhtml',
    `<html><body><h1>Chapter One</h1><p>${escapeXmlText(chapterText)}</p></body></html>`,
  );
  return zip.generateAsync({ type: 'arraybuffer' });
}

export async function createTinyEpubFixture(
  fixtureDir: string,
  options: TinyEpubOptions = {},
): Promise<E2eFixtureFile> {
  const fileName = options.fileName ?? 'tiny.epub';
  const data = Buffer.from(await createTinyEpubData(options));
  const path = fixtureFilePath(fixtureDir, fileName);
  await writeFile(path, data);
  return { data, fileName, mimeType: 'application/epub+zip', path };
}

export async function createTextFixture(
  fixtureDir: string,
  options: TextFixtureOptions = {},
): Promise<E2eFixtureFile> {
  const fileName = options.fileName ?? 'tiny.txt';
  const data = Buffer.from(options.content ?? 'Yomitomo E2E text fixture.\n', 'utf8');
  const path = fixtureFilePath(fixtureDir, fileName);
  await writeFile(path, data);
  return { data, fileName, mimeType: 'text/plain', path };
}

export async function createTinyPdfFixture(
  fixtureDir: string,
  options: PdfFixtureOptions = {},
): Promise<E2eFixtureFile> {
  const fileName = options.fileName ?? 'tiny.pdf';
  const data = Buffer.from(tinyPdfSource(options.title ?? 'Yomitomo E2E PDF'), 'utf8');
  const path = fixtureFilePath(fixtureDir, fileName);
  await writeFile(path, data);
  return { data, fileName, mimeType: 'application/pdf', path };
}

export function safeE2eName(value: string) {
  const safeName = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safeName || 'run';
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fixtureFilePath(fixtureDir: string, fileName: string) {
  const safeFileName = fileName.trim();
  if (!safeFileName || safeFileName !== basename(safeFileName)) {
    throw new Error(`Invalid E2E fixture file name: ${fileName}`);
  }
  return join(fixtureDir, safeFileName);
}

function tinyPdfSource(title: string) {
  const safeTitle = title.replace(/[()\\]/g, '');
  const stream = `BT /F1 12 Tf 20 120 Td (${safeTitle}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const startxref = Buffer.byteLength(body, 'utf8');
  const entries = offsets.map((offset, index) =>
    index === 0 ? '0000000000 65535 f' : `${offset.toString().padStart(10, '0')} 00000 n`,
  );
  return `${body}xref
0 ${offsets.length}
${entries.join('\n')}
trailer
<< /Root 1 0 R /Size ${offsets.length} >>
startxref
${startxref}
%%EOF
`;
}
