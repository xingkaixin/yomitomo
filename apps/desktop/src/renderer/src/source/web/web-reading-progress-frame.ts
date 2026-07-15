export function createWebReadingProgressFrame(commitProgress: (progress: number) => void) {
  let frame: number | null = null;
  let pendingProgress = 0;

  const cancel = () => {
    if (frame === null) return;
    window.cancelAnimationFrame(frame);
    frame = null;
  };

  const schedule = (progress: number) => {
    pendingProgress = progress;
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      commitProgress(pendingProgress);
    });
  };

  return { cancel, schedule };
}
