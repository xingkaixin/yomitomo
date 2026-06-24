import { cn } from '../../lib/utils';

type PopupClassName<State> = string | ((state: State) => string | undefined) | undefined;

export function composePopupClassName<State>(
  baseClassName: string,
  className: PopupClassName<State>,
) {
  if (typeof className === 'function') {
    return (state: State) => cn(baseClassName, className(state));
  }

  return cn(baseClassName, className);
}
