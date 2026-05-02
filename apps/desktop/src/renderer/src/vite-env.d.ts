/// <reference types="vite/client" />

import type { ReaderDesktopApi } from "../../preload";

declare global {
  interface Window {
    readerDesktop: ReaderDesktopApi;
  }
}
