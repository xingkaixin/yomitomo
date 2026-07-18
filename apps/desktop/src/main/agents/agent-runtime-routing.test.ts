import { describe, expect, it } from 'vitest';
import { selectAgentRuntime } from './agent-runtime-routing';

describe('selectAgentRuntime', () => {
  it('selects supported runtimes only in deep verification mode', () => {
    expect(
      selectAgentRuntime({
        requestedMode: 'deep_verification',
        taskType: 'thread_reply',
        supportedTaskTypes: ['thread_reply', 'create_thought'],
      }),
    ).toBe('thread_reply');
    expect(
      selectAgentRuntime({
        requestedMode: 'deep_verification',
        taskType: 'distillation_review',
        supportedTaskTypes: ['thread_reply', 'create_thought'],
      }),
    ).toBeNull();
    expect(
      selectAgentRuntime({
        requestedMode: 'fast_response',
        taskType: 'thread_reply',
        supportedTaskTypes: ['thread_reply'],
      }),
    ).toBeNull();
  });
});
