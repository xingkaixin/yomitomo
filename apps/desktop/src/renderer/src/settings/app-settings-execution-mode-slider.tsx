import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { ShieldCheck, Zap } from 'lucide-react';
import type { AssistantExecutionMode } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';

export function AssistantExecutionModeSlider({
  value,
  onChange,
}: {
  value: AssistantExecutionMode;
  onChange: (value: AssistantExecutionMode) => void;
}) {
  const { t } = useTranslation();
  const valuePosition = value === 'deep_verification' ? 1 : 0;
  const [position, setPosition] = useState(valuePosition);
  const [dragging, setDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const positionRef = useRef(valuePosition);
  const deep = position >= 0.5;

  useParticleField(canvasRef, position > 0);

  useEffect(() => {
    if (dragging) return;
    positionRef.current = valuePosition;
    setPosition(valuePosition);
  }, [dragging, valuePosition]);

  function updatePosition(nextPosition: number) {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }

  function commitPosition() {
    const nextPosition = positionRef.current >= 0.5 ? 1 : 0;
    const nextMode: AssistantExecutionMode =
      nextPosition === 1 ? 'deep_verification' : 'fast_response';
    setDragging(false);
    updatePosition(nextPosition);
    if (nextMode !== value) onChange(nextMode);
  }

  function selectMode(nextMode: AssistantExecutionMode) {
    const nextPosition = nextMode === 'deep_verification' ? 1 : 0;
    updatePosition(nextPosition);
    if (nextMode !== value) onChange(nextMode);
  }

  return (
    <div className="assistant-mode-control">
      <div className="assistant-mode-current" aria-live="polite">
        {deep ? <ShieldCheck size={14} aria-hidden="true" /> : <Zap size={14} aria-hidden="true" />}
        <strong>
          {deep ? t('settings.models.deepVerification') : t('settings.models.fastResponse')}
        </strong>
        <span>
          {deep
            ? t('settings.models.deepVerificationDescription')
            : t('settings.models.fastResponseDescription')}
        </span>
      </div>
      <div
        className="assistant-mode-slider"
        data-dragging={dragging ? 'true' : undefined}
        data-mode={deep ? 'deep' : 'fast'}
        style={{ '--assistant-mode-progress': position } as CSSProperties}
      >
        <canvas ref={canvasRef} className="assistant-mode-slider-particles" aria-hidden="true" />
        <span className="assistant-mode-slider-thumb" aria-hidden="true" />
        <input
          aria-label={t('settings.models.executionModeAria')}
          aria-valuetext={
            deep ? t('settings.models.deepVerification') : t('settings.models.fastResponse')
          }
          max={1}
          min={0}
          step={0.01}
          type="range"
          value={position}
          onBlur={commitPosition}
          onChange={(event) => updatePosition(Number(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'Home') {
              event.preventDefault();
              selectMode('fast_response');
            }
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'End') {
              event.preventDefault();
              selectMode('deep_verification');
            }
          }}
          onPointerCancel={commitPosition}
          onPointerDown={() => setDragging(true)}
          onPointerUp={commitPosition}
        />
      </div>
    </div>
  );
}

function useParticleField(canvasRef: RefObject<HTMLCanvasElement | null>, active: boolean) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof CanvasRenderingContext2D === 'undefined') return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const particleCanvas = canvas;
    const particleContext = context;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let startedAt = performance.now();

    function resize() {
      const rect = particleCanvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      particleCanvas.width = Math.round(rect.width * ratio);
      particleCanvas.height = Math.round(rect.height * ratio);
      draw(performance.now());
    }

    function draw(time: number) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = particleCanvas.width / ratio;
      const height = particleCanvas.height / ratio;
      particleContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      particleContext.clearRect(0, 0, width, height);
      if (!active || !width || !height) return;

      const styles = getComputedStyle(particleCanvas);
      const particleColor = styles.color;
      const highlightColor = styles.borderColor;
      const elapsed = reducedMotion.matches ? 0 : time - startedAt;
      const cell = 5;
      const columns = Math.ceil(width / cell);
      const rows = Math.ceil(height / cell);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const hash = fractional(Math.sin(column * 12.9898 + row * 78.233) * 43758.5453);
          const phase = fractional(Math.sin(column * 7.13 + row * 19.41) * 19341.731);
          const pulse = 0.5 + 0.5 * Math.sin(elapsed * (0.0012 + phase * 0.0018) + phase * 8);
          const depth = column / columns;
          const visibility =
            (0.28 + smoothstep(0, 0.72, depth) * 0.72) * (0.16 + hash * 0.38 + pulse * 0.34);
          if (visibility < 0.18) continue;

          particleContext.globalAlpha = Math.min(0.78, visibility);
          particleContext.fillStyle = pulse > 0.88 && hash > 0.62 ? highlightColor : particleColor;
          particleContext.fillRect(column * cell + 0.7, row * cell + 0.7, cell - 1.4, cell - 1.4);
        }
      }
      particleContext.globalAlpha = 1;
    }

    function animate(time: number) {
      draw(time);
      if (active && !reducedMotion.matches) frame = requestAnimationFrame(animate);
    }

    function restart() {
      cancelAnimationFrame(frame);
      startedAt = performance.now();
      draw(startedAt);
      if (active && !reducedMotion.matches) frame = requestAnimationFrame(animate);
    }

    const resizeObserver = new ResizeObserver(resize);
    const themeObserver = new MutationObserver(restart);
    resizeObserver.observe(particleCanvas);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-tone'],
    });
    reducedMotion.addEventListener('change', restart);
    resize();
    restart();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      reducedMotion.removeEventListener('change', restart);
    };
  }, [active, canvasRef]);
}

function fractional(value: number) {
  return Math.abs(value) % 1;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return progress * progress * (3 - 2 * progress);
}
