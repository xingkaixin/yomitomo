import { refreshModelsDevPrices } from '../providers/model-pricing-repository';
import { getDatabase } from './store-db';

export function refreshModelPrices() {
  return refreshModelsDevPrices(getDatabase());
}
