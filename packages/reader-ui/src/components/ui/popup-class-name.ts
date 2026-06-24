type PopupClassName<State> = string | ((state: State) => string | undefined) | undefined;

function cx(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function composePopupClassName<State>(
  baseClassName: string,
  className: PopupClassName<State>,
) {
  if (typeof className === 'function') {
    return (state: State) => cx(baseClassName, className(state));
  }

  return cx(baseClassName, className);
}
