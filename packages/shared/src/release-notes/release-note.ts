import type { ReleaseNoteHighlight, UserFacingReleaseNote } from './release-note-types';

export type ReleaseNoteScene = 'before-update' | 'after-update';

function parseVersion(value: string): number[] | null {
  const core = value.trim().split('-')[0].split('+')[0];
  if (!core) return null;
  const parts = core.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part))) return null;
  return parts;
}

// 比较语义版本：a < b 返回 -1，a > b 返回 1，相等或无法解析返回 0。
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const da = left[index] ?? 0;
    const db = right[index] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

// 更新后是否展示「已更新」弹窗：仅当上次运行版本存在且低于当前版本时展示。
// 全新安装（无 lastSeenVersion）、同版本重启、版本回退都不展示。
export function shouldShowAfterUpdate(
  lastSeenVersion: string | undefined,
  currentVersion: string,
): boolean {
  if (!lastSeenVersion) return false;
  return compareVersions(lastSeenVersion, currentVersion) < 0;
}

// 按场景挑选 highlights：更新前（决策导向）过滤掉 fixed 并截断；更新后展示完整列表。
export function selectHighlights(
  note: UserFacingReleaseNote,
  scene: ReleaseNoteScene,
): ReleaseNoteHighlight[] {
  if (scene === 'before-update') {
    return note.highlights.filter((highlight) => highlight.type !== 'fixed').slice(0, 4);
  }
  return note.highlights;
}
