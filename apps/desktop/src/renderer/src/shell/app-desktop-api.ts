import type { YomitomoDesktopApi } from '../../../preload';

export type PartialDesktopApi = {
  [Key in keyof YomitomoDesktopApi]?: YomitomoDesktopApi[Key] extends (...args: never[]) => unknown
    ? YomitomoDesktopApi[Key]
    : YomitomoDesktopApi[Key] extends object
      ? {
          [NestedKey in keyof YomitomoDesktopApi[Key]]?: YomitomoDesktopApi[Key][NestedKey];
        }
      : YomitomoDesktopApi[Key];
};

export function getDesktopApi(): YomitomoDesktopApi {
  return (globalThis as typeof window).yomitomoDesktop;
}

export function getOptionalDesktopApi(): PartialDesktopApi | undefined {
  return (globalThis as typeof window).yomitomoDesktop;
}
