import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '@yomitomo/shared';
import {
  callAssistantProviderEvent,
  createAssistantProviderModelAdapter,
  parseAssistantProviderEvent,
} from './assistant-provider-adapter';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assistant provider adapter', () => {
  it('parses tool call events from JSON text', () => {
    expect(
      parseAssistantProviderEvent(
        '{"type":"tool_call","toolCall":{"id":"call_1","name":"search_article_memory","input":{"query":"目标"}}}',
      ),
    ).toEqual({
      type: 'tool_call',
      toolCall: {
        id: 'call_1',
        name: 'search_article_memory',
        input: { query: '目标' },
      },
    });
  });

  it('parses final action events from fenced JSON', () => {
    expect(
      parseAssistantProviderEvent(
        '```json\n{"type":"final_action","action":{"type":"no_action","reason":"无证据","evidenceIds":[],"confidence":0.4}}\n```',
      ),
    ).toEqual({
      type: 'final_action',
      action: {
        type: 'no_action',
        reason: '无证据',
        evidenceIds: [],
        confidence: 0.4,
      },
    });
  });

  it('classifies non-json responses as invalid provider output', () => {
    expect(parseAssistantProviderEvent('plain text')).toMatchObject({
      type: 'invalid_response',
      reason: 'provider_event_not_json',
    });
  });

  it('wraps provider request failures as provider_failure events', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(callAssistantProviderEvent(provider(), payload())).resolves.toEqual({
      type: 'provider_failure',
      reason: 'network down',
    });
  });

  it('passes runtime turn state to the provider prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"type":"tool_call","toolCall":{"name":"get_current_thread","input":{"annotationId":"annotation_1"}}}',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const adapter = createAssistantProviderModelAdapter(provider(), payload());

    const event = await adapter({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      stepIndex: 0,
      availableTools: [{ name: 'get_current_thread', description: '读取当前 thread' }],
      evidence: [],
      repairReason: 'missing_query',
    });

    expect(event).toMatchObject({
      type: 'tool_call',
      toolCall: { name: 'get_current_thread' },
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages.find((message) => message.role === 'user')?.content || '';
    expect(userMessage).toContain('assistant_runtime_turn');
    expect(userMessage).toContain('"repairReason": "missing_query"');
    expect(userMessage).toContain('"name": "get_current_thread"');
  });
});

function provider(): LlmProvider {
  return {
    id: 'provider-1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.com/v1',
    apiKey: 'key',
    modelName: 'model',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function payload() {
  return {
    system: 'system',
    user: 'user',
    maxTokens: 256,
  };
}
