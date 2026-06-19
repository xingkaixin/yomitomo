import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mainPath } from '../app/main-paths';

export function pdfiumWasmPath() {
  const packagedPath = join(process.resourcesPath, 'pdfium', 'pdfium.wasm');
  if (existsSync(packagedPath)) return packagedPath;
  return mainPath('../../node_modules/@embedpdf/pdfium/dist/pdfium.wasm');
}

export async function readPdfiumWasmBinary() {
  const bytes = await readFile(pdfiumWasmPath());
  const wasmBinary = new Uint8Array(bytes.byteLength);
  wasmBinary.set(bytes);
  return wasmBinary.buffer;
}
