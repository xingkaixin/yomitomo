import { describe, expect, it } from 'vitest';
import { buildAnnotationRailItems } from './reader-annotations';
import { annotationNavigationForInsertionIndex } from '../reader-navigation';
import { selectionActionShortcut } from '../reader-shortcuts';
import type { Annotation, UserProfile } from '@yomitomo/shared';
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

describe('selection action shortcuts', () => {
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
      author: {
        kind: 'user',
        userId: userProfile.id,
        username: userProfile.username,
        nickname: userProfile.nickname,
      },
      annotationType: 'key_point',
      color: '#f4c95d',
      comments: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

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
      { 'right-above': 300, 'active-right': 200 },
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
