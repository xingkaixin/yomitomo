import { ReaderSettingsPanel } from './reader-settings-panel';
import type { ReaderSettings } from '../reader-types';

export type ReaderFloatingPanelsProps = {
  readerSettings: ReaderSettings;
  settingsOpen: boolean;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};

export function ReaderFloatingPanels({
  readerSettings,
  settingsOpen,
  onUpdateReaderSettings,
}: ReaderFloatingPanelsProps) {
  return (
    <>
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
