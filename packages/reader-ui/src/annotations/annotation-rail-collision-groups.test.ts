import { describe, expect, it } from 'vitest';
import { buildRectCollisionGroups, type CollisionRect } from './annotation-rail-collision-groups';

type Item = {
  id: string;
  rect: CollisionRect | null;
};

describe('buildRectCollisionGroups', () => {
  it('preserves strict 2D overlap, transitive components, and rectless singles', () => {
    const items: Item[] = [
      item('rectless', null),
      item('first', rect(0, 0, 20, 20)),
      item('bridge', rect(10, 10, 30, 30)),
      item('third', rect(20, 20, 40, 40)),
      item('touching-edge', rect(40, 20, 60, 40)),
      item('same-top-separate-x', rect(100, 20, 120, 40)),
    ];

    expect(groupIds(buildRectCollisionGroups(items, (value) => value.rect))).toEqual([
      ['rectless'],
      ['first', 'bridge', 'third'],
      ['touching-edge'],
      ['same-top-separate-x'],
    ]);
  });
});

function item(id: string, value: CollisionRect | null): Item {
  return { id, rect: value };
}

function rect(left: number, top: number, right: number, bottom: number): CollisionRect {
  return { left, top, right, bottom };
}

function groupIds(groups: Item[][]) {
  return groups.map((group) => group.map((value) => value.id));
}
