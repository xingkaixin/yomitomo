import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const root = dirname(fileURLToPath(import.meta.url));
const rendererRoot = resolve(root, 'src/renderer');
const workspaceDeps = ['@yomitomo/ai', '@yomitomo/core', '@yomitomo/shared'];
const mainExternalDeps = [
  'electron',
  'better-sqlite3',
  '@napi-rs/keyring',
  'jsdom',
  '@embedpdf/pdfium',
];
const commonjsFilename = '__filename';
const commonjsDirname = '__dirname';
const commonjsFilenameValue =
  '(() => { const pathname = decodeURIComponent(new URL(import.meta.url).pathname); return process.platform === "win32" ? pathname.replace(/^\\/([A-Za-z]:)/, "$1").replaceAll("/", "\\\\") : pathname; })()';
const commonjsDirnameValue =
  '(() => { const index = Math.max(__filename.lastIndexOf("/"), __filename.lastIndexOf("\\\\")); return index > 0 ? __filename.slice(0, index) : __filename; })()';

function electronMainImportMetaCompat() {
  const replaceImportMetaPaths = (code: string) =>
    code
      .replaceAll('import.meta.filename', commonjsFilename)
      .replaceAll('import.meta.dirname', commonjsDirname)
      .replaceAll('const __filename =', 'var __filename =')
      .replaceAll('const __dirname =', 'var __dirname =');
  const commonjsGlobals = `var __filename = ${commonjsFilenameValue};\nvar __dirname = ${commonjsDirnameValue};\n`;
  const withCommonjsGlobals = (code: string) => {
    const nextCode = replaceImportMetaPaths(code);
    return nextCode.includes('__filename') || nextCode.includes('__dirname')
      ? `${commonjsGlobals}${nextCode}`
      : nextCode;
  };

  return {
    name: 'electron-main-import-meta-compat',
    renderChunk(code: string) {
      return withCommonjsGlobals(code);
    },
    generateBundle(_options: unknown, bundle: Record<string, { type: string; code?: string }>) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && chunk.code) chunk.code = withCommonjsGlobals(chunk.code);
      }
    },
  };
}

export default defineConfig({
  main: {
    build: {
      outDir: resolve(root, 'dist/main'),
      rollupOptions: {
        external: mainExternalDeps,
        output: {
          assetFileNames: 'chunks/[name][extname]',
          chunkFileNames: 'chunks/[name].js',
          entryFileNames: '[name].js',
          format: 'es',
        },
        input: {
          index: resolve(root, 'src/main/index.ts'),
          'article-import-worker': resolve(root, 'src/main/articles/article-import-worker.ts'),
        },
        plugins: [electronMainImportMetaCompat()],
      },
    },
    define: {
      'import.meta.dirname': commonjsDirname,
      'import.meta.filename': commonjsFilename,
    },
    plugins: [externalizeDepsPlugin({ exclude: workspaceDeps })],
  },
  preload: {
    build: {
      outDir: resolve(root, 'dist/preload'),
    },
    plugins: [externalizeDepsPlugin({ exclude: workspaceDeps })],
  },
  renderer: {
    root: rendererRoot,
    build: {
      outDir: resolve(root, 'dist/renderer'),
      rollupOptions: {
        input: resolve(rendererRoot, 'index.html'),
      },
    },
    plugins: [react()],
  },
});
