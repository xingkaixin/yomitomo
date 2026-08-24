export { annotationDensityInstruction, annotationDensityMax } from './annotation-density';
export { createAgentAnnotation } from './agent-annotation-factory';
export { createAnnotationSuggestionAcceptance } from './annotation-suggestion-acceptance';
export {
  normalizeAnnotationSuggestion,
  parseAnnotationSuggestionInputs,
  parseAnnotationSuggestions,
} from './annotation-suggestion-parser';
export type {
  AnnotationSuggestion,
  AnnotationSuggestionAcceptance,
  AnnotationSuggestionDedupeMode,
  AnnotationSuggestionPath,
  AnnotationSuggestionRejectionReason,
  CreateAgentAnnotationOptions,
} from './annotation-generation-types';
