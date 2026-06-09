/**
 * Build a hand-drawn style annotation connection SVG path.
 * The path weaves between start and end points with sinusoidal perturbation,
 * then passes through Catmull-Rom–style smoothing.
 *
 * Ported from apps/desktop/src/renderer/src/source/bookcase/app-source-bookcase-shared.ts
 */

function formatPathNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function smoothPathThroughPoints(points: Array<{ x: number; y: number }>) {
  const first = points[0];
  let path = `M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[Math.min(points.length - 1, index + 2)];
    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = current.y + (next.y - previous.y) / 6;
    const control2X = next.x - (afterNext.x - current.x) / 6;
    const control2Y = next.y - (afterNext.y - current.y) / 6;

    path += ` C ${formatPathNumber(control1X)} ${formatPathNumber(control1Y)}, ${formatPathNumber(control2X)} ${formatPathNumber(control2Y)}, ${formatPathNumber(next.x)} ${formatPathNumber(next.y)}`;
  }

  return path;
}

export function buildAnnotationConnectionPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 1) {
    return `M ${formatPathNumber(startX)} ${formatPathNumber(startY)} L ${formatPathNumber(endX)} ${formatPathNumber(endY)}`;
  }

  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const segmentCount = Math.max(3, Math.min(6, Math.round(length / 74)));
  const amplitude = Math.min(18, Math.max(7, length * 0.035));
  const points = Array.from({ length: segmentCount + 1 }, (_, index) => {
    const progress = index / segmentCount;
    const endpoint = index === 0 || index === segmentCount;
    const direction = index % 2 === 0 ? -1 : 1;
    const offset = endpoint ? 0 : Math.sin(Math.PI * progress) * amplitude * direction;
    return {
      x: startX + deltaX * progress + normalX * offset,
      y: startY + deltaY * progress + normalY * offset,
    };
  });

  return smoothPathThroughPoints(points);
}
