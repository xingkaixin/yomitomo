import i18next from 'i18next';
import { defaultLibraryContentSourceOrder } from '@yomitomo/shared';
import type { LibrarySource } from './app-reading-library-utils';

export type LibraryContentSourceOption = {
  value: LibrarySource;
  label: string;
  description: string;
};

export function libraryContentSourceOption(id: LibrarySource): LibraryContentSourceOption {
  return {
    value: id,
    label: i18next.t(`library.sources.${id}`),
    description: i18next.t(`library.sourceDescriptions.${id}`),
  };
}

export function libraryContentSourceBaseOptions(): LibraryContentSourceOption[] {
  return defaultLibraryContentSourceOrder.map(libraryContentSourceOption);
}
