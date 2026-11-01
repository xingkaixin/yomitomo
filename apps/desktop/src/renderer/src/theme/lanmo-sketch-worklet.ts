type PaintSize = { width: number; height: number };
type PaintProperties = { get(name: string): { toString(): string } | null };
type Corners = [topLeft: number, topRight: number, bottomRight: number, bottomLeft: number];
type PerimeterPoint = [x: number, y: number, normalX: number, normalY: number];
type Random = () => number;

declare function registerPaint(
  name: string,
  painter: new () => {
    paint(context: CanvasRenderingContext2D, size: PaintSize, properties: PaintProperties): void;
  },
): void;

const cornerProperties = [
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
];

function createRandom(seed: number): Random {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function perimeter(width: number, height: number, inset: number, corners: Corners) {
  const left = inset;
  const top = inset;
  const right = width - inset;
  const bottom = height - inset;
  const limit = Math.min(right - left, bottom - top) / 2;
  const [topLeft, topRight, bottomRight, bottomLeft] = corners.map((radius) =>
    Math.max(0, Math.min(radius, limit)),
  ) as Corners;
  const points: PerimeterPoint[] = [];

  function side(ax: number, ay: number, bx: number, by: number, nx: number, ny: number) {
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 14));
    for (let index = 0; index < steps; index++) {
      const t = index / steps;
      points.push([ax + (bx - ax) * t, ay + (by - ay) * t, nx, ny]);
    }
  }

  function corner(cx: number, cy: number, radius: number, startAngle: number) {
    const steps = Math.max(2, Math.ceil(radius / 5));
    for (let index = 0; index < steps; index++) {
      const angle = startAngle + (Math.PI / 2) * (index / steps);
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      points.push([cx + nx * radius, cy + ny * radius, nx, ny]);
    }
  }

  side(left + topLeft, top, right - topRight, top, 0, -1);
  corner(right - topRight, top + topRight, topRight, -Math.PI / 2);
  side(right, top + topRight, right, bottom - bottomRight, 1, 0);
  corner(right - bottomRight, bottom - bottomRight, bottomRight, 0);
  side(right - bottomRight, bottom, left + bottomLeft, bottom, 0, 1);
  corner(left + bottomLeft, bottom - bottomLeft, bottomLeft, Math.PI / 2);
  side(left, bottom - bottomLeft, left, top + topLeft, -1, 0);
  corner(left + topLeft, top + topLeft, topLeft, Math.PI);
  return points;
}

function traceSmooth(context: CanvasRenderingContext2D, points: [number, number][]) {
  if (points.length < 2) return;
  context.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length - 1; index++) {
    const [x, y] = points[index];
    const [nextX, nextY] = points[index + 1];
    context.quadraticCurveTo(x, y, (x + nextX) / 2, (y + nextY) / 2);
  }
  const [lastX, lastY] = points[points.length - 1];
  context.lineTo(lastX, lastY);
}

// One pencil pass: starts at a random point, wobbles as a low-frequency random walk, overshoots
// its own start and sometimes lifts off the paper once.
function tracePencilPass(
  context: CanvasRenderingContext2D,
  random: Random,
  base: PerimeterPoint[],
  amplitude: number,
) {
  const start = Math.floor(random() * base.length);
  const overshoot = 2 + Math.floor(random() * 2);
  let offset = (random() - 0.5) * amplitude;
  const points: [number, number][] = [];
  for (let index = 0; index <= base.length + overshoot; index++) {
    offset = offset * 0.55 + (random() - 0.5) * 2 * amplitude * 0.45;
    const [x, y, nx, ny] = base[(start + index) % base.length];
    points.push([x + nx * offset, y + ny * offset]);
  }
  if (random() < 0.2 && points.length > 8) {
    const lift = 3 + Math.floor(random() * (points.length - 7));
    traceSmooth(context, points.slice(0, lift + 1));
    traceSmooth(context, points.slice(lift + 1));
    return;
  }
  traceSmooth(context, points);
}

