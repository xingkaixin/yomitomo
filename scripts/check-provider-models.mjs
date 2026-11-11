import { execFileSync } from 'node:child_process';
import { providerPresets } from '../packages/shared/src/providers/providers.ts';

const MODELS_DEV_URL = 'https://models.dev/api.json';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lastTag = git('describe', '--tags', '--abbrev=0');
const since = git('log', '-1', '--format=%cs', lastTag);

const response = await fetch(MODELS_DEV_URL);
if (!response.ok) {
  console.error(`models.dev returned ${response.status}`);
  process.exit(1);
}
const catalogue = await response.json();

console.log(`Preset models against models.dev, new models since ${lastTag} (${since})`);

let unmapped = false;
for (const preset of providerPresets) {
  const models = catalogue[preset.modelsDevId]?.models;
  console.log(`\n${preset.id} -> ${preset.modelsDevId}`);
  if (!models) {
    console.log('  models.dev has no such provider; fix modelsDevId');
    unmapped = true;
    continue;
  }

  const lines = [];
  for (const name of preset.modelNames) {
    const model = models[name];
    if (!model) {
      lines.push(`not listed   ${name}`);
      continue;
    }
    if (model.status === 'deprecated') lines.push(`deprecated   ${name}`);
    const output = model.limit?.output;
    if (preset.maxOutputTokens && output && preset.maxOutputTokens[name] !== output) {
      lines.push(
        `output limit ${name}: preset ${preset.maxOutputTokens[name] ?? 'unset'}, models.dev ${output}`,
      );
    }
  }

  const released = Object.values(models)
    .filter(
      (model) =>
        model.release_date >= since &&
        model.status !== 'deprecated' &&
        model.modalities?.output?.includes('text') &&
        !preset.modelNames.includes(model.id),
    )
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  for (const model of released) lines.push(`new          ${model.id} (${model.release_date})`);

  console.log(lines.length > 0 ? lines.map((line) => `  ${line}`).join('\n') : '  up to date');
}

if (unmapped) process.exit(1);
