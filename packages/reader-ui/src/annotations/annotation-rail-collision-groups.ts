export type CollisionRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

type RectItem<T> = {
  item: T;
  inputIndex: number;
  rect: CollisionRect;
};

export function buildRectCollisionGroups<T>(
  items: readonly T[],
  rectFor: (item: T) => CollisionRect | null,
) {
  const groups: T[][] = [];
  const withRect: Array<RectItem<T>> = [];

  items.forEach((item, inputIndex) => {
    const rect = rectFor(item);
    if (rect) withRect.push({ item, inputIndex, rect });
    else groups.push([item]);
  });

  const ordered = withRect.toSorted(
    (left, right) => left.rect.top - right.rect.top || left.inputIndex - right.inputIndex,
  );
  const parent = ordered.map((_, index) => index);
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
  const union = (leftIndex: number, rightIndex: number) => {
    const leftRoot = find(leftIndex);
    const rightRoot = find(rightIndex);
    if (leftRoot === rightRoot) return;
    parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  const activeIndexes: number[] = [];

  ordered.forEach((current, currentIndex) => {
    let activeCount = 0;
    for (const candidateIndex of activeIndexes) {
      const candidate = ordered[candidateIndex];
      if (candidate.rect.bottom <= current.rect.top) continue;
      activeIndexes[activeCount] = candidateIndex;
      activeCount += 1;
      if (rectsOverlap(candidate.rect, current.rect)) union(candidateIndex, currentIndex);
    }
    activeIndexes.length = activeCount;
    activeIndexes.push(currentIndex);
  });

  const componentByRoot = new Map<number, T[]>();
  ordered.forEach(({ item }, index) => {
    const root = find(index);
    const component = componentByRoot.get(root);
    if (component) component.push(item);
    else componentByRoot.set(root, [item]);
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
