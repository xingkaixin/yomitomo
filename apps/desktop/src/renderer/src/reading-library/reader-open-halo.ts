import type { CapturedRegion } from '../../../ipc-contract';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';

// 打开书后从纸面中心扩散一圈光环：截一张阅读区域的画面，在光环经过的那条带上弯折、色散、折射。
// 截图失败时只画色环。

const DURATION_MS = 1000;
const FADE_OUT_MS = 200;
const RING_WIDTH = 110;
const START_RADIUS = 20;
const CORNER_RADIUS = 12;
const MAX_PIXEL_RATIO = 2;
const RING_LIGHT = [232, 158, 104, 214, 96, 78, 226, 138, 150, 238, 192, 116];
const RING_DARK = [240, 150, 95, 232, 112, 86, 236, 160, 172, 246, 206, 138];
const INTERRUPTIONS = ['keydown', 'pointerdown', 'wheel', 'scroll', 'resize'] as const;

type Rect = { x: number; y: number; width: number; height: number };

type Halo = { canvas: HTMLCanvasElement; gl: WebGL2RenderingContext; frame: number };

let generation = 0;
let current: Halo | null = null;
let detachInterruptions: (() => void) | null = null;

export function playReaderOpenHalo(paperSelector: string) {
  stopReaderOpenHalo();
  const token = generation;
  // 截图之后页面一变，光环带里就会露出旧画面，所以有任何操作都提前收掉。
  const interrupt = () => fadeOutHalo(token);
  for (const type of INTERRUPTIONS) window.addEventListener(type, interrupt, true);
  detachInterruptions = () => {
    for (const type of INTERRUPTIONS) window.removeEventListener(type, interrupt, true);
  };
  void startHalo(token, paperSelector).catch(() => {
    if (token === generation) stopReaderOpenHalo();
  });
}

export function stopReaderOpenHalo() {
  generation++;
  detachInterruptions?.();
  detachInterruptions = null;
  if (!current) return;
  cancelAnimationFrame(current.frame);
  current.gl.getExtension('WEBGL_lose_context')?.loseContext();
  current.canvas.remove();
  current = null;
}

function fadeOutHalo(token: number) {
  if (token !== generation) return;
  const halo = current;
  if (!halo) return stopReaderOpenHalo();
  detachInterruptions?.();
  detachInterruptions = null;
  halo.canvas
    .animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_OUT_MS,
      easing: 'ease-out',
      fill: 'forwards',
    })
    .finished.then(() => {
      if (token === generation) stopReaderOpenHalo();
    }, noop);
}

async function startHalo(token: number, paperSelector: string) {
  // 过渡层刚移除，等合成器出一帧不带过渡层的画面再截图。
  await nextFrame();
  await nextFrame();
  if (token !== generation) return;
  const paper = document.querySelector<HTMLElement>(paperSelector);
  const area = paper?.closest<HTMLElement>('.reader-main');
  if (!paper || !area) return stopReaderOpenHalo();
  const rect = visibleRect(area.getBoundingClientRect());
  if (rect.width < 8 || rect.height < 8) return stopReaderOpenHalo();

  const capture = getOptionalDesktopApi()?.app?.captureRegion;
  const snapshot = capture ? await capture(rect).catch(() => null) : null;
  if (token !== generation) return;

  const paperRect = paper.getBoundingClientRect();
  const top = Math.max(paperRect.top, rect.y);
  const bottom = Math.min(paperRect.bottom, rect.y + rect.height);
  const center: [number, number] = [
    paperRect.left + paperRect.width / 2 - rect.x,
    (top + bottom) / 2 - rect.y,
  ];
  const dark = Boolean(paper.closest('.is-reader-background-dark'));
  current = createHalo(rect, center, snapshot, dark);
}

function createHalo(
  rect: Rect,
  center: [number, number],
  snapshot: CapturedRegion | null,
  dark: boolean,
): Halo | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'reader-open-halo';
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  Object.assign(canvas.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    // 只画色环时画布在暗纸上是黑底亮环，用 screen 叠上去。
    mixBlendMode: !snapshot && dark ? 'screen' : 'normal',
  });
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
  const program = gl && compileProgram(gl);
  if (!gl || !program) return null;
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  gl.viewport(0, 0, canvas.width, canvas.height);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  gl.uniform2f(uniform('uSize'), rect.width, rect.height);
  gl.uniform2f(uniform('uPx'), canvas.width, canvas.height);
  gl.uniform2f(uniform('uCenter'), ...center);
  gl.uniform1f(uniform('uW'), RING_WIDTH);
  gl.uniform1f(uniform('uCorner'), CORNER_RADIUS);
  gl.uniform1f(uniform('uDark'), dark ? 1 : 0);
  gl.uniform1f(uniform('uOverlay'), snapshot ? 0 : 1);
  gl.uniform3fv(
    uniform('uRingL'),
    RING_LIGHT.map((value) => value / 255),
  );
  gl.uniform3fv(
    uniform('uRingD'),
    RING_DARK.map((value) => value / 255),
  );
  if (snapshot) uploadSnapshot(gl, snapshot);
  gl.uniform1i(uniform('uSnap'), 0);

  const radiusUniform = uniform('uRadius');
  const strengthUniform = uniform('uStrength');
  const far = Math.max(
    ...[
      [0, 0],
      [rect.width, 0],
      [0, rect.height],
      [rect.width, rect.height],
    ].map(([x, y]) => Math.hypot(x - center[0], y - center[1])),
  );
  const growth = far + 40 - START_RADIUS;
  document.body.append(canvas);

  const halo: Halo = { canvas, gl, frame: 0 };
  const startedAt = performance.now();
  const draw = (now: number) => {
    const t = (now - startedAt) / DURATION_MS;
    if (t >= 1) return stopReaderOpenHalo();
    const progress = Math.max(0, t);
    gl.uniform1f(
      radiusUniform,
      START_RADIUS + (growth * (1 - 2 ** (-9 * progress))) / (1 - 2 ** -9),
    );
    gl.uniform1f(strengthUniform, Math.min(1, progress / 0.03) * (1 - progress ** 2.2));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    halo.frame = requestAnimationFrame(draw);
  };
  halo.frame = requestAnimationFrame(draw);
  return halo;
}

