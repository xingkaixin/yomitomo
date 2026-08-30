import type {
  Agent,
  Annotation,
  ArticleRecord,
  MessageSendShortcut,
  ResolvedAppSettings,
  SelectionActionShortcuts,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import type { ReaderArticleActions } from '../../shell/app-article-store-actions';
import type { ReadingEvidenceSourceTarget } from '../../shell/app-reading-types';

type SourceBookcaseContent<TArticle extends ArticleRecord | null> = {
  agents: Agent[];
  annotations: Annotation[];
  article: TArticle;
  userProfile: UserProfile;
};

type SourceAnnotationActions = {
  onArticleChange: (article: ArticleRecord) => void;
  onFocusedAnnotation: (located: boolean) => void;
  onOpenAnnotation: (annotationId: string | null) => void;
};

type SourceReaderControl = {
  focusAnnotationId: string | null;
  onClose: () => void;
  onOpenEvidenceSource?: (target: ReadingEvidenceSourceTarget) => void;
  selectedAnnotationId: string | null;
};

type SourcePresentation = {
  distillationAnimation?: {
    annotationId: string;
    transition: 'publish' | 'update' | 'unpublish';
    phase: 'morph-out' | 'morph-in' | 'update';
    overlayDistillation?: {
      content: string;
      publishedAt?: string;
      updatedAt?: string;
    };
    token: number;
  } | null;
  messageSendShortcut?: MessageSendShortcut;
  readerTheme: ReaderTheme;
  settings?: ResolvedAppSettings;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  uiLanguage: UiLanguage;
};

export type SourceBookcaseProps<TArticle extends ArticleRecord | null = ArticleRecord | null> = {
  annotationActions: SourceAnnotationActions;
  articleActions: ReaderArticleActions;
  content: SourceBookcaseContent<TArticle>;
  presentation: SourcePresentation;
  readerControl: SourceReaderControl;
};

export type WebSourceBookcaseProps = SourceBookcaseProps<ArticleRecord>;
export type EbookArticleRecord = Extract<ArticleRecord, { sourceType: 'ebook' }>;
export type PdfArticleRecord = Extract<ArticleRecord, { sourceType: 'pdf' }>;
export type EbookBookcaseProps = SourceBookcaseProps<EbookArticleRecord>;
