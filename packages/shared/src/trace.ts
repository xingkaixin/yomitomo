import type { TraceItemType } from './types';

export function normalizeTraceItemType(value: unknown): TraceItemType | null {
  return value === 'claim' ||
    value === 'question' ||
    value === 'agent_observation' ||
    value === 'reader_interest' ||
    value === 'cross_reference_candidate' ||
    value === 'unresolved_issue'
    ? value
    : null;
}
