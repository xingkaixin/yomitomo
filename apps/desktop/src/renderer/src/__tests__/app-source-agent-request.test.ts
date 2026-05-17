import { describe, expect, it, vi } from 'vitest';
import type {
  AgentReadingPlanItem,
  Annotation,
  PublicAgent,
  ReadingMemory,
} from '@yomitomo/shared';
import {
  buildAgentAnnotationRequestInput,
  runSourceAgentAnnotationRequest,
} from '../app-source-agent-request';
import type { PromptArticle } from '../app-reading-types';

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
