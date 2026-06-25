import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

const librarySearchClearGlowStops = [
  [0, 0.8, 7, 0.22],
  [0.45, 0.55, 8, 0.18],
  [-0.4, 0.65, 6, 0.16],
  [0.15, 0.9, 5, 0.14],
] as const;

export function textForLibrarySearchMirror(value: string) {
  return value.replace(/ /g, '\u00a0');
}

export function useLibrarySearchClearDissolve({
  inputRef,
  onQueryChange,
  query,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const canvasRef = useRef<CanvasRenderingContext2D | null>(null);
  const [clearingText, setClearingText] = useState('');
  const [clearing, setClearing] = useState(false);
  const mirrorText = textForLibrarySearchMirror(clearing ? clearingText : query);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    if (clearing && query.length > 0) finishClearAnimation(false);
  }, [clearing, query]);

  function clearInlineMotionStyles() {
    wrapRef.current?.removeAttribute('data-clear-tone');
    mirrorRef.current?.removeAttribute('style');
    placeholderRef.current?.removeAttribute('style');
    if (glowRef.current) {
      glowRef.current.style.opacity = '0';
      glowRef.current.style.background = '';
    }
  }

  function focusInput() {
    if (typeof requestAnimationFrame !== 'function') {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }

    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function finishClearAnimation(refocus: boolean) {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    clearInlineMotionStyles();
    setClearing(false);
    setClearingText('');
    if (refocus) focusInput();
  }

  function preserveFocus(event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) {
    if (document.activeElement === inputRef.current) event.preventDefault();
  }

  function clearWithDissolve() {
    if (!query || clearing) return;

    if (prefersReducedClearMotion() || typeof requestAnimationFrame !== 'function') {
      onQueryChange('');
      focusInput();
      return;
    }

    const elements = readClearElements({ glowRef, inputRef, mirrorRef, placeholderRef, wrapRef });
    if (!elements) {
      onQueryChange('');
      focusInput();
      return;
    }

    const isDark = isDarkClearSurface(elements.wrap);
    elements.wrap.dataset.clearTone = isDark ? 'dark' : 'light';
    const motion = readClearMotion(getComputedStyle(elements.wrap));

    canvasRef.current ??= createLibrarySearchClearCanvasContext();
    setClearingText(query);
    setClearing(true);
    onQueryChange('');

    elements.mirror.textContent = textForLibrarySearchMirror(query);
    elements.glow.style.background = buildLibrarySearchClearGlow({
      canvas: canvasRef.current,
      input: elements.input,
      isDark,
      text: query,
      wrap: elements.wrap,
    });
    elements.glow.style.opacity = '0';
    elements.placeholder.style.transform = `translateY(-${motion.inFly}px)`;
    elements.placeholder.style.opacity = '0.9';
    elements.placeholder.style.filter = `blur(${motion.blur}px)`;

    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const outProgress = motion.easeOut(Math.min(1, elapsed / motion.outDuration));
      const inProgress = motion.easeIn(Math.min(1, elapsed / motion.inDuration));
      let glowEnvelope = 0;

      elements.mirror.style.transform = `translateY(${(outProgress * motion.outFly).toFixed(1)}px)`;
      elements.mirror.style.opacity = (1 - outProgress).toFixed(3);
      elements.mirror.style.filter = `blur(${(outProgress * motion.blur).toFixed(1)}px)`;

      elements.placeholder.style.transform = `translateY(${(-motion.inFly + inProgress * motion.inFly).toFixed(1)}px)`;
      elements.placeholder.style.opacity = (0.9 + inProgress * 0.1).toFixed(3);
      elements.placeholder.style.filter = `blur(${(motion.blur - inProgress * motion.blur).toFixed(1)}px)`;

      if (elapsed > motion.glowDelay) {
        const glowProgress = Math.min(
          1,
          (elapsed - motion.glowDelay) / Math.max(1, motion.totalDuration - motion.glowDelay),
        );
        glowEnvelope =
          glowProgress < motion.glowPeakAt
            ? glowProgress / motion.glowPeakAt
            : 1 - (glowProgress - motion.glowPeakAt) / (1 - motion.glowPeakAt);
      }
      elements.glow.style.opacity = (glowEnvelope * motion.glowOpacity).toFixed(3);

      if (elapsed < motion.totalDuration) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      frameRef.current = null;
      finishClearAnimation(true);
    };

    frameRef.current = requestAnimationFrame(tick);
  }

  return {
    clearing,
    clearWithDissolve,
    glowRef,
    mirrorRef,
    mirrorText,
    placeholderRef,
    preserveFocus,
    wrapRef,
  };
}

function readClearElements({
  glowRef,
  inputRef,
  mirrorRef,
  placeholderRef,
  wrapRef,
}: {
  glowRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  mirrorRef: RefObject<HTMLDivElement | null>;
  placeholderRef: RefObject<HTMLDivElement | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
}) {
  const glow = glowRef.current;
  const input = inputRef.current;
  const mirror = mirrorRef.current;
  const placeholder = placeholderRef.current;
  const wrap = wrapRef.current;

  if (!glow || !input || !mirror || !placeholder || !wrap) return null;
  return { glow, input, mirror, placeholder, wrap };
}

