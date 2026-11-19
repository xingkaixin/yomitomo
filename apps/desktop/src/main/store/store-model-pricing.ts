import { refreshModelsDevPricesWithDatabase } from '../providers/model-pricing-repository';
import { getDatabase, withDatabaseLease } from './store-db';

export function refreshModelPrices(options?: { signal?: AbortSignal }) {
  return refreshModelsDevPricesWithDatabase(
    (operation) => withDatabaseLease(async () => operation(getDatabase())),
    options,
  );
}
