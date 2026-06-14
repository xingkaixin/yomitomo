import type { AssistantToolEvidenceInput } from '../assistant/assistant-runtime-types';

export type AgentMessageReadingContextSnapshot = {
  memoryEvidence?: AssistantToolEvidenceInput[];
};

export type AgentMessageRunOptions = {
  readingContext?: AgentMessageReadingContextSnapshot;
};
