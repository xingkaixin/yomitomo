import process from 'node:process';
import type {
  ReadingMemoryEmbeddingWorkerRequest,
  ReadingMemoryEmbeddingWorkerResponse,
} from '../../src/main/reading-memory/reading-memory-embedding-worker-protocol';

const dimension = 768;
const topics = [
  /reading|source|evidence|judgment|阅读|证据|观点|読書|根拠|判断/iu,
  /sky|astronomy|stars|天空|天文|星空|宇宙/iu,
];

if (!process.send) throw new Error('Fixture worker requires a parent IPC channel');
const send = process.send.bind(process);
let initialized = false;
process.on('disconnect', () => process.exit(0));
process.on('message', (request: ReadingMemoryEmbeddingWorkerRequest) => {
  if (request.type === 'initialize') {
    if (request.config.dimension !== dimension) throw new Error('Fixture requires 768 dimensions');
    initialized = true;
    return;
  }
  if (request.type === 'dispose') {
    post({ type: 'disposed' });
    return;
  }
  if (!initialized || process.argv.includes('--embedding-failed')) {
    post({ type: 'error', requestId: request.requestId, message: 'Controlled embedding failure' });
    return;
  }
  const vectors = new Float32Array(request.texts.length * dimension);
  for (const [row, text] of request.texts.entries()) {
    const matching = topics.flatMap((topic, index) => (topic.test(text) ? [index] : []));
    const axes = matching.length ? matching : [topics.length];
    for (const axis of axes) vectors[row * dimension + axis] = 1 / Math.sqrt(axes.length);
  }
  post({
    type: 'result',
    requestId: request.requestId,
    count: request.texts.length,
    dimension,
    buffer: vectors.buffer,
  });
});

function post(message: ReadingMemoryEmbeddingWorkerResponse) {
  send(message, (error) => {
    if (error) process.exit(1);
  });
}
