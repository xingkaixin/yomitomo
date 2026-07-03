import { foundationStyles } from './reader-conversation/foundation';
import { toolbarStyles } from './reader-conversation/toolbar';
import { surfaceStyles } from './reader-conversation/surface';
import { notesBasicStyles } from './reader-conversation/notes-basic';
import { chatAgentStyles } from './reader-conversation/chat-agent';
import { focusPlanStyles } from './reader-conversation/focus-plan';
import { markdownDialogTocStyles } from './reader-conversation/markdown-dialog-toc';
import { notesDiscussionStyles } from './reader-conversation/notes-discussion';
import { thoughtsCommentsStyles } from './reader-conversation/thoughts-comments';
import { composerTooltipHighlightResponsiveStyles } from './reader-conversation/composer-tooltip-highlight-responsive';

export const readerConversationStylesSource = [
  '',
  foundationStyles,
  toolbarStyles,
  surfaceStyles,
  notesBasicStyles,
  chatAgentStyles,
  focusPlanStyles,
  markdownDialogTocStyles,
  notesDiscussionStyles,
  thoughtsCommentsStyles,
  composerTooltipHighlightResponsiveStyles,
  '',
].join('\n');

export const readerConversationStyles = compactReaderCss(readerConversationStylesSource);

function compactReaderCss(source: string) {
  const trimmed = source.trim();
  let result = '';
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];

    if (quote) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      continue;
    }

    if (char === '\n' || char === '\r') {
      while (
        index + 1 < trimmed.length &&
        (trimmed[index + 1] === ' ' || trimmed[index + 1] === '\t')
      ) {
        index += 1;
      }
      continue;
    }

    if (
      (char === ' ' || char === '\t') &&
      trimmed
        .slice(index + 1)
        .trimStart()
        .startsWith('{')
    ) {
      continue;
    }

    result += char;
  }

  return result;
}
