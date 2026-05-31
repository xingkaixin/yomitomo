import type React from 'react';
import type {
  Annotation,
  MessageSendShortcut,
  PublicAgent,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import type { HighlightBox, TocItem } from '@yomitomo/core';
import type {
  AnnotationRailLayout,
  buildTocAnnotationStats,
} from '../annotations/reader-annotations';
import type {
  ActiveConnection,
  AgentDockItem,
  HighlightChoiceAction,
  ReaderSettings,
  VirtualCursorState,
} from '../reader-types';

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
  agentDockCompleting: boolean;
  agentDockItems: AgentDockItem[];
  agentTheaterBoxes: HighlightBox[];
  agents: PublicAgent[];
  annotationTotals: { annotations: number; distillations: number };
  annotations: Annotation[];
  articleContent?: React.ReactNode;
  articleId: string;
  articleRef: React.RefObject<HTMLElement | null>;
  annotationRailLayoutOverride?: AnnotationRailLayout;
  annotationRailViewportHeight?: number;
  autoExpandNewAnnotations?: boolean;
  boxes: HighlightBox[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  commentsCloseKey: number;
  composer: PendingComposer | null;
  completionBurstKey: number;
  distillationAnimation?: {
    annotationId: string;
    transition: 'publish' | 'update' | 'unpublish';
    token: number;
  } | null;
  embedded?: boolean;
  extracted: ReaderArticle;
  filteredAnnotations: Annotation[];
  highlightChoice: HighlightChoice | null;
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  notesRef: React.RefObject<HTMLElement | null>;
  readerSettings: ReaderSettings;
  reviewAgents?: PublicAgent[];
  selectionAction: SelectionAction | null;
  settingsOpen: boolean;
  showSettings?: boolean;
  messageSendShortcut: MessageSendShortcut;
  pendingAnnotationAgents?: Record<string, PublicAgent[]>;
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
  onAddComment: (annotationId: string, content: string, replyTo?: string) => void | Promise<void>;
  onCancelComposer: () => void;
  onClose: () => void;
  onClearActiveAnnotation: () => void;
  onClearSelection: () => void;
  onCreateAnnotation: (note: string) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onDeleteComment: (annotationId: string, commentId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
  onOpenAnnotationDiscussion?: (annotationId: string) => void;
  onRequestAnnotationReview?: (annotationId: string, agents: PublicAgent[]) => void | Promise<void>;
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
  onScrollToHeading: (item: TocItem) => void;
  onScrollToHighlight: (annotationId: string) => void;
  onToggleToc: () => void;
  onToggleSettings: () => void;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};
