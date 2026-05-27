import type { Agent, DesktopStore, LlmProvider } from '@yomitomo/shared';
import { agentPersonalities, makeId } from '@yomitomo/shared';
import { presetAgentAvatars } from './agent-avatars';
import * as schema from './db/schema';
import { type StoreDatabase, type StoreExecutor } from './store-db';
import {
  normalizeAgentKind,
  normalizeAgentUsername,
  normalizeAnnotationDensity,
  normalizeTemperature,
} from './store-normalizers';

export function buildAgentRecord(
  input: Partial<Agent>,
  store: Pick<DesktopStore, 'agents' | 'providers'>,
  now: string,
): Agent {
  const existing = input.id ? store.agents.find((agent) => agent.id === input.id) : undefined;
  const username = normalizeAgentUsername(
    input.username || existing?.username || input.nickname || 'agent',
    'agent',
  );
  return {
    id: existing?.id || makeId('agent'),
    kind: normalizeAgentKind(input.kind ?? existing?.kind) || 'annotation',
    presetId: input.presetId || existing?.presetId,
    enabled: input.enabled ?? existing?.enabled ?? true,
    providerId: input.providerId || existing?.providerId || store.providers[0]?.id || '',
    nickname: input.nickname?.trim() || existing?.nickname || 'Yomitomo',
    username,
    avatar: input.avatar?.trim() || existing?.avatar || '🤖',
    annotationColor: input.annotationColor?.trim() || existing?.annotationColor || '#8ab6d6',
    annotationDensity:
      normalizeAnnotationDensity(input.annotationDensity) ||
      normalizeAnnotationDensity(existing?.annotationDensity) ||
      'medium',
    temperature: normalizeTemperature(input.temperature ?? existing?.temperature),
    soul:
      input.soul?.trim() ||
      existing?.soul ||
      '你是一个克制、敏锐的结对阅读伙伴。优先回应用户正在讨论的文本，给出清晰、具体、可追问的判断。',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function ensurePresetAgents(
  database: StoreDatabase,
  providerRows: Array<typeof schema.providers.$inferSelect>,
  settings: typeof schema.appSettings.$inferSelect | undefined,
): Array<typeof schema.agents.$inferSelect> {
  const agentRows = database.select().from(schema.agents).all();
  if (providerRows.length === 0) return agentRows;

  const defaultProviderId = defaultAgentProviderId(providerRows, settings);
  const rowsByPreset = new Map(
    agentRows.flatMap((row) => (row.presetId ? [[row.presetId, row] as const] : [])),
  );
  const now = new Date().toISOString();
  let changed = false;

  for (const personality of agentPersonalities) {
    const existing = rowsByPreset.get(personality.id);
    const agent: Agent = {
      id: existing?.id || `agent_${personality.id.replace(/[^A-Za-z0-9_]/g, '_')}`,
      kind: personality.kind,
      presetId: personality.id,
      enabled: existing?.enabled ?? personality.defaultEnabled,
      providerId: existing?.providerId || defaultProviderId,
      nickname: personality.name,
      username: personality.name,
      avatar:
        presetAgentAvatars[personality.id] || existing?.avatar || personality.name.slice(0, 1),
      annotationColor: existing?.annotationColor || personality.defaultColor,
      annotationDensity: normalizeAnnotationDensity(existing?.annotationDensity) || 'medium',
      temperature: personality.temperature,
      soul: personality.soul,
      createdAt: existing?.createdAt || now,
      updatedAt: existing?.updatedAt || now,
    };
    if (existing && agentRowMatches(existing, agent)) continue;
    upsertAgent(database, agent);
    changed = true;
  }

  return changed ? database.select().from(schema.agents).all() : agentRows;
}

export function upsertAgent(database: StoreExecutor, agent: Agent) {
  database
    .insert(schema.agents)
    .values({
      id: agent.id,
      kind: agent.kind,
      presetId: agent.presetId,
      enabled: agent.enabled,
      providerId: agent.providerId,
      nickname: agent.nickname,
      username: agent.username,
      avatar: agent.avatar,
      annotationColor: agent.annotationColor,
      annotationDensity: agent.annotationDensity,
      temperature: agent.temperature,
      soul: agent.soul,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.agents.id,
      set: {
        providerId: agent.providerId,
        kind: agent.kind,
        presetId: agent.presetId,
        enabled: agent.enabled,
        nickname: agent.nickname,
        username: agent.username,
        avatar: agent.avatar,
        annotationColor: agent.annotationColor,
        annotationDensity: agent.annotationDensity,
        temperature: agent.temperature,
        soul: agent.soul,
        updatedAt: agent.updatedAt,
      },
    })
    .run();
}

function defaultAgentProviderId(
  providerRows: Array<typeof schema.providers.$inferSelect>,
  settings: typeof schema.appSettings.$inferSelect | undefined,
) {
  return settings?.readingAssistantProviderId &&
    hasProvider(providerRows, settings.readingAssistantProviderId)
    ? settings.readingAssistantProviderId
    : settings?.defaultProviderId && hasProvider(providerRows, settings.defaultProviderId)
      ? settings.defaultProviderId
      : providerRows[0].id;
}

function hasProvider(providerRows: Array<Pick<LlmProvider, 'id'>>, providerId: string) {
  return providerRows.some((provider) => provider.id === providerId);
}

function agentRowMatches(row: typeof schema.agents.$inferSelect, agent: Agent) {
  return (
    row.id === agent.id &&
    row.kind === agent.kind &&
    row.presetId === (agent.presetId || null) &&
    row.enabled === agent.enabled &&
    row.providerId === agent.providerId &&
    row.nickname === agent.nickname &&
    row.username === agent.username &&
    row.avatar === agent.avatar &&
    row.annotationColor === agent.annotationColor &&
    row.annotationDensity === agent.annotationDensity &&
    row.temperature === agent.temperature &&
    row.soul === agent.soul
  );
}
