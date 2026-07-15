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

  it('matches the pairwise oracle for deterministic random rectangles', () => {
    const random = deterministicRandom(84_800);

    for (let sample = 0; sample < 100; sample += 1) {
      const items = Array.from({ length: 80 }, (_, index) => {
        if (random() < 0.1) return item(`${sample}-${index}`, null);
        const top = Math.floor(random() * 1_000);
        const left = Math.floor(random() * 600);
        return item(
          `${sample}-${index}`,
          rect(
            left,
            top,
            left + 1 + Math.floor(random() * 120),
            top + 1 + Math.floor(random() * 80),
          ),
        );
      });

      expect(normalizedGroupIds(buildRectCollisionGroups(items, (value) => value.rect))).toEqual(
        normalizedGroupIds(buildPairwiseOracleGroups(items)),
      );
    }
  });
});

function buildPairwiseOracleGroups(items: Item[]) {
  const groups: Item[][] = [];
  const withRect: Item[] = [];
  for (const value of items) {
    if (value.rect) withRect.push(value);
    else groups.push([value]);
  }

  const parent = withRect.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };

  for (let leftIndex = 0; leftIndex < withRect.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < withRect.length; rightIndex += 1) {
      const left = withRect[leftIndex].rect;
      const right = withRect[rightIndex].rect;
      if (left && right && rectsOverlap(left, right)) {
        parent[find(rightIndex)] = find(leftIndex);
      }
    }
  }

  const componentByRoot = new Map<number, Item[]>();
  withRect.forEach((value, index) => {
    const root = find(index);
    const component = componentByRoot.get(root);
    if (component) component.push(value);
    else componentByRoot.set(root, [value]);
  });
  return [...groups, ...componentByRoot.values()];
}

function rectsOverlap(left: CollisionRect, right: CollisionRect) {
  return (
    left.left < right.right &&
    right.left < left.right &&
    left.top < right.bottom &&
    right.top < left.bottom
  );
}

function item(id: string, value: CollisionRect | null): Item {
  return { id, rect: value };
}

function rect(left: number, top: number, right: number, bottom: number): CollisionRect {
  return { left, top, right, bottom };
}

function groupIds(groups: Item[][]) {
  return groups.map((group) => group.map((value) => value.id));
}

function normalizedGroupIds(groups: Item[][]) {
  return groups
    .map((group) => group.map((value) => value.id).toSorted())
    .toSorted((left, right) => left.join(',').localeCompare(right.join(',')));
}

function deterministicRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
