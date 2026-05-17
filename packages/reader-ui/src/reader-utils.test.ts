import { describe, expect, it } from 'vitest';
import {
  annotationNavigationForInsertionIndex,
  annotationNavigationForReferenceIndex,
  buildAnnotationFilterFacets,
  buildAnnotationRailItems,
  createEmptyAnnotationFilter,
  filterAnnotationsByFacets,
  isAnnotationFilterActive,
  isMessageSendShortcutEvent,
  messageSendShortcutKeys,
  selectionActionShortcut,
  toggleAnnotationFilterValue,
  type AnnotationFilterState,
} from './reader-utils';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';

function box(annotationId: string, overrides: Partial<HighlightBox> = {}): HighlightBox {
  return {
    id: `${annotationId}_box`,
    annotationId,
    color: '#f4c95d',
    top: 10,
    left: 20,
    width: 80,
    height: 18,
    ...overrides,
  };
}

describe('message send shortcuts', () => {
  it('formats enter and modifier shortcuts', () => {
    expect(messageSendShortcutKeys('enter', '⌘')).toEqual(['⏎']);
    expect(messageSendShortcutKeys('mod-enter', 'Ctrl')).toEqual(['Ctrl', '⏎']);
  });

  it('matches plain enter without modifiers', () => {
    expect(isMessageSendShortcutEvent({ key: 'Enter' }, 'enter', 'MacIntel')).toBe(true);
    expect(isMessageSendShortcutEvent({ key: 'Enter', shiftKey: true }, 'enter', 'MacIntel')).toBe(
      false,
    );
    expect(isMessageSendShortcutEvent({ key: 'Enter', metaKey: true }, 'enter', 'MacIntel')).toBe(
      false,
    );
  });

  it('matches platform modifier enter', () => {
    expect(
      isMessageSendShortcutEvent({ key: 'Enter', metaKey: true }, 'mod-enter', 'MacIntel'),
    ).toBe(true);
    expect(isMessageSendShortcutEvent({ key: 'Enter', ctrlKey: true }, 'mod-enter', 'Win32')).toBe(
      true,
    );
    expect(
      isMessageSendShortcutEvent({ key: 'Enter', ctrlKey: true }, 'mod-enter', 'MacIntel'),
    ).toBe(false);
  });
});

describe('selection action shortcuts', () => {
  it('matches copy and annotate keys', () => {
    expect(selectionActionShortcut({ key: 'c' })).toBe('copy');
    expect(selectionActionShortcut({ key: 'C' })).toBe('copy');
    expect(selectionActionShortcut({ key: 'a' })).toBe('annotate');
    expect(selectionActionShortcut({ key: 'A' })).toBe('annotate');
  });

  it('matches configured copy and annotate keys', () => {
    const shortcuts = { copy: 'X', annotate: 'B' };

    expect(selectionActionShortcut({ key: 'x' }, shortcuts)).toBe('copy');
    expect(selectionActionShortcut({ key: 'b' }, shortcuts)).toBe('annotate');
    expect(selectionActionShortcut({ key: 'c' }, shortcuts)).toBe(null);
  });

  it('ignores modifier chords and composing input', () => {
    expect(selectionActionShortcut({ key: 'c', metaKey: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'a', ctrlKey: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'c', altKey: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'a', repeat: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'c', isComposing: true })).toBe(null);
    expect(selectionActionShortcut({ key: 'a', nativeEvent: { isComposing: true } })).toBe(null);
  });
});

