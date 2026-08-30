import './fixture-startup';
import './fixture-network';

console.info('YOMITOMO_READING_MEMORY_FIXTURE_BUILD');
await import('../../src/main/index');
