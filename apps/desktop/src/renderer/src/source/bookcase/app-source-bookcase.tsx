import type {
  Agent,
  Annotation,
  AppSettings,
  ArticleReadingProgress,
  ArticleRecord,
  Comment,
  MessageSendShortcut,
  SelectionActionShortcuts,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import { useTranslation } from 'react-i18next';
import type {
  ArticleAgentAnnotationMergeResult,
  WindowAnimationSourceRect,
} from '../../../../ipc-contract';
import { EbookBookcase } from '../ebook/app-source-bookcase-ebook';
import { PdfBookcase } from '../pdfium/app-source-bookcase-pdf';
import { WebSourceBookcase } from '../web/app-source-bookcase-web';

export type SourceBookcaseProps = {
  agents: Agent[];
  annotations: Annotation[];
  article: ArticleRecord | null;
  readerTheme: ReaderTheme;
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
  focusAnnotationId: string | null;
  messageSendShortcut?: MessageSendShortcut;
  settings?: AppSettings;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  selectedAnnotationId: string | null;
  uiLanguage: UiLanguage;
  userProfile: UserProfile;
  onArticleChange: (article: ArticleRecord) => void;
  onFocusedAnnotation: () => void;
  onClose: () => void;
  onDeleteArticleAnnotation?: (articleId: string, annotationId: string) => Promise<void> | void;
  onDeleteArticleComment?: (
    articleId: string,
    annotationId: string,
    commentId: string,
  ) => Promise<void> | void;
  onOpenAnnotationDiscussion?: (
    articleId: string,
    annotationId: string,
    sourceRect?: WindowAnimationSourceRect,
  ) => Promise<void> | void;
  onOpenAnnotation: (annotationId: string | null) => void;
  onMergeArticleAgentAnnotation?: (
    articleId: string,
    annotation: Annotation,
  ) => Promise<ArticleAgentAnnotationMergeResult | null> | ArticleAgentAnnotationMergeResult | null;
  onSaveArticleAnnotation?: (
    articleId: string,
    annotation: Annotation,
    updatedAt?: string,
  ) => Promise<void> | void;
  onSaveArticleComment?: (
    articleId: string,
    annotationId: string,
    comment: Comment,
    updatedAt?: string,
  ) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onSaveArticleReaderChatState?: (
    articleId: string,
    readerChatState?: ArticleRecord['readerChatState'],
  ) => unknown;
};

export type WebSourceBookcaseProps = Omit<SourceBookcaseProps, 'article'> & {
  article: ArticleRecord;
};

export type EbookArticleRecord = ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> };

export type EbookBookcaseProps = Omit<SourceBookcaseProps, 'article'> & {
  article: EbookArticleRecord;
};

export function SourceBookcase(props: SourceBookcaseProps) {
  const { t } = useTranslation();
  if (!props.article) {
    return (
      <section className="source-bookcase is-empty">
        <div className="source-empty">{t('source.empty')}</div>
      </section>
    );
  }

  if (isEbookArticle(props.article)) {
    return <EbookBookcase {...props} article={props.article} />;
  }

  if (isPdfArticle(props.article)) {
    return <PdfBookcase {...props} article={props.article} />;
  }

  return <WebSourceBookcase {...props} article={props.article} />;
}

export function isEbookArticle(article: ArticleRecord | null): article is EbookArticleRecord {
  return article?.sourceType === 'ebook' && Boolean(article.ebook?.chapters.length);
}

export function isPdfArticle(article: ArticleRecord | null): article is ArticleRecord & {
  pdf: NonNullable<ArticleRecord['pdf']>;
} {
  return article?.sourceType === 'pdf' && Boolean(article.pdf);
}
