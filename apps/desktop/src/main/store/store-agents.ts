import { eq } from 'drizzle-orm';
import type { Agent, DesktopStore } from '@yomitomo/shared';
import type { AgentStorePatch } from '../../ipc-contract';
import { buildAgentRecord, ensurePresetAgents, upsertAgent } from '../agents/agent-repository';
import * as schema from '../db/schema';
import { getDatabase, type StoreDatabase } from './store-db';
import { migrateProviderApiKeys } from './store-provider-key-migration';
import { rowToAgent, rowToProvider, rowToSettings } from './store-normalizers';

export type AgentRuntimeStoreContext = Pick<DesktopStore, 'agents' | 'providers' | 'settings'>;

export async function readAgentRuntimeContext(): Promise<AgentRuntimeStoreContext> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  return readAgentRuntimeContextRows(database);
}

export async function saveAgent(input: Partial<Agent>): Promise<AgentStorePatch> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  const store = readAgentRuntimeContextRows(database);
  const agent = buildAgentRecord(input, store, new Date().toISOString());
  upsertAgent(database, agent);
  return readAgentStorePatch(database);
}

export async function deleteAgent(id: string): Promise<AgentStorePatch> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  database.delete(schema.agents).where(eq(schema.agents.id, id)).run();
  return readAgentStorePatch(database);
}

function readAgentStorePatch(database: StoreDatabase): AgentStorePatch {
  return { agents: readAgentRuntimeContextRows(database).agents };
}

function readAgentRuntimeContextRows(database: StoreDatabase): AgentRuntimeStoreContext {
  const settings = database.select().from(schema.appSettings).limit(1).get();
  const providerRows = database.select().from(schema.providers).all();
  const agentRows = ensurePresetAgents(database, providerRows, settings);
  return {
    settings: rowToSettings(settings),
    providers: providerRows.map(rowToProvider),
    agents: agentRows.map(rowToAgent),
  };
}
