import type { ProviderType } from '@yomitomo/shared';

export type SaveState = 'idle' | 'saving' | 'saved';
export type ProviderOption = { id: string; label: string; type: ProviderType; modelName: string };
export type ReadingCardWorkflowStepId = 'deliberation' | 'card' | 'review';
export type ReadingCardWorkflowStepState = 'waiting' | 'active' | 'running' | 'done' | 'error';
export type ReadingCardWorkflowStep = {
  id: ReadingCardWorkflowStepId;
  number: number;
  title: string;
  description: string;
  state: ReadingCardWorkflowStepState;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
};
