import { describe, expect, it, vi } from 'vitest';
import { buildSourceReaderAppActions } from './source-reader-app-actions';

describe('buildSourceReaderAppActions', () => {
  it('routes annotation discussion opens with the source article id', () => {
    const onOpenAnnotationDiscussion = vi.fn();
    const actions = buildSourceReaderAppActions({
      ...baseInput(),
      articleId: 'article_1',
      onOpenAnnotationDiscussion,
    });
    const sourceRect = { x: 1, y: 2, width: 3, height: 4 };

    actions.annotation.onOpenAnnotationDiscussion?.('annotation_1', sourceRect);

    expect(onOpenAnnotationDiscussion).toHaveBeenCalledWith(
      'article_1',
      'annotation_1',
      sourceRect,
    );
  });

  it('keeps source-specific selection and chat reveal handlers', () => {
    const onMouseUp = vi.fn();
    const onRevealReaderChatContext = vi.fn();
    const actions = buildSourceReaderAppActions({
      ...baseInput(),
      chat: {
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onSubmit: vi.fn(),
      },
      selection: {
        ...baseInput().selection,
        onMouseUp,
      },
      onRevealReaderChatContext,
    });

    actions.selection.onMouseUp({} as never);
    void actions.chat?.onRevealContext?.({ content: 'quote' } as never);

    expect(onMouseUp).toHaveBeenCalled();
    expect(onRevealReaderChatContext).toHaveBeenCalledWith({ content: 'quote' });
  });

  it('keeps the existing chat reveal handler when no source override is provided', () => {
    const onRevealContext = vi.fn();
    const actions = buildSourceReaderAppActions({
      ...baseInput(),
      chat: {
        onClose: vi.fn(),
        onOpen: vi.fn(),
        onSubmit: vi.fn(),
        onRevealContext,
      },
    });

    void actions.chat?.onRevealContext?.({ content: 'quote' } as never);

    expect(onRevealContext).toHaveBeenCalledWith({ content: 'quote' });
  });
});

function baseInput(): Parameters<typeof buildSourceReaderAppActions>[0] {
  return {
    annotation: {
      onAddComment: vi.fn(),
      onAnnotationLayoutChange: vi.fn(),
      onClearActiveAnnotation: vi.fn(),
      onCreateAnnotation: vi.fn(),
      onDeleteAnnotation: vi.fn(),
      onDeleteComment: vi.fn(),
      onFocusAnnotation: vi.fn(),
      onHighlightClick: vi.fn(),
      onResolveAnnotationNavigation: vi.fn(() => ({
        currentIndex: -1,
        nextId: null,
        previousId: null,
        totalCount: 0,
      })),
      onScrollToHighlight: vi.fn(),
    },
    articleId: 'article_1',
    selection: {
      onAskSelection: vi.fn(),
      onCancelComposer: vi.fn(),
      onClearSelection: vi.fn(),
      onCloseHighlightChoice: vi.fn(),
      onCopySelection: vi.fn(),
      onMouseUp: vi.fn(),
      onOpenComposer: vi.fn(),
    },
    shell: {
      onClose: vi.fn(),
      onCloseFloatingPanels: vi.fn(),
      onCloseResponsivePanels: vi.fn(),
      onToggleSettings: vi.fn(),
      onUpdateReaderSettings: vi.fn(),
    },
    toc: {
      onScrollToHeading: vi.fn(),
      onToggleToc: vi.fn(),
    },
  };
}
