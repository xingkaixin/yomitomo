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
  backgroundColor: string;
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
