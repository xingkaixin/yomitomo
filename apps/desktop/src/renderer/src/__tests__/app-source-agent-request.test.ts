import { describe, expect, it, vi } from 'vitest';
import type {
  AgentReadingPlanItem,
  Annotation,
  PublicAgent,
  ReadingMemory,
} from '@yomitomo/shared';
import {
  buildAgentAnnotationRequestInput,
  createPendingAgentAnnotation,
  prepareSourceAgentAnnotationRequestInput,
  runSourceAgentAnnotationRequest,
  withoutAnnotationId,
} from '../source/bookcase/app-source-agent-request';
import type { PromptArticle } from '../shell/app-reading-types';

function agent(overrides: Partial<PublicAgent> = {}): PublicAgent {
  return {
    id: 'agent_lin',
    kind: 'annotation',
    presetId: 'lin',
    enabled: true,
    nickname: 'lin',
    username: 'lin',
    avatar: '',
    annotationColor: '#8a8f4f',
    annotationDensity: 'medium',
    temperature: 0.4,
    personalityName: 'Lin',
    ...overrides,
  };
}

const article: PromptArticle = {
  title: '文章',
  url: 'https://example.com/article',
  text: '一二三四五六七八九十',
};

const now = '2026-05-16T00:00:00.000Z';

const anchor: Annotation['anchor'] = {
  exact: '三四',
  prefix: '一二',
  suffix: '五六',
  start: 2,
  end: 4,
};

const annotation: Annotation = {
  id: 'annotation_1',
  author: 'user',
  color: '#8a8f4f',
  anchor,
  comments: [],
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
};

const readingMemory: ReadingMemory = {
  textSummaries: [],
  readingTraces: [],
  updatedAt: '2026-05-16T00:00:00.000Z',
};

describe('buildAgentAnnotationRequestInput', () => {
  it('builds target anchor requests without passing a whole reading plan', () => {
    const input = buildAgentAnnotationRequestInput(
      agent(),
      { targetAnchor: anchor, readingIntent: 'explain' },
      {
        article,
        annotations: [annotation],
        readingMemory,
      },
    );

    expect(input.playbackMode).toBe('target');
    expect(input.shouldSaveReadingMemory).toBe(false);
    expect(input.readingPlan).toEqual([
      {
        sectionId: 'target-selection',
        sectionTitle: '选区',
        sectionStart: 2,
        sectionEnd: 4,
        readingIntent: 'explain',
      },
    ]);
    expect(input.payload.annotations).toEqual([annotation]);
    expect(input.payload.readingPlan).toBeUndefined();
    expect(input.payload.readingMemory).toBeUndefined();
    expect(input.payload.targetAnchor).toBe(anchor);
  });

  it('keeps target playback anchored when no reading intent is provided', () => {
    const input = buildAgentAnnotationRequestInput(
      agent(),
      { targetAnchor: anchor },
      {
        article,
        annotations: [annotation],
        readingMemory,
      },
    );

    expect(input.playbackMode).toBe('target');
    expect(input.shouldSaveReadingMemory).toBe(false);
    expect(input.readingPlan).toEqual([
      {
        sectionId: 'target-selection',
        sectionTitle: '选区',
        sectionStart: 2,
        sectionEnd: 4,
      },
    ]);
    expect(input.payload.readingPlan).toBeUndefined();
    expect(input.payload.targetAnchor).toBe(anchor);
  });

  it('builds careful plan requests with reading memory', () => {
    const readingPlan: AgentReadingPlanItem[] = [
      {
        sectionId: 'section_1',
        sectionTitle: '第一节',
        sectionStart: 0,
        sectionEnd: 6,
        readingIntent: 'challenge',
      },
    ];
    const input = buildAgentAnnotationRequestInput(
      agent(),
      { readingPlan },
      { article, annotations: [annotation], readingMemory },
    );

    expect(input.playbackMode).toBe('careful');
    expect(input.shouldSaveReadingMemory).toBe(true);
    expect(input.payload.annotations).toEqual([annotation]);
    expect(input.payload.readingPlan).toBe(readingPlan);
    expect(input.payload.readingMemory).toBe(readingMemory);
    expect(input.payload.targetAnchor).toBeUndefined();
  });

  it('builds article requests without annotation context or reading memory', () => {
    const input = buildAgentAnnotationRequestInput(
      agent(),
      {},
      { article, annotations: [annotation] },
    );

    expect(input.playbackMode).toBe('article');
    expect(input.shouldSaveReadingMemory).toBe(false);
    expect(input.readingPlan).toEqual([]);
    expect(input.payload.annotations).toBeUndefined();
    expect(input.payload.readingPlan).toBeUndefined();
    expect(input.payload.readingMemory).toBeUndefined();
  });
});