function readClearMotion(styles: CSSStyleDeclaration) {
  return {
    blur: readClearNumber(styles, '--clear-blur', 2),
    easeIn: clearBezier(styles.getPropertyValue('--clear-in-ease')),
    easeOut: clearBezier(styles.getPropertyValue('--clear-out-ease')),
    glowDelay: readClearNumber(styles, '--glow-delay', 50),
    glowOpacity: readClearNumber(styles, '--glow-opacity', 0.42),
    glowPeakAt: readClearNumber(styles, '--glow-peak-at', 0.15),
    inDuration: readClearNumber(styles, '--clear-in-dur', 400),
    inFly: readClearNumber(styles, '--clear-in-fly', 12),
    outDuration: readClearNumber(styles, '--clear-out-dur', 400),
    outFly: readClearNumber(styles, '--clear-out-fly', 12),
    totalDuration: readClearNumber(styles, '--clear-dur', 1000),
  };
}

function readClearNumber(styles: CSSStyleDeclaration, name: string, fallback: number) {
  const value = parseFloat(styles.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function clearBezier(value: string) {
  const match = value.match(
    /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/,
  );
  if (!match) return (time: number) => time;

  const [x1, y1, x2, y2] = match.slice(1).map(parseFloat);
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  return (time: number) => {
    if (time <= 0) return 0;
    if (time >= 1) return 1;

    let sample = time;
    for (let index = 0; index < 8; index += 1) {
      const distance = ((ax * sample + bx) * sample + cx) * sample - time;
      const derivative = (3 * ax * sample + 2 * bx) * sample + cx;
      if (Math.abs(distance) < 0.000001 || derivative === 0) break;
      sample -= distance / derivative;
    }

    return ((ay * sample + by) * sample + cy) * sample;
  };
}

function createLibrarySearchClearCanvasContext() {
  if (navigator.userAgent.toLowerCase().includes('jsdom')) return null;

  try {
    return document.createElement('canvas').getContext('2d');
  } catch {
    return null;
  }
}

function prefersReducedClearMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function buildLibrarySearchClearGlow({
  canvas,
  input,
  isDark,
  text,
  wrap,
}: {
  canvas: CanvasRenderingContext2D | null;
  input: HTMLInputElement;
  isDark: boolean;
  text: string;
  wrap: HTMLDivElement;
}) {
  const inputStyles = getComputedStyle(input);
  const wrapStyles = getComputedStyle(wrap);
  const color = isDark ? '255,255,255' : '0,0,0';
  const width = wrap.clientWidth || 280;
  const spread = readClearNumber(wrapStyles, '--glow-spread', 1.5);
  const layers: string[] = [];
  let x = 0;

  if (canvas) canvas.font = inputStyles.font;

  text.split(/(\s+)/).forEach((segment) => {
    const segmentWidth = canvas?.measureText(segment).width ?? segment.length * 7;

    if (segment.trim()) {
      const centerX = x + segmentWidth / 2;
      const halfWidth = Math.max(segmentWidth * 0.45, 8) * spread;

      librarySearchClearGlowStops.forEach(([offset, radiusWidth, radiusHeight, alpha]) => {
        const layerX = (((centerX + halfWidth * offset) / width) * 100).toFixed(2);
        layers.push(
          `radial-gradient(ellipse ${Math.max(halfWidth * radiusWidth, 2).toFixed(1)}px ${radiusHeight}px at ${layerX}% 100%, rgba(${color},${alpha}), transparent)`,
        );
      });
    }

    x += segmentWidth;
  });

  return layers.join(', ');
}

function isDarkClearSurface(wrap: HTMLElement) {
  let current: HTMLElement | null = wrap;

  while (current) {
    const color = parseCssColor(getComputedStyle(current).backgroundColor);
    if (color && color.alpha > 0.02) return relativeLuminance(color) < 0.35;
    current = current.parentElement;
  }

  const bodyColor = parseCssColor(getComputedStyle(document.body).backgroundColor);
  return bodyColor ? relativeLuminance(bodyColor) < 0.35 : false;
}

function parseCssColor(value: string) {
  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .replace(/\//g, ' ')
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return { red: parts[0], green: parts[1], blue: parts[2], alpha: parts[3] ?? 1 };
    }
  }

  const srgbMatch = value.match(/color\(\s*srgb\s+([^)]+)\)/i);
  if (srgbMatch) {
    const parts = srgbMatch[1].replace(/\//g, ' ').split(/\s+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return {
        red: parts[0] * 255,
        green: parts[1] * 255,
        blue: parts[2] * 255,
        alpha: parts[3] ?? 1,
      };
    }
  }

  return null;
}

function relativeLuminance({ blue, green, red }: { blue: number; green: number; red: number }) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
