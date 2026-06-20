import type {
  Agent,
  AgentAnnotationDensity,
  AgentKind,
  LlmProvider,
  ProviderPresetId,
  ProviderType,
  ReasoningEffort,
} from '@yomitomo/shared';
import { providerPresets } from '@yomitomo/shared';
import * as schema from '../db/schema';

export function rowToProvider(row: typeof schema.providers.$inferSelect): LlmProvider {
  const presetId = normalizePresetId(row.presetId || undefined);
  const preset = providerPresets.find((item) => item.id === presetId);
  return {
    id: row.id,
    name: row.name,
    type: preset?.type || normalizeProviderType(row.type) || 'openai-chat',
    presetId,
    logo: row.logo || undefined,
    baseUrl: row.baseUrl,
    apiKey: '',
    hasApiKey: Boolean(row.apiKeyRef),
    modelName: row.modelName,
    modelNames: normalizeModelNames(row.modelNames),
    modelInputMode: normalizeProviderModelInputMode(row.modelInputMode) || 'list',
    reasoningEffort: 'none',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToAgent(row: typeof schema.agents.$inferSelect): Agent {
  return {
    id: row.id,
    kind: normalizeAgentKind(row.kind) || 'annotation',
    presetId: row.presetId || undefined,
    enabled: row.enabled,
    providerId: row.providerId,
    nickname: row.nickname,
    username: row.username,
    avatar: row.avatar,
    annotationColor: row.annotationColor || '#8ab6d6',
    annotationDensity: normalizeAnnotationDensity(row.annotationDensity) || 'medium',
    temperature: normalizeTemperature(row.temperature),
    soul: row.soul,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isProviderPresetId(value: unknown): value is ProviderPresetId {
  return providerPresets.some((preset) => preset.id === value);
}

export function normalizeAgentUsername(value: string, fallback = 'agent') {
  return value.trim().replace(/^@/, '').replace(/\s+/g, '').slice(0, 32) || fallback;
}

export function normalizeAnnotationDensity(value: unknown): AgentAnnotationDensity | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

export function normalizeAgentKind(value: unknown): AgentKind | null {
  return value === 'annotation' || value === 'review' ? value : null;
}

export function normalizeProviderType(value: unknown): ProviderType | null {
  if (value === 'openai') return 'openai-chat';
  return value === 'openai-chat' ||
    value === 'openai-responses' ||
    value === 'anthropic' ||
    value === 'gemini'
    ? value
    : null;
}

export function normalizeProviderModelInputMode(value: unknown) {
  return value === 'custom' || value === 'list' ? value : null;
}

export function normalizePresetId(value: unknown): ProviderPresetId | undefined {
  return isProviderPresetId(value) ? value : undefined;
}

export function normalizeModelNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = Array.from(
    new Set(
      value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()),
    ),
  ).filter(Boolean);
  return names;
}

export function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
  return value === 'default' ||
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'auto'
    ? value
    : undefined;
}

export function normalizeTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.5;
  return Math.min(1, Math.max(0, temperature));
}
