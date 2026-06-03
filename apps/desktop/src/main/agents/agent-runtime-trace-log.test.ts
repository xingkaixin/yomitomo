import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testPaths = vi.hoisted(() => ({
  userData: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => testPaths.userData,
  },
}));

import {
  appendAgentRuntimeTrace,
  getAgentRuntimeTracePath,
  readAgentRuntimeTraces,
} from './agent-runtime-trace-log';

describe('agent runtime trace log', () => {
  beforeEach(async () => {
    testPaths.userData = await mkdtemp(join(tmpdir(), 'yomitomo-agent-trace-test-'));
  });

  it('reads valid trace entries with filters and stable ordering', async () => {
    await appendAgentRuntimeTrace({
      id: 'trace_old',
      at: '2026-05-25T00:00:00.000Z',
      taskType: 'thread_reply',
      agentId: 'agent_1',
      articleId: 'article_1',
      status: 'comment',
      stepCount: 1,
    });
    await appendAgentRuntimeTrace({
      id: 'trace_new',
      at: '2026-05-26T00:00:00.000Z',
      taskType: 'selection_first',
      agentId: 'agent_2',
      articleId: 'article_2',
      status: 'fallback',
      failureReason: 'tool_failed',
      stepCount: 2,
    });
    await writeFile(
      getAgentRuntimeTracePath(),
      `not-json\n${JSON.stringify({
        id: 'trace_newer',
        at: '2026-05-27T00:00:00.000Z',
        taskType: 'selection_first',
        agentId: 'agent_2',
        articleId: 'article_3',
        status: 'result',
        stepCount: 3,
      })}\n`,
      { encoding: 'utf8', flag: 'a' },
    );

    await expect(
      readAgentRuntimeTraces({ taskType: 'selection_first', limit: 2 }),
    ).resolves.toMatchObject([{ id: 'trace_newer' }, { id: 'trace_new' }]);
    await expect(readAgentRuntimeTraces({ failureOnly: true })).resolves.toMatchObject([
      { id: 'trace_new' },
    ]);
  });

  afterEach(async () => {
    await rm(testPaths.userData, { recursive: true, force: true });
  });
});
