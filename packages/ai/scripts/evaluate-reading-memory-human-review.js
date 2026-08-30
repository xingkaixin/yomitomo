import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateReadingMemoryHumanReview,
  readingMemoryHumanReviewScope,
} from '../src/evaluation/reading-memory-human-review-evaluation.ts';

const maxInputBytes = 16 * 1024 * 1024;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let report;
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.output) await rejectInputOverwrite(options.input, options.output);
    const input = await readInput(options.input);
    report = {
      inputSha256: createHash('sha256').update(input).digest('hex'),
      ...evaluateReadingMemoryHumanReview(parseJson(input)),
    };
    if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    report = {
      ...readingMemoryHumanReviewScope,
      passed: false,
      failures: [error instanceof Error ? error.message : 'Human review evaluation failed'],
    };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.passed ? 0 : 1;
}

async function readInput(path) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length;
    if (bytes > maxInputBytes) throw new Error('Human review input must not exceed 16 MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

function parseJson(input) {
  try {
    return JSON.parse(input.toString('utf8'));
  } catch {
    throw new Error('Human review input must contain valid JSON');
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if ((name !== '--input' && name !== '--output') || !value || value.startsWith('--'))
      throw new Error('Usage: --input <review-record.json> [--output <report.json>]');
    const key = name.slice(2);
    if (Object.hasOwn(options, key)) throw new Error(`${name} may only be specified once`);
    options[key] = resolve(value);
  }
  if (!options.input)
    throw new Error('--input is required; no review records are generated automatically');
  return options;
}

async function rejectInputOverwrite(input, output) {
  if (input === output) throw new Error('--output must not overwrite the input record');
  const inputStat = await stat(input);
  let outputStat;
  try {
    outputStat = await stat(output);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino)
    throw new Error('--output must not overwrite the input record');
}
