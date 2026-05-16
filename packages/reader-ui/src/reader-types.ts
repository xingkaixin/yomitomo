import type { PublicAgent } from '@yomitomo/shared';

export type SelectionMenuAction = {
  x: number;
  y: number;
};

export type PendingComposer = {
  x: number;
  y: number;
};

export type ActiveConnection = {
  path: string;
  color: string;
};

export type ReaderSettings = {
  fontSize: number;
  contentWidth: number;
};

export type VirtualCursorState = {
  id: string;
  visible: boolean;
  leaving?: boolean;
  x: number;
  y: number;
  label: string;
  offscreen: 'above' | 'below' | null;
  agent?: PublicAgent;
};

export type AgentDockItem = {
  agent: PublicAgent;
  state: 'active' | 'done';
};

export type HighlightChoiceAction = {
  x: number;
  y: number;
};

export type ReaderReadingSection = {
  id: string;
  title: string;
  start: number;
  end: number;
};