describe('reader annotation filters', () => {
  const userProfile: UserProfile = {
    id: 'user-1',
    nickname: 'Kevin',
    username: 'kevin',
    avatar: '',
    annotationColor: '#f4c95d',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const agents: PublicAgent[] = [
    {
      id: 'agent-a',
      kind: 'annotation',
      enabled: true,
      nickname: '甲助手',
      username: 'agent_a',
      avatar: 'A',
      annotationColor: '#54cda0',
      annotationDensity: 'medium',
      personalityName: '甲',
      temperature: 0.3,
    },
    {
      id: 'agent-b',
      kind: 'annotation',
      enabled: true,
      nickname: '乙助手',
      username: 'agent_b',
      avatar: 'B',
      annotationColor: '#5ec0e8',
      annotationDensity: 'medium',
      personalityName: '乙',
      temperature: 0.3,
    },
  ];

  function annotation(id: string, overrides: Partial<Annotation> = {}): Annotation {
    return {
      id,
      anchor: {
        exact: `quote ${id}`,
        prefix: '',
        suffix: '',
        start: 0,
        end: 8,
      },
      author: 'user',
      annotationType: 'key_point',
      color: '#f4c95d',
      userId: userProfile.id,
      userUsername: userProfile.username,
      userNickname: userProfile.nickname,
      comments: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('keeps all annotations for the default filter', () => {
    const annotations = [annotation('a'), annotation('b', { author: 'ai' })];
    const filter = createEmptyAnnotationFilter();

    expect(isAnnotationFilterActive(filter)).toBe(false);
    expect(filterAnnotationsByFacets(annotations, filter)).toEqual(annotations);
  });

  it('matches groups with and while values inside one group use or', () => {
    const userKeyPoint = annotation('user-key');
    const agentKeyPoint = annotation('agent-key', {
      author: 'ai',
      agentId: 'agent-a',
      agentUsername: 'agent_a',
      annotationType: 'key_point',
      readingIntent: 'explain',
    });
    const agentQuestion = annotation('agent-question', {
      author: 'ai',
      agentId: 'agent-a',
      agentUsername: 'agent_a',
      annotationType: 'question',
      readingIntent: 'challenge',
    });
    const otherQuestion = annotation('other-question', {
      author: 'ai',
      agentId: 'agent-b',
      agentUsername: 'agent_b',
      annotationType: 'question',
      readingIntent: 'challenge',
    });
    const annotations = [userKeyPoint, agentKeyPoint, agentQuestion, otherQuestion];
    const filter: AnnotationFilterState = {
      personIds: ['agent:agent-a'],
      typeIds: ['key_point', 'question'],
      actionIds: ['challenge'],
    };

    expect(filterAnnotationsByFacets(annotations, filter).map((item) => item.id)).toEqual([
      'agent-question',
    ]);
  });

  it('counts facets from other groups and ignores the current group selection', () => {
    const annotations = [
      annotation('user-key', { readingIntent: 'explain' }),
      annotation('agent-a-question', {
        author: 'ai',
        agentId: 'agent-a',
        agentUsername: 'agent_a',
        annotationType: 'question',
        readingIntent: 'challenge',
      }),
      annotation('agent-b-question', {
        author: 'ai',
        agentId: 'agent-b',
        agentUsername: 'agent_b',
        annotationType: 'question',
        readingIntent: 'explain',
      }),
      annotation('agent-b-quote', {
        author: 'ai',
        agentId: 'agent-b',
        agentUsername: 'agent_b',
        annotationType: 'quote',
        readingIntent: 'challenge',
      }),
    ];
    const filter = toggleAnnotationFilterValue(
      { ...createEmptyAnnotationFilter(), typeIds: ['question'] },
      'person',
      'agent:agent-a',
    );
    const facets = buildAnnotationFilterFacets(annotations, filter, userProfile, agents);

    expect(facets.resultCount).toBe(1);
    expect(Object.fromEntries(facets.people.map((item) => [item.id, item.count]))).toMatchObject({
      'agent:agent-a': 1,
      'agent:agent-b': 1,
    });
    expect(Object.fromEntries(facets.types.map((item) => [item.id, item.count]))).toMatchObject({
      question: 1,
    });
  });

  it('keeps every annotation available for rail positioning', () => {
    const annotations = [annotation('user-note'), annotation('assistant-note', { author: 'ai' })];

    expect(
      buildAnnotationRailItems(annotations, [box('user-note')], null).map(
        (item) => item.annotation.id,
      ),
    ).toEqual(['user-note', 'assistant-note']);
  });

  it('stacks transitively overlapping rail annotations by anchor range', () => {
    const annotations = [
      annotation('first', { anchor: anchor('first', 0, 10) }),
      annotation('bridge', { anchor: anchor('bridge', 5, 25) }),
      annotation('third', { anchor: anchor('third', 20, 30) }),
      annotation('separate', { anchor: anchor('separate', 40, 50) }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [box('first', { top: 10 }), box('third', { top: 20 }), box('bridge', { top: 30 })],
      null,
    );
    const byId = new Map(items.map((item) => [item.annotation.id, item]));

    expect(byId.get('first')?.stackCount).toBe(3);
    expect(byId.get('bridge')?.stackCount).toBe(3);
    expect(byId.get('third')?.stackCount).toBe(3);
    expect(byId.get('separate')?.stackCount).toBe(1);
    expect(items.map((item) => item.annotation.id)).toEqual([
      'first',
      'third',
      'bridge',
      'separate',
    ]);
  });

  it('resolves navigation around an explicit reference annotation', () => {
    const annotations = [annotation('first'), annotation('second'), annotation('third')];

    expect(annotationNavigationForReferenceIndex(annotations, 1)).toEqual({
      previousId: 'first',
      nextId: 'third',
    });
    expect(annotationNavigationForReferenceIndex(annotations, 0)).toEqual({
      previousId: null,
      nextId: 'second',
    });
    expect(annotationNavigationForReferenceIndex(annotations, 2)).toEqual({
      previousId: 'second',
      nextId: null,
    });
  });

  it('resolves navigation around a viewport insertion point', () => {
    const annotations = [annotation('first'), annotation('second'), annotation('third')];

    expect(annotationNavigationForInsertionIndex(annotations, 0)).toEqual({
      previousId: null,
      nextId: 'first',
    });
    expect(annotationNavigationForInsertionIndex(annotations, 2)).toEqual({
      previousId: 'second',
      nextId: 'third',
    });
    expect(annotationNavigationForInsertionIndex(annotations, 3)).toEqual({
      previousId: 'third',
      nextId: null,
    });
  });
});

function anchor(exact: string, start: number, end: number) {
  return {
    exact,
    prefix: '',
    suffix: '',
    start,
    end,
  };
}
