import { useReducer } from 'react';

export function Probe() {
  const [value] = useReducer((state: number) => state + 1, 0);
  return value;
}
