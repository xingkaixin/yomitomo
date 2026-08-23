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

export const readerConversationStyles = [
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
].join('\n');
