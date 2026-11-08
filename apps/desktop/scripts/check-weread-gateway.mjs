import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { WEREAD_SKILL_VERSION } from '../src/main/weread/weread-protocol.ts';

const GATEWAY_URL = 'https://i.weread.qq.com/api/agent/gateway';
const snapshotUrl = new URL('weread-gateway-snapshot.json', import.meta.url);
const update = process.argv.includes('--update');
const apiKey = process.env.WEREAD_API_KEY;

if (!apiKey) {
  console.error('WEREAD_API_KEY is required.');
  process.exit(1);
}

const problems = [];

const { upgrade_info: upgradeInfo } = await callGateway('/user/notebooks', { count: 1 });
if (upgradeInfo) {
  problems.push(
    `skill_version ${WEREAD_SKILL_VERSION} is outdated; gateway asks for ${upgradeInfo.latest_version}. ` +
      `Skill docs: ${upgradeInfo.upgrade_url}`,
  );
}

const snapshot = JSON.parse(await readFile(snapshotUrl, 'utf8'));
const { apis } = await callGateway('/_list');
const listed = new Map(apis.map((api) => [api.api_name, contractOf(api)]));

if (update) {
  const next = Object.fromEntries(
    Object.keys(snapshot)
      .filter((name) => listed.has(name))
      .map((name) => [name, listed.get(name)]),
  );
  await writeFile(snapshotUrl, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Updated ${snapshotUrl.pathname}`);
} else {
  for (const [name, expected] of Object.entries(snapshot)) {
    const actual = listed.get(name);
    if (!actual) problems.push(`${name} is no longer listed by the gateway`);
    else problems.push(...contractChanges(name, expected, actual));
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`WeRead gateway matches skill_version ${WEREAD_SKILL_VERSION} and the snapshot.`);

async function callGateway(apiName, params = {}) {
  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_name: apiName, skill_version: WEREAD_SKILL_VERSION, ...params }),
  });
  if (!response.ok) throw new Error(`${apiName}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.errcode) throw new Error(`${apiName}: errcode ${data.errcode} ${data.errmsg ?? ''}`);
  return data;
}

function contractOf(api) {
  return {
    need_login: api.need_login,
    params: api.params.map(({ name, type, required, default: defaultValue }) => ({
      name,
      type,
      required,
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
    })),
    response_fields: api.response_fields,
  };
}

function contractChanges(name, expected, actual) {
  const changes = [];
  if (expected.need_login !== actual.need_login) {
    changes.push(`${name}: need_login ${expected.need_login} -> ${actual.need_login}`);
  }
  const expectedParams = new Map(expected.params.map((param) => [param.name, param]));
  const actualParams = new Map(actual.params.map((param) => [param.name, param]));
  for (const paramName of new Set([...expectedParams.keys(), ...actualParams.keys()])) {
    const before = expectedParams.get(paramName);
    const after = actualParams.get(paramName);
    if (!isDeepStrictEqual(before, after)) {
      changes.push(
        `${name}: param ${paramName} ${JSON.stringify(before ?? null)} -> ${JSON.stringify(after ?? null)}`,
      );
    }
  }
  const added = actual.response_fields.filter((field) => !expected.response_fields.includes(field));
  const removed = expected.response_fields.filter((field) => !actual.response_fields.includes(field));
  if (added.length > 0) changes.push(`${name}: response fields added ${added.join(', ')}`);
  if (removed.length > 0) changes.push(`${name}: response fields removed ${removed.join(', ')}`);
  return changes;
}