function tracePencilRule(
  context: CanvasRenderingContext2D,
  random: Random,
  [x1, y1, x2, y2]: [number, number, number, number],
  amplitude: number,
) {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const steps = Math.max(2, Math.round(length / 18));
  const unitX = (x2 - x1) / length;
  const unitY = (y2 - y1) / length;
  const bow = (random() - 0.5) * amplitude * 1.6;
  let offset = 0;
  const points: [number, number][] = [];
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    offset = offset * 0.5 + (random() - 0.5) * amplitude;
    const shift = offset + Math.sin(Math.PI * t) * bow;
    points.push([x1 + (x2 - x1) * t - unitY * shift, y1 + (y2 - y1) * t + unitX * shift]);
  }
  traceSmooth(context, points);
}

function edgeRule(edge: string, { width, height }: PaintSize, inset: number) {
  switch (edge) {
    case 'top':
      return [0, inset, width, inset] as [number, number, number, number];
    case 'right':
      return [width - inset, 0, width - inset, height] as [number, number, number, number];
    case 'bottom':
      return [0, height - inset, width, height - inset] as [number, number, number, number];
    default:
      return null;
  }
}

function paintWash(
  context: CanvasRenderingContext2D,
  random: Random,
  size: PaintSize,
  corners: Corners,
  color: string,
  opacity: number,
) {
  const { width, height } = size;
  context.save();
  context.beginPath();
  context.roundRect(2, 2, width - 4, height - 4, corners);
  context.clip();
  context.fillStyle = color;
  context.globalAlpha = opacity * 0.22;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = color;
  context.lineCap = 'round';
  for (let line = 3.2 * random(); line < width + height; line += 3.2 * (0.7 + random() * 0.6)) {
    context.globalAlpha = opacity * (0.4 + random() * 0.6);
    context.lineWidth = 1 + random() * 1.2;
    context.beginPath();
    context.moveTo(Math.max(0, line - height), Math.min(line, height));
    context.lineTo(Math.min(line, width), Math.max(0, line - width));
    context.stroke();
  }
  context.restore();
}

registerPaint(
  'lanmo-sketch',
  class {
    static get inputProperties() {
      return [
        '--sketch-stroke',
        '--sketch-width',
        '--sketch-edge',
        '--sketch-wash',
        '--sketch-wash-opacity',
        ...cornerProperties,
      ];
    }

    paint(context: CanvasRenderingContext2D, size: PaintSize, properties: PaintProperties) {
      const read = (name: string) => properties.get(name)?.toString().trim() ?? '';
      const corners = cornerProperties.map((name) => parseFloat(read(name)) || 0) as Corners;
      // CSS cannot hand out a per-element seed, so same-sized elements share one drawing.
      const random = createRandom(Math.round(size.width) * 8191 + Math.round(size.height));

      const wash = read('--sketch-wash');
      const washOpacity = Number(read('--sketch-wash-opacity'));
      if (wash && washOpacity > 0) paintWash(context, random, size, corners, wash, washOpacity);

      const stroke = read('--sketch-stroke');
      if (!stroke) return;
      const width = Number(read('--sketch-width')) || 1.6;
      const inset = width / 2 + 1.6;
      const rule = edgeRule(read('--sketch-edge'), size, inset);
      const base = perimeter(size.width, size.height, inset, corners);
      context.strokeStyle = stroke;
      context.lineCap = 'round';
      context.lineJoin = 'round';

      for (const [lineWidth, alpha, amplitude] of [
        [width, 0.95, 1],
        [width * 0.56, 0.55, 1.4],
      ]) {
        context.lineWidth = lineWidth;
        context.globalAlpha = alpha;
        context.beginPath();
        if (rule) tracePencilRule(context, random, rule, amplitude);
        else tracePencilPass(context, random, base, amplitude);
        context.stroke();
      }
    }
  },
);
