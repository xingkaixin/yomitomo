import { readerBaseStyles } from './reader-base-styles';
import { readerConversationStyles } from './reader-conversation-styles';
import { readerDesktopEmbeddedStyles } from './reader-embedded-styles';

export const readerStyleBundles = {
  base: readerBaseStyles,
  conversation: readerConversationStyles,
  desktopEmbedded: readerDesktopEmbeddedStyles,
} as const;

export type ReaderStyleBundle = keyof typeof readerStyleBundles;

export function composeReaderStyles(bundles: readonly ReaderStyleBundle[]) {
  return bundles.map((bundle) => readerStyleBundles[bundle]).join('\n');
}

export const readerDesktopEmbeddedBundleStyles = composeReaderStyles([
  'base',
  'conversation',
  'desktopEmbedded',
]);
