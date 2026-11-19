import { useMemo } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/react';
import { BookmarkPluginPackage } from '@embedpdf/plugin-bookmark/react';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';

export function usePdfiumPlugins() {
  return useMemo(
    () => [
      // Open documents imperatively in onInitialized so PluginRegistry config never retains the PDF buffer.
      createPluginRegistration(DocumentManagerPluginPackage),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage, { defaultBufferSize: 1, defaultPageGap: 24 }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage, { marquee: { enabled: false } }),
      createPluginRegistration(BookmarkPluginPackage),
      createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitWidth }),
    ],
    [],
  );
}
