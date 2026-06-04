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
import type { ReaderWindowSourceRect } from '../annotations/reader-annotation-card';
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

export type ReaderArticleModel = {
  content?: React.ReactNode;
  extracted: ReaderArticle;
  id: string;
};

export type ReaderShellRefs = {
  articleRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  notesRef: React.RefObject<HTMLElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
};

export type ReaderAnnotationModel = {
  activeId: string | null;
  activeConnection: ActiveConnection | null;
  railLayoutOverride?: AnnotationRailLayout;
  railViewportHeight?: number;
  annotationTotals: { annotations: number; distillations: number };
  annotations: Annotation[];
  autoExpandNewAnnotations?: boolean;
  boxes: HighlightBox[];
  commentsCloseKey: number;
  distillationAnimation?: {
    annotationId: string;
    transition: 'publish' | 'update' | 'unpublish';
    token: number;
  } | null;
  filteredAnnotations: Annotation[];
  temporaryBoxes: HighlightBox[];
};

export type ReaderAgentModel = {
  agents: PublicAgent[];
  completionBurstKey: number;
  dockCompleting: boolean;
  dockItems: AgentDockItem[];
  pendingAnnotationAgents?: Record<string, PublicAgent[]>;
  reviewAgents?: PublicAgent[];
  theaterBoxes: HighlightBox[];
  virtualCursors: VirtualCursorState[];
};

export type ReaderSelectionModel = {
  composer: PendingComposer | null;
  highlightChoice: HighlightChoice | null;
  selectionAction: SelectionAction | null;
};

export type ReaderSettingsModel = {
  messageSendShortcut: MessageSendShortcut;
  readerSettings: ReaderSettings;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  settingsOpen: boolean;
  showSettings?: boolean;
  shortcutModifier: string;
};

export type ReaderTocModel = {
  annotationStats: ReturnType<typeof buildTocAnnotationStats>;
  items: TocItem[];
  open: boolean;
};

export type ReaderToolbarModel = {
  articleAction?: React.ReactNode;
};

export type ReaderShellOptions = {
  embedded?: boolean;
};

export type ReaderAnnotationActions = {
  onAddComment: (annotationId: string, content: string, replyTo?: string) => void | Promise<void>;
  onAnnotationLayoutChange?: () => void;
  onClearActiveAnnotation: () => void;
  onCreateAnnotation: (note: string) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onDeleteComment: (annotationId: string, commentId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
  onHighlightClick: (
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    annotationIds: string[],
  ) => void;
  onNavigateAnnotation?: (annotationId: string, direction: AnnotationNavigationDirection) => void;
  onOpenAnnotationDiscussion?: (annotationId: string, sourceRect?: ReaderWindowSourceRect) => void;
  onResolveAnnotationNavigation?: (
    request: AnnotationNavigationRequest,
  ) => AnnotationNavigationState;
  onScrollToHighlight: (annotationId: string) => void;
};

export type ReaderSelectionActions = {
  onCancelComposer: () => void;
  onClearSelection: () => void;
  onCloseHighlightChoice: () => void;
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onMouseUp: (event: React.MouseEvent<HTMLElement>) => void;
  onOpenComposer: (action: SelectionAction) => void;
};

export type ReaderShellActions = {
  onClose: () => void;
  onCloseFloatingPanels: () => void;
  onCloseResponsivePanels: () => void;
  onToggleSettings: () => void;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};

export type ReaderTocActions = {
  onScrollToHeading: (item: TocItem) => void;
  onToggleToc: () => void;
};

export type ReaderAppViewActions = {
  annotation: ReaderAnnotationActions;
  selection: ReaderSelectionActions;
  shell: ReaderShellActions;
  toc: ReaderTocActions;
};

export type ReaderAppViewProps = {
  actions: ReaderAppViewActions;
  agents: ReaderAgentModel;
  annotations: ReaderAnnotationModel;
  article: ReaderArticleModel;
  options?: ReaderShellOptions;
  refs: ReaderShellRefs;
  selection: ReaderSelectionModel;
  settings: ReaderSettingsModel;
  toc: ReaderTocModel;
  toolbar?: ReaderToolbarModel;
  userProfile: UserProfile;
};
