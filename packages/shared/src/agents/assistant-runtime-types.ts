export const assistantRuntimeTaskTypes = [
  'thread_reply',
  'create_thought',
  'distillation_review',
  'selection_first',
  'co_reading_section',
] as const;

export type AssistantRuntimeTaskType = (typeof assistantRuntimeTaskTypes)[number];

export const assistantExecutionTaskTypes = ['annotation', ...assistantRuntimeTaskTypes] as const;

export type AssistantExecutionTaskType = (typeof assistantExecutionTaskTypes)[number];

export const assistantExecutionStatuses = ['success', 'fallback', 'error'] as const;

export type AssistantExecutionStatus = (typeof assistantExecutionStatuses)[number];

export type AssistantRuntimeResultStatus = 'final' | 'fallback';

export type AnnotationRetentionDecision = 'kept' | 'filtered';
