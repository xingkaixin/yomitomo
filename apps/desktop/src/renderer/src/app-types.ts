export type SaveState = 'idle' | 'saving' | 'saved';
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