function uploadSnapshot(gl: WebGL2RenderingContext, snapshot: CapturedRegion) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    snapshot.width,
    snapshot.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    snapshot.pixels,
  );
}

function compileProgram(gl: WebGL2RenderingContext) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX_SHADER],
    [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}

function visibleRect(box: DOMRect): Rect {
  const left = Math.max(0, Math.ceil(box.left));
  const top = Math.max(0, Math.ceil(box.top));
  const right = Math.min(window.innerWidth, Math.floor(box.right));
  const bottom = Math.min(window.innerHeight, Math.floor(box.bottom));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function noop() {}

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// 截图是 BGRA 字节，按 RGBA 上传后在采样时交换 r 和 b。
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec2 uSize, uPx, uCenter;
uniform float uRadius, uStrength, uW, uCorner, uDark, uOverlay;
uniform vec3 uRingL[4], uRingD[4];
uniform sampler2D uSnap;
out vec4 o;

float edgeDist(vec2 p, out vec2 inward) {
  float hx = uSize.x * 0.5, sx = sign(p.x - hx);
  vec2 q = vec2(abs(p.x - hx) - (hx - uCorner), p.y - (uSize.y - uCorner));
  if (q.x > 0.0 && q.y > 0.0) {
    float l = length(q);
    inward = -vec2(sx * q.x, q.y) / max(l, 1e-4);
    return uCorner - l;
  }
  inward = q.x > q.y ? vec2(-sx, 0.0) : vec2(0.0, -1.0);
  return uCorner - max(q.x, q.y);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uPx.y - gl_FragCoord.y) * (uSize / uPx);
  vec2 d = p - uCenter;
  float dist = length(d);
  vec2 n = d / max(dist, 1e-4);
  float x = (dist - uRadius) / uW;

  vec4 wt = exp(-pow((vec4(x) - vec4(-1.5, -0.5, 0.5, 1.5)) / 0.8, vec4(2.0)));
  float ws = wt.x + wt.y + wt.z + wt.w;
  vec3 ringL = (wt.x * uRingL[0] + wt.y * uRingL[1] + wt.z * uRingL[2] + wt.w * uRingL[3]) / ws;
  vec3 ringD = (wt.x * uRingD[0] + wt.y * uRingD[1] + wt.z * uRingD[2] + wt.w * uRingD[3]) / ws;
  vec3 ring = mix(ringL, ringD, uDark);
  float env = uStrength * exp(-1.1 * (x * 0.5) * (x * 0.5));

  if (uOverlay > 0.5) {
    if (uDark > 0.5) {
      o = vec4(ringD * env * 0.45, 1.0);
    } else {
      float k = env * 0.24;
      o = vec4(ringL * k * 1.2, k);
    }
    return;
  }

  vec2 inward;
  float dB = edgeDist(p, inward);
  float dE = min(dB, p.y);
  float z = x * 0.75;
  float push = 7.0 * 2.33 * z * exp(-z * z) * uStrength * smoothstep(0.0, 56.0, dE);
  float bevel = dB < 60.0 ? 22.0 * pow(1.0 - dB / 60.0, 2.0) * env : 0.0;
  vec2 off = n * push - inward * bevel;

  vec2 uvG = (p - off) / uSize;
  vec2 uvR = (p - off * 1.08) / uSize;
  vec2 uvB = (p - off * 0.92) / uSize;
  vec3 base = vec3(texture(uSnap, uvR).b, texture(uSnap, uvG).g, texture(uSnap, uvB).r);

  float k = env * 0.24;
  vec3 light = mix(base, ringL, k) + ringL * k * 0.2;
  vec3 dark = 1.0 - (1.0 - base) * (1.0 - ringD * env * 0.45);
  vec3 col = mix(light, dark, uDark);
  float edgeLine = exp(-dB / 7.0) * env;
  col = mix(col, mix(ring, vec3(1.0), 0.45), clamp(edgeLine * mix(0.55, 0.75, uDark), 0.0, 1.0));

  // 只在弯折和折射起作用的那条带用截图，其余位置透明，露出实际页面；
  // 截图后页面还会变（悬停、面板进场），带子再宽就会露出新旧画面的分界。
  float m = smoothstep(5.0, 3.5, abs(x)) * smoothstep(0.0, 0.03, uStrength);
  o = vec4(clamp(col, 0.0, 1.0) * m, m);
}`;
