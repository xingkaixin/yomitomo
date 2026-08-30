type DesktopAppWindow = {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
};

type DesktopAppInstanceOptions = {
  requestLock(): boolean;
  quit(): void;
  onSecondInstance(listener: () => void): void;
  getWindow(): DesktopAppWindow | null;
};

export function claimDesktopAppInstance(options: DesktopAppInstanceOptions) {
  if (!options.requestLock()) {
    options.quit();
    return false;
  }

  options.onSecondInstance(() => {
    const window = options.getWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  return true;
}
