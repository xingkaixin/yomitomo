import type {
  Agent,
  Annotation,
  ResolvedAppSettings,
  ArticleRecord,
  MessageSendShortcut,
  SelectionActionShortcuts,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import { useTranslation } from 'react-i18next';
import type { ReaderArticleActions } from '../../shell/app-article-store-actions';
import { EbookBookcase } from '../ebook/app-source-bookcase-ebook';
import { PdfBookcase } from '../pdfium/app-source-bookcase-pdf';
import { WebSourceBookcase } from '../web/app-source-bookcase-web';

type SourceBookcaseContent<TArticle extends ArticleRecord | null> = {
  agents: Agent[];
  annotations: Annotation[];
  article: TArticle;
  userProfile: UserProfile;
};

type SourceAnnotationActions = {
  onArticleChange: (article: ArticleRecord) => void;
  onFocusedAnnotation: () => void;
  onOpenAnnotation: (annotationId: string | null) => void;
};

type SourceReaderControl = {
  focusAnnotationId: string | null;
  onClose: () => void;
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
type PdfArticleRecord = Extract<ArticleRecord, { sourceType: 'pdf' }>;
export type EbookBookcaseProps = SourceBookcaseProps<EbookArticleRecord>;

export function SourceBookcase(props: SourceBookcaseProps) {
  const { t } = useTranslation();
  const article = props.content.article;
  if (!article) {
    return (
      <section className="source-bookcase is-empty">
        <div className="source-empty">{t('source.empty')}</div>
      </section>
    );
  }

  if (isEbookArticle(article)) {
    return <EbookBookcase {...props} content={{ ...props.content, article }} />;
  }

  if (isPdfArticle(article)) {
    return <PdfBookcase {...props} content={{ ...props.content, article }} />;
  }

  return <WebSourceBookcase {...props} content={{ ...props.content, article }} />;
}

export function isEbookArticle(article: ArticleRecord | null): article is EbookArticleRecord {
  return article?.sourceType === 'ebook' && Boolean(article.ebook.chapters.length);
}

export function isPdfArticle(article: ArticleRecord | null): article is PdfArticleRecord {
  return article?.sourceType === 'pdf' && Boolean(article.pdf);
}
