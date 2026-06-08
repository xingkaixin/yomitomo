import type React from 'react';
import type {
  Annotation,
  MessageSendShortcut,
  PublicAgent,
  ReaderChatState,
  ReaderQuestionContext,
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

export type ReaderHeaderArticleMeta = {
  title: string;
  byline?: string;
  dateLabel?: string;
  hasCover?: boolean;
};

export type AnnotationNavigationDirection = 'previous' | 'next';

export type AnnotationNavigationRequest = {
  activeId: string | null;
  annotations: Annotation[];
};

export type AnnotationNavigationState = {
  currentIndex: number;
  previousId: string | null;
  nextId: string | null;
  totalCount: number;
};

export type ReaderSearchToolbarMatch = {
  id: string;
  start: number;
  end: number;
  preview: string;
};

export type ReaderSearchToolbarState = {
  activeMatchIndex: number;
  limited: boolean;
  matches: ReaderSearchToolbarMatch[];
  open: boolean;
  query: string;
  onClose: () => void;
  onNextMatch: () => void;
  onOpen: () => void;
  onPreviousMatch: () => void;
  onQueryChange: (query: string) => void;
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
    phase: 'morph-out' | 'morph-in' | 'update' | 'unpublish-wobble';
    token: number;
  } | null;
  filteredAnnotations: Annotation[];
  searchBoxes?: HighlightBox[];
  showEmptyNotes?: boolean;
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

export type ReaderChatModel = {
  draftContext?: ReaderQuestionContext;
  error?: string;
  open: boolean;
  selectedAssistantId?: string;
  sending?: boolean;
  state?: ReaderChatState;
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
  articleLeadingVisual?: React.ReactNode;
  controls?: React.ReactNode;
  headerMeta?: ReaderHeaderArticleMeta;
  readingProgress?: number;
  search?: ReaderSearchToolbarState;
};

export type ReaderUiLabels = {
  annotations: string;
  annotationNavigation: string;
  annotationProcessing: string;
  articleWidth: string;
  askSelection: string;
  assistant: string;
  assistantAnswering: string;
  assistantCompleted: string;
  assistantParticipationSummary: (names: string[], processing: boolean) => string;
  assistantReadingActive: string;
  assistantReadingStatus: string;
  backToLibrary: string;
  cancel: string;
  closeReader: string;
  closeHighlightChoice: string;
  closeSearch: string;
  closeSidebar: string;
  collapseReaderChat: string;
  copySelection: string;
  currentSelection: string;
  deleteHighlight: string;
  distillations: string;
  emptyNotesDescription: string;
  emptyNotesGestureLabel: string;
  emptyNotesTitle: string;
  enterDiscussion: string;
  fontSize: string;
  highlightActions: string;
  highlightChoice: string;
  holdDelete: string;
  me: string;
  nextHighlight: string;
  nextSearchResult: string;
  noAssistantParticipation: string;
  openDistillationActions: string;
  openHighlightActions: string;
  openReaderChat: string;
  previousHighlight: string;
  previousSearchResult: string;
  readerChat: string;
  readerChatAria: string;
  readerChatAssistantPicker: string;
  readerChatClearQuote: string;
  readerChatContent: string;
  readerChatContextSelection: string;
  readerChatEmpty: string;
  readerChatPlaceholder: string;
  readerChatSelectionPlaceholder: string;
  readerControls: string;
  readingProgress: string;
  readerLibrary: string;
  recordThought: string;
  searchBody: string;
  searchBodyPlaceholder: string;
  searchToolbar: string;
  send: string;
  sending: string;
  submitHighlight: string;
  submitThought: string;
  thoughtContent: string;
  thoughtPlaceholder: string;
  thoughtSummary: (count: number, processing: boolean) => string;
  toc: string;
  tocSummary: (annotations: number, distillations: number) => string;
  toggleToc: string;
};

export const defaultReaderUiLabels: ReaderUiLabels = {
  annotations: '划线',
  annotationNavigation: '划线快捷选择',
  annotationProcessing: '助手处理中',
  articleWidth: '文章宽度',
  askSelection: '问一下',
  assistant: '助手',
  assistantAnswering: '正在回答...',
  assistantCompleted: '已完成',
  assistantReadingActive: '正在共读',
  assistantReadingStatus: '助手共读状态',
  assistantParticipationSummary: (names, processing) => {
    if (names.length === 0) return '暂无助手参与';
    const visibleNames = names.slice(0, 2).join('、');
    const suffix = names.length > 2 ? `等 ${names.length} 位助手` : '参与';
    return `${visibleNames}${suffix}${processing ? '，处理中' : ''}`;
  },
  backToLibrary: '阅读库',
  cancel: '取消',
  closeReader: '关闭阅读器',
  closeHighlightChoice: '关闭划线选择',
  closeSearch: '关闭搜索',
  closeSidebar: '关闭侧栏',
  collapseReaderChat: '收起阅读问答',
  copySelection: '复制',
  currentSelection: '当前选区',
  deleteHighlight: '长按删除划线',
  distillations: '沉淀',
  emptyNotesDescription:
    'Select text in the reader to highlight it, save a thought, or start a discussion.',
  emptyNotesGestureLabel: 'Select text in the article to create a saved highlight or thought.',
  emptyNotesTitle: 'Highlights and thoughts stay here',
  enterDiscussion: '进入讨论区',
  fontSize: '字号',
  highlightActions: '打开划线操作',
  highlightChoice: '选择划线',
  holdDelete: '长按删除',
  me: '我',
  nextHighlight: '下一个划线',
  nextSearchResult: '下一个搜索结果',
  noAssistantParticipation: '暂无助手参与',
  openDistillationActions: '打开沉淀操作',
  openHighlightActions: '打开划线操作',
  openReaderChat: '打开阅读问答',
  previousHighlight: '上一个划线',
  previousSearchResult: '上一个搜索结果',
  readerChat: '阅读问答',
  readerChatAria: '阅读问答',
  readerChatAssistantPicker: '选择回答助手',
  readerChatClearQuote: '清除引用',
  readerChatContent: '阅读问答内容',
  readerChatContextSelection: '当前选区',
  readerChatEmpty: '问一个和当前文章有关的问题',
  readerChatPlaceholder: '输入你的问题',
  readerChatSelectionPlaceholder: '围绕这段文字提问',
  readerControls: '阅读控制',
  readingProgress: '阅读进度',
  readerLibrary: '阅读库',
  recordThought: '记录想法',
  searchBody: '搜索正文',
  searchBodyPlaceholder: '搜索正文',
  searchToolbar: '正文搜索',
  send: '发送',
  sending: '发送中',
  submitHighlight: '划线',
  submitThought: '发布',
  thoughtContent: '想法内容',
  thoughtPlaceholder: '写下你的想法，留空则只划线…',
  thoughtSummary: (count, processing) => `${count} 条想法${processing ? '，助手处理中' : ''}`,
  toc: '目录',
  tocSummary: (annotations, distillations) => `${annotations} 划线，${distillations} 沉淀`,
  toggleToc: '切换目录',
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
  onAskSelection?: (action: SelectionAction) => void;
  onOpenComposer: (action: SelectionAction) => void;
};

export type ReaderChatActions = {
  onClearDraftContext?: () => void;
  onClose: () => void;
  onOpen: () => void;
  onRevealContext?: (context: ReaderQuestionContext) => void | Promise<void>;
  onSelectAssistant?: (assistantId: string) => void;
  onSubmit: (content: string) => void | Promise<void>;
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
  chat?: ReaderChatActions;
  selection: ReaderSelectionActions;
  shell: ReaderShellActions;
  toc: ReaderTocActions;
};

export type ReaderAppViewProps = {
  actions: ReaderAppViewActions;
  agents: ReaderAgentModel;
  annotations: ReaderAnnotationModel;
  article: ReaderArticleModel;
  chat?: ReaderChatModel;
  labels?: ReaderUiLabels;
  options?: ReaderShellOptions;
  refs: ReaderShellRefs;
  selection: ReaderSelectionModel;
  settings: ReaderSettingsModel;
  toc: ReaderTocModel;
  toolbar?: ReaderToolbarModel;
  userProfile: UserProfile;
};
