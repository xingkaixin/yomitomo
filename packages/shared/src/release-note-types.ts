export type ReleaseNoteHighlightType = 'new' | 'changed' | 'deprecated' | 'fixed';

export type ReleaseNoteAudience = 'all' | 'reader' | 'ai' | 'import' | 'settings';

export type ReleaseNoteHighlight = {
  type: ReleaseNoteHighlightType;
  title: string;
  description?: string;
  audience?: ReleaseNoteAudience;
};

export type UserFacingReleaseNote = {
  version: string;
  highlights: ReleaseNoteHighlight[];
};
