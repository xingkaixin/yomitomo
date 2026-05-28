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

function requestBodyText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

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

  it('normalizes direct final action JSON into a provider final_action event', () => {
    expect(
      parseAssistantProviderEvent(
        '{"type":"add_annotation","anchor":{"exact":"目标","prefix":"","suffix":"","start":0,"end":2},"thought":"值得解释","reason":"有讨论价值","evidenceIds":["evidence_0_0"],"confidence":0.8}',
      ),
    ).toEqual({
      type: 'final_action',
      action: {
        type: 'add_annotation',
        anchor: {
          exact: '目标',
          prefix: '',
          suffix: '',
          start: 0,
          end: 2,
        },
        thought: '值得解释',
        reason: '有讨论价值',
        evidenceIds: ['evidence_0_0'],
        confidence: 0.8,
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

  it('passes native tools and repair feedback to OpenAI-compatible chat providers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'get_current_thread',
                      arguments: '{"annotationId":"annotation_1"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
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
      toolResults: [],
      repairReason: 'missing_query',
    });

    expect(event).toMatchObject({
      type: 'tool_call',
      toolCall: { name: 'get_current_thread' },
    });
    const body = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
      tools: Array<{
        type: string;
        function: { name: string; description: string; parameters: unknown };
      }>;
    };
    expect(body.tools[0]).toMatchObject({
      type: 'function',
      function: { name: 'get_current_thread', description: '读取当前 thread' },
    });
    expect(body.tools[0]?.function.parameters).toEqual({
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {},
    });
    expect(body.messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringContaining('missing_query'),
    });
  });

  it('preserves disabled thinking params on native OpenAI-compatible tool calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"type":"final_action","action":{"type":"no_action","reason":"done","evidenceIds":[],"confidence":0.6}}',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const adapter = createAssistantProviderModelAdapter(
      {
        ...provider(),
        presetId: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        modelName: 'deepseek-v4-flash',
        reasoningEffort: 'none',
      },
      payload(),
    );

    await adapter({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      stepIndex: 0,
      availableTools: [{ name: 'get_current_thread', description: '读取当前 thread' }],
      evidence: [],
      toolResults: [],
    });

    const body = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      thinking?: unknown;
    };
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('exposes final action tools for providers without native JSON schema', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_reply',
                    type: 'function',
                    function: {
                      name: 'reply_to_thread',
                      arguments:
                        '{"annotationId":"annotation_1","content":"回复正文","evidenceIds":["evidence_0_0"],"confidence":0.8,"reason":"已有证据"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
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
      stepIndex: 1,
      availableTools: [{ name: 'get_current_thread', description: '读取当前 thread' }],
      evidence: [],
      toolResults: [],
    });

    expect(event).toEqual({
      type: 'final_action',
      action: {
        type: 'reply_to_thread',
        annotationId: 'annotation_1',
        content: '回复正文',
        evidenceIds: ['evidence_0_0'],
        confidence: 0.8,
        reason: '已有证据',
      },
    });
    const body = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      tools: Array<{ function: { name: string } }>;
    };
    expect(body.tools.map((tool) => tool.function.name)).toContain('reply_to_thread');
  });

  it('normalizes OpenAI-compatible usage on native tool events', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            total_tokens: 120,
            prompt_tokens_details: {
              cached_tokens: 30,
              cache_write_tokens: 5,
            },
            completion_tokens_details: {
              reasoning_tokens: 7,
            },
          },
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'get_current_thread',
                      arguments: '{}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
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
      toolResults: [],
    });

    expect(event).toMatchObject({
      type: 'tool_call',
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        reasoningTokens: 7,
        cachedInputTokens: 30,
        cacheWriteTokens: 5,
        totalTokens: 120,
      },
    });
  });

  it('passes tool evidence text as native tool result messages', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"type":"final_action","action":{"type":"no_action","reason":"done","evidenceIds":["evidence_0_0"],"confidence":0.6}}',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const adapter = createAssistantProviderModelAdapter(provider(), payload());

    await adapter({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      stepIndex: 1,
      availableTools: [{ name: 'get_current_thread', description: '读取当前 thread' }],
      evidence: [
        {
          id: 'evidence_0_0',
          toolCallId: 'tool_call_0',
          toolName: 'get_current_thread',
          summary: '当前 thread：目标句子',
          text: 'selection: 目标句子\ncomments:\nuser: 这句话是什么意思？',
          provenance: {
            articleId: 'article_1',
            sourceType: 'comment',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'tool_call_0',
          toolName: 'get_current_thread',
          ok: true,
          evidenceIds: ['evidence_0_0'],
          evidence: [
            {
              id: 'evidence_0_0',
              toolCallId: 'tool_call_0',
              toolName: 'get_current_thread',
              summary: '当前 thread：目标句子',
              text: 'selection: 目标句子\ncomments:\nuser: 这句话是什么意思？',
              provenance: {
                articleId: 'article_1',
                sourceType: 'comment',
              },
            },
          ],
        },
      ],
    });

    const body = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const toolMessage = body.messages.find((message) => message.role === 'tool')?.content || '';
    expect(toolMessage).toContain('"toolName":"get_current_thread"');
    expect(toolMessage).toContain('selection: 目标句子');
    expect(toolMessage).toContain('user: 这句话是什么意思？');
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
