import React from 'react';
import type {
  AgentReadingPlanItem,
  FocusCoReadingPlan,
  MessageSendShortcut,
  PublicAgent,
} from '@yomitomo/shared';
import { AgentAnnotateMenu } from './reader-agent-annotate-menu';
import { AnnotationFilterPanel } from './reader-filter-panel';
import { ReaderSettingsPanel } from './reader-settings-panel';
import type { ReaderReadingSection, ReaderSettings } from './reader-types';
import type { AnnotationFilterFacets, AnnotationFilterGroup } from './reader-utils';

export type ReaderFloatingPanelsProps = {
  agentAnnotateOpen: boolean;
  agents: PublicAgent[];
  annotatingAgents: string[];
  annotationFilterFacets: AnnotationFilterFacets;
  annotationFilterOpen: boolean;
  annotationFilterPanelId: string;
  articleId: string;
  focusCoReadingPlan?: FocusCoReadingPlan;
  messageSendShortcut: MessageSendShortcut;
  readerSettings: ReaderSettings;
  readingSections: ReaderReadingSection[];
  settingsOpen: boolean;
  shortcutModifier: string;
  onCancelAgentAnnotateMenu: () => void;
  onClearAnnotationFilter: () => void;
  onPlanFocusCoReading: (selectedAgentIds: string[]) => Promise<FocusCoReadingPlan>;
  onSaveFocusCoReadingPlan: (plan: FocusCoReadingPlan) => void | Promise<void>;
  onStartAgentReadingPlan: (agent: PublicAgent, readingPlan: AgentReadingPlanItem[]) => void;
  onToggleAnnotationFilterValue: (group: AnnotationFilterGroup, value: string) => void;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};

export function ReaderFloatingPanels({
  agentAnnotateOpen,
  agents,
  annotatingAgents,
  annotationFilterFacets,
  annotationFilterOpen,
  annotationFilterPanelId,
  articleId,
  focusCoReadingPlan,
  messageSendShortcut,
  readerSettings,
  readingSections,
  settingsOpen,
  shortcutModifier,
  onCancelAgentAnnotateMenu,
  onClearAnnotationFilter,
  onPlanFocusCoReading,
  onSaveFocusCoReadingPlan,
  onStartAgentReadingPlan,
  onToggleAnnotationFilterValue,
  onUpdateReaderSettings,
}: ReaderFloatingPanelsProps) {
  return (
    <>
      {agentAnnotateOpen ? (
        <div className="reader-agent-annotate-popover" data-reader-floating-panel>
          <button
            className="reader-agent-annotate-scrim"
            type="button"
            aria-label="取消编排"
            onClick={onCancelAgentAnnotateMenu}
          />
          <AgentAnnotateMenu
            articleId={articleId}
            agents={agents}
            annotatingAgents={annotatingAgents}
            focusCoReadingPlan={focusCoReadingPlan}
            messageSendShortcut={messageSendShortcut}
            readingSections={readingSections}
            shortcutModifier={shortcutModifier}
            onCancel={onCancelAgentAnnotateMenu}
            onPlanFocusCoReading={onPlanFocusCoReading}
            onSaveFocusCoReadingPlan={onSaveFocusCoReadingPlan}
            onStartAgentPlan={onStartAgentReadingPlan}
          />
        </div>
      ) : null}

      {annotationFilterOpen ? (
        <AnnotationFilterPanel
          facets={annotationFilterFacets}
          panelProps={
            {
              'data-reader-floating-panel': '',
              id: annotationFilterPanelId,
            } as React.HTMLAttributes<HTMLDivElement>
          }
          onClear={onClearAnnotationFilter}
          onToggle={onToggleAnnotationFilterValue}
        />
      ) : null}

      {settingsOpen ? (
        <ReaderSettingsPanel
          panelProps={{ 'data-reader-floating-panel': '' } as React.HTMLAttributes<HTMLDivElement>}
          settings={readerSettings}
          onChange={onUpdateReaderSettings}
        />
      ) : null}
    </>
  );
}
