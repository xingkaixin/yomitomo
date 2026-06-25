import i18next from 'i18next';
import { providerPresets, type LlmProvider, type RelativeTimeParts } from '@yomitomo/shared';
import type { ReaderUiLabels } from '@yomitomo/reader-ui/reader-app-view';

export function readerUiLabels(): ReaderUiLabels {
  return {
    annotations: i18next.t('readerUi.annotations'),
    annotationCardTab: i18next.t('readerUi.annotationCardTab'),
    annotationNavigation: i18next.t('readerUi.annotationNavigation'),
    annotationProcessing: i18next.t('readerUi.annotationProcessing'),
    articleWidth: i18next.t('readerUi.articleWidth'),
    askSelection: i18next.t('readerUi.askSelection'),
    assistant: i18next.t('readerUi.assistant'),
    assistantAnswering: i18next.t('readerUi.assistantAnswering'),
    assistantCompleted: i18next.t('readerUi.assistantCompleted'),
    assistantReadingActive: i18next.t('readerUi.assistantReadingActive'),
    assistantReadingStatus: i18next.t('readerUi.assistantReadingStatus'),
    backToLibrary: i18next.t('readerUi.backToLibrary'),
    assistantParticipationSummary: (names, processing) =>
      names.length > 2
        ? i18next.t('readerUi.assistantParticipationSummary', {
            count: names.length,
            names: names.slice(0, 2).join(i18next.t('readerUi.nameSeparator')),
            processing: processing ? i18next.t('readerUi.processingSuffix') : '',
          })
        : i18next.t('readerUi.assistantParticipationDirect', {
            names: names.join(i18next.t('readerUi.nameSeparator')),
            processing: processing ? i18next.t('readerUi.processingSuffix') : '',
          }),
    cancel: i18next.t('common.cancel'),
    clearSearch: i18next.t('readerUi.clearSearch'),
    closeReader: i18next.t('readerUi.closeReader'),
    closeHighlightChoice: i18next.t('readerUi.closeHighlightChoice'),
    closeSearch: i18next.t('readerUi.closeSearch'),
    closeSidebar: i18next.t('readerUi.closeSidebar'),
    collapseReaderChat: i18next.t('readerUi.collapseReaderChat'),
    copiedSelection: i18next.t('readerUi.copiedSelection'),
    copySelection: i18next.t('readerUi.copySelection'),
    currentSelection: i18next.t('readerUi.currentSelection'),
    deleteHighlight: i18next.t('readerUi.deleteHighlight'),
    deleteAnnotation: i18next.t('readerUi.deleteAnnotation'),
    deleteAnnotationConfirmTitle: i18next.t('readerUi.deleteAnnotationConfirmTitle'),
    deleteAnnotationConfirmDescription: i18next.t('readerUi.deleteAnnotationConfirmDescription'),
    deleteAnnotationConfirmAction: i18next.t('readerUi.deleteAnnotationConfirmAction'),
    dateLocale: i18next.language || 'zh-CN',
    distillations: i18next.t('readerUi.distillations'),
    emptyNotesDescription: i18next.t('readerUi.emptyNotesDescription'),
    emptyNotesGestureLabel: i18next.t('readerUi.emptyNotesGestureLabel'),
    emptyNotesTitle: i18next.t('readerUi.emptyNotesTitle'),
    enterDiscussion: i18next.t('readerUi.enterDiscussion'),
    fontSize: i18next.t('readerUi.fontSize'),
    highlightActions: i18next.t('readerUi.highlightActions'),
    highlightChoice: i18next.t('readerUi.highlightChoice'),
    me: i18next.t('common.me'),
    nextHighlight: i18next.t('readerUi.nextHighlight'),
    nextSearchResult: i18next.t('readerUi.nextSearchResult'),
    noAssistantParticipation: i18next.t('readerUi.noAssistantParticipation'),
    openDistillationActions: i18next.t('readerUi.openDistillationActions'),
    openHighlightActions: i18next.t('readerUi.openHighlightActions'),
    openReaderChat: i18next.t('readerUi.openReaderChat'),
    previousHighlight: i18next.t('readerUi.previousHighlight'),
    previousSearchResult: i18next.t('readerUi.previousSearchResult'),
    readerChat: i18next.t('readerUi.readerChat'),
    readerChatAria: i18next.t('readerUi.readerChatAria'),
    readerChatAssistantPicker: i18next.t('readerUi.readerChatAssistantPicker'),
    readerChatClearQuote: i18next.t('readerUi.readerChatClearQuote'),
    readerChatContent: i18next.t('readerUi.readerChatContent'),
    readerChatContextSelection: i18next.t('readerUi.readerChatContextSelection'),
    readerChatEmpty: i18next.t('readerUi.readerChatEmpty'),
    readerChatPlaceholder: i18next.t('readerUi.readerChatPlaceholder'),
    readerChatSelectionPlaceholder: i18next.t('readerUi.readerChatSelectionPlaceholder'),
    readerControls: i18next.t('readerUi.readerControls'),
    readingProgress: i18next.t('readerUi.readingProgress'),
    relativeTimeLabel: readerRelativeTimeLabel,
    readerLibrary: i18next.t('readerUi.readerLibrary'),
    recordThought: i18next.t('readerUi.recordThought'),
    searchBody: i18next.t('readerUi.searchBody'),
    searchBodyPlaceholder: i18next.t('readerUi.searchBodyPlaceholder'),
    searchPreparing: i18next.t('readerUi.searchPreparing'),
    searchToolbar: i18next.t('readerUi.searchToolbar'),
    send: i18next.t('common.send'),
    sending: i18next.t('common.sending'),
    submitHighlight: i18next.t('readerUi.submitHighlight'),
    submitThought: i18next.t('readerUi.submitThought'),
    thoughtContent: i18next.t('readerUi.thoughtContent'),
    thoughtPlaceholder: i18next.t('readerUi.thoughtPlaceholder'),
    thoughtSummary: (count, processing) =>
      i18next.t('readerUi.thoughtSummary', {
        count,
        processing: processing ? i18next.t('readerUi.processingSuffix') : '',
      }),
    toc: i18next.t('readerUi.toc'),
    tocSummary: (annotations, distillations) =>
      i18next.t('readerUi.tocSummary', { annotations, distillations }),
    toggleToc: i18next.t('readerUi.toggleToc'),
  };
}

function readerRelativeTimeLabel(parts: RelativeTimeParts) {
  if (parts.unit === 'second') return i18next.t('readerUi.relativeTime.justNow');
  return i18next.t(`readerUi.relativeTime.${parts.unit}`, { count: parts.count });
}

export function themeDisplayName(themeId: string) {
  return i18next.t(`theme.names.${themeId}`, { defaultValue: themeId });
}

export function themeDisplayDescription(themeId: string, fallback: string) {
  return i18next.t(`theme.descriptions.${themeId}`, { defaultValue: fallback });
}

export function readerPaperDisplayName(label: string) {
  return i18next.t(`theme.readerPaperNames.${label}`, { defaultValue: label });
}

export function providerPresetDisplayName(presetId: string, fallback: string) {
  return i18next.t(`settings.models.providerPresets.${presetId}`, { defaultValue: fallback });
}

export function providerDisplayName(provider: Pick<LlmProvider, 'name' | 'presetId'>) {
  const preset = providerPresets.find((item) => item.id === provider.presetId);
  if (!preset || provider.name !== preset.name) return provider.name;
  return providerPresetDisplayName(preset.id, preset.name);
}
