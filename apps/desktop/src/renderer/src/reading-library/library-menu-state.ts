export type LibraryMenuEvent = { type: 'openChanged'; open: boolean } | { type: 'itemChosen' };

export function libraryMenuReducer(_open: boolean, event: LibraryMenuEvent) {
  return event.type === 'openChanged' ? event.open : false;
}
