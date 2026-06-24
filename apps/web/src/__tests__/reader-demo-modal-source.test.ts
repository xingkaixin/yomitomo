import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../components/landing/ReaderDemo.tsx', import.meta.url),
  'utf8',
);

describe('reader demo modal source', () => {
  it('keeps discussion modal state explicit through close animation', () => {
    expect(source).toContain(
      "type DiscussionModalPhase = 'closed' | 'opening' | 'open' | 'closing'",
    );
    expect(source).toContain('const [phase, setPhase] = useState<DiscussionModalPhase>');
    expect(source).toContain('const [visibleAnnotation, setVisibleAnnotation]');
    expect(source).toContain("setPhase('opening')");
    expect(source).toContain("setPhase('closing')");
    expect(source).toContain("setPhase('closed')");
    expect(source).toContain("getCssDurationMs('--modal-close-dur', 150)");
    expect(source).toContain(
      "if (!mounted || !visibleAnnotation || phase === 'closed') return null",
    );
  });

  it('uses one close path with modal state and focus recovery', () => {
    expect(source).toContain('const requestClose = useCallback');
    expect(source).toContain('returnFocusTarget?.focus({ preventScroll: true })');
    expect(source).toContain('onClosed();');
    expect(source).toContain('ref={closeButtonRef}');
    expect(source).toContain('const focusFrameRef = useRef<number | null>(null);');
    expect(source).toContain('focusFrameRef.current = requestAnimationFrame');
    expect(source).toContain('closeButtonRef.current?.focus({ preventScroll: true })');
    expect(source).toContain("inert={phase === 'closing' ? true : undefined}");
    expect(source).toContain('data-state={phase}');
    expect(source).not.toContain("className={`dm-overlay${open ? ' open' : ''}`}");
  });

  it('captures the trigger element for return focus', () => {
    expect(source).toContain(
      'onOpen: (annotation: Annotation, returnFocusTarget: HTMLElement) => void;',
    );
    expect(source).toContain('onClick={(event) => onOpen(annotation, event.currentTarget)}');
    expect(source).toContain('const modalReturnFocusRef = useRef<HTMLElement | null>(null);');
    expect(source).toContain('modalReturnFocusRef.current = returnFocusTarget;');
    expect(source).toContain('returnFocusTarget={modalReturnFocusRef.current}');
    expect(source).toContain('onClosed={handleModalClosed}');
  });
});
