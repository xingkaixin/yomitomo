import { ReaderSettingsPanel } from './reader-settings-panel';
import type { ReaderSettings } from '../reader-types';

export type ReaderFloatingPanelsProps = {
  labels?: { articleWidth: string; fontSize: string };
  readerSettings: ReaderSettings;
  settingsOpen: boolean;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};

export function ReaderFloatingPanels({
  labels,
  readerSettings,
  settingsOpen,
  onUpdateReaderSettings,
}: ReaderFloatingPanelsProps) {
  return (
    <>
      {settingsOpen ? (
        <ReaderSettingsPanel
          labels={labels}
          panelProps={{ 'data-reader-floating-panel': '' } as React.HTMLAttributes<HTMLDivElement>}
          settings={readerSettings}
          onChange={onUpdateReaderSettings}
        />
      ) : null}
    </>
  );
}
