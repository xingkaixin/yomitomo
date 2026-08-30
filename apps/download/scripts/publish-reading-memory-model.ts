import { publishReadingMemoryModel } from './model-publication.ts';
import { loadReadingMemoryReleasePlan } from './model-release.ts';
import { createR2ObjectStore } from './r2-object-store.ts';

const plan = await loadReadingMemoryReleasePlan();
const result = await publishReadingMemoryModel(plan, createR2ObjectStore());

console.log(`Published ${plan.internalId}: ${result.created} created, ${result.verified} verified`);