describe('runSourceAgentAnnotationRequest', () => {
  it('counts accepted stream annotations', async () => {
    const requestInput = buildAgentAnnotationRequestInput(
      agent(),
      {},
      { article, annotations: [annotation] },
    );
    const secondAnnotation = { ...annotation, id: 'annotation_2' };
    const requestAgentAnnotationsStream = vi.fn(async (_payload, onEvent) => {
      onEvent({ type: 'start' });
      onEvent({ type: 'item', annotation });
      onEvent({ type: 'item', annotation: secondAnnotation });
      return { annotations: [annotation, secondAnnotation], readingMemory };
    });

    const result = await runSourceAgentAnnotationRequest({
      desktop: { requestAgentAnnotationsStream },
      requestInput,
      onAnnotation: (streamAnnotation) => streamAnnotation.id === annotation.id,
    });

    expect(result.annotationCount).toBe(1);
    expect(result.result.readingMemory).toBe(readingMemory);
  });
});

describe('prepareSourceAgentAnnotationRequestInput', () => {
  it('routes reading plan messages before building the stream payload', async () => {
    const readingPlan: AgentReadingPlanItem[] = [
      {
        sectionId: 'section_1',
        sectionTitle: '第一节',
        sectionStart: 0,
        sectionEnd: 6,
        messages: [
          {
            content: '@lin 解释这段',
          },
        ],
      },
    ];
    const planAgentMentionRoute = vi.fn().mockResolvedValue({
      createUserThought: false,
      directives: [
        {
          agentId: 'agent_lin',
          action: 'create_thought',
          instruction: '解释这段',
        },
      ],
    });

    const input = await prepareSourceAgentAnnotationRequestInput({
      desktop: { planAgentMentionRoute },
      agent: agent(),
      agents: [agent()],
      options: { readingPlan },
      context: { article, annotations: [annotation], readingMemory },
    });

    expect(input.readingPlan[0]?.messages).toEqual([
      expect.objectContaining({
        content: '解释这段',
        agentId: 'agent_lin',
      }),
    ]);
    expect(input.payload.readingPlan).toBe(input.readingPlan);
  });
});

describe('pending agent annotation', () => {
  it('builds a temporary thinking annotation for target requests', () => {
    const pending = createPendingAgentAnnotation(agent(), anchor, 'explain', now);

    expect(pending).toEqual(
      expect.objectContaining({
        anchor,
        author: 'ai',
        agentId: 'agent_lin',
        readingIntent: 'explain',
        createdAt: now,
        updatedAt: now,
      }),
    );
    expect(pending.comments).toEqual([
      expect.objectContaining({
        author: 'ai',
        content: 'lin 正在思考',
        agentId: 'agent_lin',
        readingIntent: 'explain',
        pending: true,
      }),
    ]);
  });

  it('removes a temporary thinking annotation by id', () => {
    const pending = createPendingAgentAnnotation(agent(), anchor, undefined, now);

    expect(withoutAnnotationId([annotation, pending], pending.id)).toEqual([annotation]);
  });
});
