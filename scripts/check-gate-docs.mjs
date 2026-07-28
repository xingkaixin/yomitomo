#!/usr/bin/env node
import { readFileSync } from 'node:fs';

// mise.toml owns the canonical gate: the CI workflow and every document that spells the
// gate out must expand to the same commands in the same order.
const MISE_CHECK_TASK = /\[tasks\."check"\]\s*\nrun = \[(.*?)\]/s;
const GATE_BLOCK = /<!-- gate:check -->\s*\n```bash\n(.*?)```/s;
const documents = ['README.md', 'README_zh.md', 'AGENTS.md'];
const violations = [];

const canonical = miseCheckTasks();
compare('.github/workflows/ci.yml', workflowGateCommands());
for (const document of documents) compare(document, documentGateCommands(document));

function miseCheckTasks() {
  const block = readFileSync('mise.toml', 'utf8').match(MISE_CHECK_TASK)?.[1];
  if (!block) throw new Error('mise.toml: could not read the check task');
  return [...block.matchAll(/task = "([^"]+)"/g)].map((match) => `pnpm ${match[1]}`);
}

function workflowGateCommands() {
  const source = readFileSync('.github/workflows/ci.yml', 'utf8');
  return [...source.matchAll(/^\s+run: (?:xvfb-run -a )?(pnpm [\w:-]+)$/gm)].map(
    (match) => match[1],
  );
}

function documentGateCommands(document) {
  const block = readFileSync(document, 'utf8').match(GATE_BLOCK)?.[1];
  if (block === undefined) {
    violations.push(`${document}: missing a <!-- gate:check --> bash block`);
    return null;
  }
  return block.trim().split('\n');
}

function compare(source, commands) {
  if (!commands) return;
  if (commands.join('\n') === canonical.join('\n')) return;
  violations.push(
    `${source}: gate sequence differs from mise.toml\n  expected: ${canonical.join(', ')}\n  found:    ${commands.join(', ')}`,
  );
}

if (violations.length > 0) {
  console.error('Gate documentation check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Gate documentation check passed for ${canonical.length} commands.`);
