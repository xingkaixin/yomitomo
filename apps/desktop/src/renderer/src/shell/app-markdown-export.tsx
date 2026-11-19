import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon, Download01Icon } from '@hugeicons/core-free-icons';
import { useReducer } from 'react';
import { sanitizeMarkdownFileName, type MarkdownExportLabels } from '@yomitomo/core';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { getOptionalDesktopApi } from './app-desktop-api';
import { appToast } from './app-toast';

export function markdownExportLabels(): MarkdownExportLabels {
  return {
    aiTag: i18next.t('markdownExport.aiTag'),
    author: i18next.t('markdownExport.author'),
    chapterFallback: (chapterUid) => i18next.t('wereadBook.chapterFallback', { chapterUid }),
    distillation: i18next.t('markdownExport.distillation'),
    otherNotes: i18next.t('markdownExport.otherNotes'),
    source: i18next.t('markdownExport.source'),
    untitled: i18next.t('discussion.untitledArticle'),
  };
}

export async function copyMarkdownText(markdown: string) {
  try {
    await navigator.clipboard.writeText(markdown);
    appToast.success(i18next.t('markdownExport.copied'));
  } catch (error) {
    console.warn('[markdown-export] copy failed', { error });
    appToast.error(i18next.t('markdownExport.copyFailed'));
  }
}

export async function saveMarkdownFile(defaultTitle: string, markdown: string) {
  const saveFile = getOptionalDesktopApi()?.app?.saveMarkdownFile;
  if (!saveFile) {
    appToast.error(i18next.t('markdownExport.saveFailed'));
    return;
  }
  try {
    const result = await saveFile({
      defaultFileName: sanitizeMarkdownFileName(defaultTitle),
      content: markdown,
    });
    if (!result.canceled) {
      appToast.success(i18next.t('markdownExport.saved'));
    }
  } catch (error) {
    console.warn('[markdown-export] save failed', { error });
    appToast.error(i18next.t('markdownExport.saveFailed'));
  }
}

type ExportMenuState = { busy: boolean; open: boolean };
type ExportMenuEvent =
  | { type: 'actionFinished' }
  | { type: 'actionStarted' }
  | { type: 'openChanged'; open: boolean };

function exportMenuReducer(state: ExportMenuState, event: ExportMenuEvent): ExportMenuState {
  switch (event.type) {
    case 'actionFinished':
      return { ...state, busy: false };
    case 'actionStarted':
      return { busy: true, open: false };
    case 'openChanged':
      return { ...state, open: event.open };
  }
}

export function MarkdownExportMenu({
  ariaLabel,
  buildMarkdown,
  buttonClassName,
  disabled = false,
  fileName,
  iconSize = 16,
  title,
  triggerLabel,
}: {
  ariaLabel?: string;
  buildMarkdown: () => string;
  buttonClassName?: string;
  disabled?: boolean;
  fileName: string;
  iconSize?: number;
  title?: string;
  triggerLabel?: string;
}) {
  const { t } = useTranslation();
  const [{ busy, open }, dispatch] = useReducer(exportMenuReducer, { busy: false, open: false });
  const label = ariaLabel || t('markdownExport.menuAria');
  const buttonTitle = title || label;

  async function runAction(action: 'copy' | 'save') {
    if (disabled || busy) return;
    dispatch({ type: 'actionStarted' });
    try {
      const markdown = buildMarkdown();
      if (action === 'copy') {
        await copyMarkdownText(markdown);
      } else {
        await saveMarkdownFile(fileName, markdown);
      }
    } finally {
      dispatch({ type: 'actionFinished' });
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => dispatch({ type: 'openChanged', open: nextOpen })}
    >
      <DropdownMenuTrigger asChild>
        <button
          aria-label={label}
          className={buttonClassName}
          disabled={disabled || busy}
          title={buttonTitle}
          type="button"
        >
          <HugeiconsIcon icon={Download01Icon} size={iconSize} />
          {triggerLabel ? <span>{triggerLabel}</span> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="markdown-export-menu" side="bottom" sideOffset={6}>
        <DropdownMenuItem asChild>
          <button
            className="markdown-export-menu-item"
            type="button"
            onClick={() => void runAction('copy')}
          >
            <HugeiconsIcon icon={Copy01Icon} size={14} />
            <span>{t('markdownExport.copyAction')}</span>
          </button>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <button
            className="markdown-export-menu-item"
            type="button"
            onClick={() => void runAction('save')}
          >
            <HugeiconsIcon icon={Download01Icon} size={14} />
            <span>{t('markdownExport.saveAction')}</span>
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
