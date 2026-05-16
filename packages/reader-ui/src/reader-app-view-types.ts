import type React from 'react';
import type {
  AgentReadingPlanItem,
  Annotation,
  FocusCoReadingPlan,
  MessageSendShortcut,
  PublicAgent,
  QuestionStatus,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import type { HighlightBox, TocItem } from '@yomitomo/core';
import type { buildTocAnnotationStats } from './reader-utils';
import type {
  ActiveConnection,
  AgentDockItem,
  HighlightChoiceAction,
  ReaderReadingSection,
  ReaderSettings,
  VirtualCursorState,
} from './reader-types';

export type SelectionAction = {
  x: number;
  y: number;
  anchor: Annotation['anchor'];
};

export type PendingComposer = SelectionAction;

export type HighlightChoice = HighlightChoiceAction & {
  annotationIds: string[];
};

export type ReaderArticle = {
  title: string;
  byline?: string;
  excerpt?: string;
  content: string;
};

export type AnnotationNavigationDirection = 'previous' | 'next';

export type AnnotationNavigationRequest = {
  activeId: string | null;
  annotations: Annotation[];
};

export type AnnotationNavigationState = {
  previousId: string | null;
  nextId: string | null;
};

export type ReaderAppViewProps = {
  activeConnection: ActiveConnection | null;
  activeId: string | null;
  agentAnnotateOpen: boolean;
  agentDockCompleting: boolean;
  agentDockItems: AgentDockItem[];
  agentTheaterBoxes: HighlightBox[];
  agents: PublicAgent[];
  annotatingAgents: string[];
  annotationTotals: { annotations: number; comments: number };
  annotations: Annotation[];
  articleContent?: React.ReactNode;
  articleId: string;
  articleRef: React.RefObject<HTMLElement | null>;
  boxes: HighlightBox[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  commentsCloseKey: number;
  composer: PendingComposer | null;
  completionBurstKey: number;
  embedded?: boolean;
  extracted: ReaderArticle;
  filteredAnnotations: Annotation[];
  focusCoReadingPlan?: FocusCoReadingPlan;
  highlightChoice: HighlightChoice | null;
  notesOpen: boolean;
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  notesRef: React.RefObject<HTMLElement | null>;
  replyRequest: { annotationId: string; key: number } | null;
  readerSettings: ReaderSettings;
  readingSections: ReaderReadingSection[];
  selectionAction: SelectionAction | null;
  settingsOpen: boolean;
  messageSendShortcut: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  shortcutModifier: string;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  temporaryBoxes: HighlightBox[];
  toolbarArticleAction?: React.ReactNode;
  tocOpen: boolean;
  tocAnnotationStats: ReturnType<typeof buildTocAnnotationStats>;
  tocItems: TocItem[];
  userProfile: UserProfile;
  virtualCursors: VirtualCursorState[];
  onAddComment: (annotationId: string, content: string) => void | Promise<void>;
  onCancelAgentAnnotateMenu: () => void;
  onCancelComposer: () => void;
  onClose: () => void;
  onClearActiveAnnotation: () => void;
  onCreateAnnotation: (note: string) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
  onAnswerQuestion: (annotationId: string) => void;
  onAnnotationLayoutChange?: () => void;
  onResolveAnnotationNavigation?: (
    request: AnnotationNavigationRequest,
  ) => AnnotationNavigationState;
  onNavigateAnnotation?: (annotationId: string, direction: AnnotationNavigationDirection) => void;
  onHighlightClick: (
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    annotationIds: string[],
  ) => void;
  onMouseUp: (event: React.MouseEvent<HTMLElement>) => void;
  onCloseHighlightChoice: () => void;
  onCloseFloatingPanels: () => void;
  onCloseResponsivePanels: () => void;
  onOpenComposer: (action: SelectionAction) => void;
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onPlanFocusCoReading: (selectedAgentIds: string[]) => Promise<FocusCoReadingPlan>;
  onSaveFocusCoReadingPlan: (plan: FocusCoReadingPlan) => void | Promise<void>;
  onStartAgentReadingPlan: (agent: PublicAgent, readingPlan: AgentReadingPlanItem[]) => void;
  onScrollToHeading: (item: TocItem) => void;
  onScrollToHighlight: (annotationId: string) => void;
  onSetAnnotationQuestionStatus: (annotationId: string, status: QuestionStatus) => void;
  onSetCommentQuestionStatus: (
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) => void;
  onToggleNotes: () => void;
  onToggleToc: () => void;
  onToggleAgentAnnotate: () => void;
  onToggleSettings: () => void;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};
