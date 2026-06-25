import { describe, expect, it } from 'vitest';
import {
  buildAnnotationFilterFacets,
  buildAnnotationRailItems,
  createEmptyAnnotationFilter,
  filterAnnotationsByFacets,
  isAnnotationFilterActive,
  toggleAnnotationFilterValue,
  type AnnotationFilterState,
} from './reader-annotations';
import {
  annotationNavigationForInsertionIndex,
  annotationNavigationForReferenceIndex,
} from '../reader-navigation';
import {
  isMessageSendShortcutEvent,
  messageSendShortcutKeys,
  selectionActionShortcut,
} from '../reader-shortcuts';
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
  it('matches copy, annotate and ask keys', () => {
    expect(selectionActionShortcut({ key: 'c' })).toBe('copy');
    expect(selectionActionShortcut({ key: 'C' })).toBe('copy');
    expect(selectionActionShortcut({ key: 'a' })).toBe('annotate');
    expect(selectionActionShortcut({ key: 'A' })).toBe('annotate');
    expect(selectionActionShortcut({ key: 'q' })).toBe('ask');
    expect(selectionActionShortcut({ key: 'Q' })).toBe('ask');
  });

  it('matches configured copy, annotate and ask keys', () => {
    const shortcuts = { copy: 'X', annotate: 'B', ask: 'Y' };

    expect(selectionActionShortcut({ key: 'x' }, shortcuts)).toBe('copy');
    expect(selectionActionShortcut({ key: 'b' }, shortcuts)).toBe('annotate');
    expect(selectionActionShortcut({ key: 'y' }, shortcuts)).toBe('ask');
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

  it('keeps cross-segment translation annotations apart despite colliding anchor offsets', () => {
    const annotations = [
      annotation('seg-1', { anchor: { ...anchor('seg-1', 0, 8), segmentId: 'block_1_aaa' } }),
      annotation('seg-2', { anchor: { ...anchor('seg-2', 0, 8), segmentId: 'block_2_bbb' } }),
      annotation('seg-3', { anchor: { ...anchor('seg-3', 0, 8), segmentId: 'block_3_ccc' } }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [box('seg-1', { top: 100 }), box('seg-2', { top: 300 }), box('seg-3', { top: 500 })],
      null,
    );
    const byId = new Map(items.map((item) => [item.annotation.id, item]));

    expect(byId.get('seg-1')?.stackCount).toBe(1);
    expect(byId.get('seg-2')?.stackCount).toBe(1);
    expect(byId.get('seg-3')?.stackCount).toBe(1);
  });

  it('places rail items on the side nearest their highlight when both sides fit', () => {
    const items = buildAnnotationRailItems(
      [
        annotation('left-note', { anchor: anchor('left', 0, 10) }),
        annotation('right-note', { anchor: anchor('right', 20, 30) }),
      ],
      [box('left-note', { left: 120 }), box('right-note', { left: 720 })],
      null,
      {},
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'both',
        railWidth: 320,
        rightRailLeft: 980,
      },
    );

    expect(items.map((item) => [item.annotation.id, item.railSide, item.style.left])).toEqual([
      ['left-note', 'left', 24],
      ['right-note', 'right', 980],
    ]);
  });

  it('alternates nearby rail groups across both sides', () => {
    const items = buildAnnotationRailItems(
      [
        annotation('first', { anchor: anchor('first', 0, 10) }),
        annotation('second', { anchor: anchor('second', 20, 30) }),
      ],
      [box('first', { left: 120, top: 120 }), box('second', { left: 140, top: 170 })],
      null,
      {},
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'both',
        railWidth: 320,
        rightRailLeft: 980,
      },
    );

    expect(items.map((item) => [item.annotation.id, item.railSide, item.style.top])).toEqual([
      ['first', 'left', 110],
      ['second', 'right', 160],
    ]);
  });

  it('keeps active rail groups on the pressure-selected side', () => {
    const annotations = [
      annotation('first', { anchor: anchor('first', 0, 10) }),
      annotation('second', { anchor: anchor('second', 20, 30) }),
    ];
    const boxes = [box('first', { left: 120, top: 120 }), box('second', { left: 140, top: 170 })];
    const railLayout = {
      articleCenterX: 500,
      leftRailLeft: 24,
      mode: 'both' as const,
      railWidth: 320,
      rightRailLeft: 980,
    };

    const inactiveItems = buildAnnotationRailItems(annotations, boxes, null, {}, railLayout);
    const activeItems = buildAnnotationRailItems(annotations, boxes, 'second', {}, railLayout);
    const inactiveSecond = inactiveItems.find((item) => item.annotation.id === 'second');
    const activeSecond = activeItems.find((item) => item.annotation.id === 'second');

    expect(inactiveSecond?.railSide).toBe('right');
    expect(activeSecond?.railSide).toBe('right');
  });

  it('keeps tall rail cards inside a bounded viewport', () => {
    const items = buildAnnotationRailItems(
      [annotation('long-note', { anchor: anchor('long', 0, 10) })],
      [box('long-note', { top: 560 })],
      'long-note',
      { 'long-note': 360 },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'left',
        railWidth: 320,
        rightRailLeft: 980,
        viewportHeight: 620,
      },
    );

    expect(items[0]?.style.top).toBe(242);
  });

  it('compresses rail group gaps only when vertical space is cramped', () => {
    const annotations = [
      annotation('first', { anchor: anchor('first', 0, 10) }),
      annotation('second', { anchor: anchor('second', 20, 30) }),
      annotation('third', { anchor: anchor('third', 40, 50) }),
    ];
    const boxes = [
      box('first', { top: 100 }),
      box('second', { top: 230 }),
      box('third', { top: 360 }),
    ];
    const railLayout = {
      articleCenterX: 500,
      leftRailLeft: 24,
      mode: 'right' as const,
      railWidth: 320,
      rightRailLeft: 980,
    };
    const noteHeights = { first: 100, second: 100, third: 100 };

    const roomyItems = buildAnnotationRailItems(annotations, boxes, null, noteHeights, railLayout);
    const crampedItems = buildAnnotationRailItems(annotations, boxes, null, noteHeights, {
      ...railLayout,
      viewportHeight: 330,
    });

    const roomyGap = Number(roomyItems[1]?.style.top) - Number(roomyItems[0]?.style.top) - 100;
    const crampedGap =
      Number(crampedItems[1]?.style.top) - Number(crampedItems[0]?.style.top) - 100;

    expect(roomyGap).toBe(30);
    expect(crampedGap).toBe(10);
  });

  it('stacks nearby rail groups before pushing cards away from the highlighted text', () => {
    const annotations = [
      annotation('first', { anchor: anchor('first', 0, 10) }),
      annotation('second', { anchor: anchor('second', 20, 30) }),
      annotation('third', { anchor: anchor('third', 40, 50) }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [box('first', { top: 100 }), box('second', { top: 180 }), box('third', { top: 258 })],
      null,
      { first: 100, second: 100, third: 100 },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'right',
        railWidth: 320,
        rightRailLeft: 980,
      },
    );

    expect(
      items.map((item) => [
        item.annotation.id,
        item.stackCount,
        item.style.top,
        (item.style as Record<string, string>)['--stack-offset-y'],
      ]),
    ).toEqual([
      ['first', 3, 90, '0px'],
      ['second', 3, 90, '42px'],
      ['third', 3, 90, '84px'],
    ]);
  });

  it('compresses stacked rail card offsets when one group is taller than the viewport', () => {
    const annotations = [
      annotation('first', { anchor: anchor('first', 0, 10) }),
      annotation('second', { anchor: anchor('second', 5, 15) }),
      annotation('third', { anchor: anchor('third', 10, 20) }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [
        box('first', { top: 100, left: 120 }),
        box('second', { top: 104, left: 124 }),
        box('third', { top: 108, left: 128 }),
      ],
      null,
      { first: 140, second: 140, third: 140 },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'right',
        railWidth: 320,
        rightRailLeft: 980,
        viewportHeight: 210,
      },
    );
    const byId = new Map(items.map((item) => [item.annotation.id, item]));
    const secondStyle = byId.get('second')?.style as
      | { '--stack-offset'?: string; '--stack-offset-y'?: string }
      | undefined;
    const secondOffset = parseFloat(String(secondStyle?.['--stack-offset']));
    const secondOffsetY = parseFloat(String(secondStyle?.['--stack-offset-y']));

    expect(secondOffsetY).toBeLessThan(42);
    expect(secondOffsetY).toBeGreaterThanOrEqual(24);
    expect(secondOffset).toBeLessThan(14);
    expect(secondOffset).toBeGreaterThanOrEqual(8);
  });

  it('keeps visible scrolled rail cards inside the current viewport', () => {
    const viewportTop = 2050;
    const viewportHeight = 620;
    const annotations = [
      annotation('upper', { anchor: anchor('upper', 0, 10) }),
      annotation('middle', { anchor: anchor('middle', 20, 30) }),
      annotation('lower', { anchor: anchor('lower', 40, 50) }),
      annotation('far-below', { anchor: anchor('far below', 60, 70) }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [
        box('upper', { left: 120, top: 2140 }),
        box('middle', { left: 140, top: 2290 }),
        box('lower', { left: 130, top: 2460 }),
        box('far-below', { left: 120, top: 3600 }),
      ],
      null,
      { upper: 220, middle: 220, lower: 220, 'far-below': 220 },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'both',
        railWidth: 320,
        rightRailLeft: 980,
        viewportHeight,
        viewportTop,
      },
    );
    const byId = new Map(items.map((item) => [item.annotation.id, item]));
    const lowerTop = Number(byId.get('lower')?.style.top);
    const farBelowTop = Number(byId.get('far-below')?.style.top);

    expect(lowerTop).toBeGreaterThanOrEqual(viewportTop);
    expect(lowerTop + 220).toBeLessThanOrEqual(viewportTop + viewportHeight);
    expect(farBelowTop).toBe(3590);
  });

  it('does not pull cards into the viewport after their highlight leaves overscan', () => {
    const items = buildAnnotationRailItems(
      [annotation('above', { anchor: anchor('above', 0, 10) })],
      [box('above', { top: 1013, height: 22 })],
      null,
      { above: 220 },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'right',
        railWidth: 320,
        rightRailLeft: 980,
        viewportHeight: 754,
        viewportTop: 1212,
      },
    );

    expect(items[0]?.style.top).toBe(1003);
  });

  it('does not merge offscreen rail pressure stacks into visible stacks', () => {
    const annotations = [
      annotation('old-active', { anchor: anchor('old active', 0, 10) }),
      annotation('old-second', { anchor: anchor('old second', 20, 30) }),
      annotation('old-third', { anchor: anchor('old third', 40, 50) }),
      annotation('old-fourth', { anchor: anchor('old fourth', 60, 70) }),
      annotation('old-fifth', { anchor: anchor('old fifth', 80, 90) }),
      annotation('near-first', { anchor: anchor('near first', 100, 110) }),
      annotation('visible-first', { anchor: anchor('visible first', 120, 130) }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [
        box('old-active', { top: 307, height: 23 }),
        box('old-second', { top: 307, height: 23 }),
        box('old-third', { top: 307, height: 23 }),
        box('old-fourth', { top: 353, height: 67 }),
        box('old-fifth', { top: 443, height: 51 }),
        box('near-first', { top: 574, height: 125 }),
        box('visible-first', { top: 750, height: 22 }),
      ],
      'old-active',
      {
        'old-active': 160,
        'old-second': 160,
        'old-third': 160,
        'old-fourth': 160,
        'old-fifth': 160,
        'near-first': 160,
        'visible-first': 160,
      },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'right',
        railWidth: 320,
        rightRailLeft: 980,
        viewportHeight: 754,
        viewportTop: 726,
      },
    );
    const byId = new Map(items.map((item) => [item.annotation.id, item]));

    expect(byId.get('old-active')?.style.top).toBe(297);
    expect(byId.get('old-active')?.stackCount).toBe(5);
    expect(byId.get('near-first')?.stackCount).toBe(2);
  });

  it('anchors the active rail card near its highlight under same-side pressure', () => {
    const viewportTop = 1600;
    const viewportHeight = 760;
    const annotations = [
      annotation('right-above', { anchor: anchor('right above', 0, 10) }),
      annotation('active-right', { anchor: anchor('active right', 40, 50) }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [
        box('right-above', { left: 560, top: 1310, width: 220 }),
        box('active-right', { left: 520, top: 2060, width: 220 }),
      ],
      'active-right',
      { 'right-above': 600, 'active-right': 250 },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'right',
        railWidth: 320,
        rightRailLeft: 980,
        viewportHeight,
        viewportTop,
      },
    );
    const byId = new Map(items.map((item) => [item.annotation.id, item]));
    const activeTop = Number(byId.get('active-right')?.style.top);
    const aboveTop = Number(byId.get('right-above')?.style.top);

    expect(activeTop).toBe(2050);
    expect(activeTop + 250).toBeLessThanOrEqual(viewportTop + viewportHeight);
    expect(aboveTop + 600).toBeLessThanOrEqual(activeTop - 18);
  });

  it('anchors the active stacked card to its own highlight', () => {
    const annotations = [
      annotation('right-above', { anchor: anchor('right above', 0, 10) }),
      annotation('active-right', { anchor: anchor('active right', 40, 50) }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [
        box('right-above', { left: 560, top: 1610, width: 220 }),
        box('active-right', { left: 520, top: 1850, width: 220 }),
      ],
      'active-right',
      { 'right-above': 300, 'active-right': 250 },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'right',
        railWidth: 320,
        rightRailLeft: 980,
        viewportHeight: 760,
        viewportTop: 1600,
      },
    );
    const byId = new Map(items.map((item) => [item.annotation.id, item]));

    expect(byId.get('active-right')?.stackCount).toBe(2);
    expect(byId.get('active-right')?.stackIndex).toBe(0);
    expect(byId.get('active-right')?.style.top).toBe(1840);
  });

  it('keeps the active stacked rail card close to its highlight in the viewport', () => {
    const viewportTop = 0;
    const viewportHeight = 760;
    const annotations = [
      annotation('upper', { anchor: anchor('upper', 0, 10) }),
      annotation('middle', { anchor: anchor('middle', 20, 30) }),
      annotation('lower', { anchor: anchor('lower', 40, 50) }),
    ];
    const items = buildAnnotationRailItems(
      annotations,
      [
        box('upper', { left: 120, top: 80, width: 220 }),
        box('middle', { left: 540, top: 300, width: 220 }),
        box('lower', { left: 560, top: 520, width: 220 }),
      ],
      'lower',
      { upper: 220, middle: 220, lower: 220 },
      {
        articleCenterX: 500,
        leftRailLeft: 24,
        mode: 'both',
        railWidth: 320,
        rightRailLeft: 980,
        viewportHeight,
        viewportTop,
      },
    );
    const byId = new Map(items.map((item) => [item.annotation.id, item]));

    expect(byId.get('upper')?.style.top).toBe(70);
    expect(byId.get('middle')?.stackCount).toBe(2);
    expect(byId.get('middle')?.stackIndex).toBe(1);
    expect(byId.get('lower')?.stackCount).toBe(2);
    expect(byId.get('lower')?.stackIndex).toBe(0);
    expect(byId.get('lower')?.style.top).toBe(510);
  });

  it('resolves navigation around an explicit reference annotation', () => {
    const annotations = [annotation('first'), annotation('second'), annotation('third')];

    expect(annotationNavigationForReferenceIndex(annotations, 1)).toEqual({
      currentIndex: 2,
      previousId: 'first',
      nextId: 'third',
      totalCount: 3,
    });
    expect(annotationNavigationForReferenceIndex(annotations, 0)).toEqual({
      currentIndex: 1,
      previousId: null,
      nextId: 'second',
      totalCount: 3,
    });
    expect(annotationNavigationForReferenceIndex(annotations, 2)).toEqual({
      currentIndex: 3,
      previousId: 'second',
      nextId: null,
      totalCount: 3,
    });
  });

  it('resolves navigation around a viewport insertion point', () => {
    const annotations = [annotation('first'), annotation('second'), annotation('third')];

    expect(annotationNavigationForInsertionIndex(annotations, 0)).toEqual({
      currentIndex: 1,
      previousId: null,
      nextId: 'first',
      totalCount: 3,
    });
    expect(annotationNavigationForInsertionIndex(annotations, 2)).toEqual({
      currentIndex: 3,
      previousId: 'second',
      nextId: 'third',
      totalCount: 3,
    });
    expect(annotationNavigationForInsertionIndex(annotations, 3)).toEqual({
      currentIndex: 3,
      previousId: 'third',
      nextId: null,
      totalCount: 3,
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
