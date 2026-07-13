#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';

const defaultDocuments = ['docs/annotation-data-flow.md', 'docs/focus-co-reading-data-flow.md'];
const repositoryPathPattern = /`((?:apps|docs|packages|scripts)\/[A-Za-z0-9._@/-]+)`/g;
const documents = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultDocuments;
const violations = [];

for (const document of documents) {
  if (!existsSync(document)) {
    violations.push(`${document}: document does not exist`);
    continue;
  }

  const source = readFileSync(document, 'utf8');
  for (const match of source.matchAll(repositoryPathPattern)) {
    const repositoryPath = match[1];
    if (!existsSync(repositoryPath)) {
      violations.push(`${document}: referenced path does not exist: ${repositoryPath}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Documentation path check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Documentation path check passed for ${documents.length} document(s).`);
