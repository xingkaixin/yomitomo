import * as schema from '../db/schema';
import { type StoreExecutor } from '../store/store-db';

const telemetryStateId = 'default';

export type StoredTelemetryState = {
  installId?: string;
  lastHeartbeatDay?: string;
};

export function readTelemetryEnabled(database: StoreExecutor) {
  const settings = database.select().from(schema.appSettings).limit(1).get();
  return settings?.telemetryEnabled ?? true;
}

export function readTelemetryState(database: StoreExecutor): StoredTelemetryState {
  const row = database.select().from(schema.telemetryState).limit(1).get();
  return {
    installId: stringValue(row?.installId),
    lastHeartbeatDay: stringValue(row?.lastHeartbeatDay),
  };
}

export function upsertTelemetryState(database: StoreExecutor, state: StoredTelemetryState) {
  if (!state.installId) return;
  const row = {
    id: telemetryStateId,
    installId: state.installId,
    lastHeartbeatDay: state.lastHeartbeatDay || null,
    updatedAt: new Date().toISOString(),
  };
  database
    .insert(schema.telemetryState)
    .values(row)
    .onConflictDoUpdate({
      target: schema.telemetryState.id,
      set: row,
    })
    .run();
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}
