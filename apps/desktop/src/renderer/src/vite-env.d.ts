/// <reference types="vite/client" />

import type { YomitomoDesktopApi } from '../../preload';

declare global {
  interface Window {
    yomitomoDesktop: YomitomoDesktopApi;
  }
}
