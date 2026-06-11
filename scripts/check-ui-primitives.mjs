#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const allowedRadixImports = new Set([
  'apps/desktop/src/renderer/src/components/ui/popover.tsx',
  'apps/desktop/src/renderer/src/components/ui/select.tsx',
  'packages/reader-ui/src/components/ui/tooltip.tsx',
]);

const allowedRadixPackageFiles = new Set([
  'apps/desktop/package.json',
  'packages/reader-ui/package.json',
]);

function trackedFiles() {
  const output = execFileSync(
    'git',
    [
      'ls-files',
      'package.json',
      'apps',
      'packages',
      'scripts',
      'docs',
      ':!:**/node_modules/**',
      ':!:dist/**',
    ],
    { encoding: 'utf8' },
  );
  return output.split('\n').filter(Boolean);
}

const violations = [];

for (const file of trackedFiles()) {
  const source = readFileSync(file, 'utf8');
  const normalizedFile = relative(process.cwd(), file);

  if (source.includes('@radix-ui/')) {
    const allowed =
      allowedRadixImports.has(normalizedFile) || allowedRadixPackageFiles.has(normalizedFile);
    if (!allowed) {
      violations.push(`${normalizedFile}: unexpected @radix-ui reference`);
    }
  }
}

if (violations.length > 0) {
  console.error('UI primitive boundary check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  console.error('\nUse @base-ui/react for new UI primitives. Existing Radix wrappers are migration-only.');
  process.exit(1);
}

console.log('UI primitive boundary check passed.');
