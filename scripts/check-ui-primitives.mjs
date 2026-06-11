#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const radixModulePattern =
  /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"]@radix-ui\/|import\s*['"]@radix-ui\/|require\(\s*['"]@radix-ui\//;
const radixPackagePattern = /"@radix-ui\/[^"]+"\s*:/;
const radixLockfilePattern = /['"]?@radix-ui\//;

function hasRadixReference(file, source) {
  if (file === 'pnpm-lock.yaml') {
    return radixLockfilePattern.test(source);
  }

  if (file.endsWith('package.json')) {
    return radixPackagePattern.test(source);
  }

  if (/\.[cm]?[jt]sx?$/.test(file)) {
    return radixModulePattern.test(source);
  }

  return false;
}

function trackedFiles() {
  const output = execFileSync(
    'git',
    [
      'ls-files',
      'package.json',
      'pnpm-lock.yaml',
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

  if (hasRadixReference(normalizedFile, source)) {
    violations.push(`${normalizedFile}: unexpected @radix-ui reference`);
  }
}

if (violations.length > 0) {
  console.error('UI primitive boundary check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  console.error('\nUse @base-ui/react for UI primitives. Radix imports and dependencies are retired.');
  process.exit(1);
}

console.log('UI primitive boundary check passed.');
