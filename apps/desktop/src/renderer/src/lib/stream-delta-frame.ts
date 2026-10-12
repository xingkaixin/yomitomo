export function createStreamDeltaFrame(
  commitDelta: (delta: string, streamedContent: string) => void,
) {
  let frame: number | null = null;
  let pendingDelta = '';
  let streamedContent = '';

  const commitPendingDelta = () => {
    frame = null;
    if (!pendingDelta) return;
    const delta = pendingDelta;
    pendingDelta = '';
    streamedContent += delta;
    commitDelta(delta, streamedContent);
  };

  const append = (delta: string) => {
    if (!delta) return;
    pendingDelta += delta;
    if (frame !== null) return;
    frame = window.requestAnimationFrame(commitPendingDelta);
  };

  const cancel = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    pendingDelta = '';
  };

  const reset = () => {
    cancel();
    streamedContent = '';
  };

  const flush = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    commitPendingDelta();
  };

  return {
    append,
    cancel,
    flush,
    reset,
    get streamedContent() {
      return streamedContent;
    },
  };
}
