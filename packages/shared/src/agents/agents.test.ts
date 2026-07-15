import { describe, expect, it } from 'vitest';
import {
  normalizeAgentReadingIntent,
  normalizeAnnotationConfidence,
  normalizeAnnotationEvidenceSource,
  normalizeAnnotationMove,
  normalizeAnnotationType,
} from './agents';

const normalizerCases = [
  {
    name: 'agent reading intent',
    normalize: normalizeAgentReadingIntent,
    validValues: ['explain', 'decompose', 'challenge', 'question', 'connect'],
  },
  {
    name: 'annotation type',
    normalize: normalizeAnnotationType,
    validValues: ['key_point', 'assumption', 'concept', 'question', 'quote'],
  },
  {
    name: 'annotation move',
    normalize: normalizeAnnotationMove,
    validValues: [
      'explain_concept',
      'surface_assumption',
      'ask_question',
      'connect_previous',
      'challenge_argument',
      'reader_application',
      'style_observation',
      'structure_marker',
      'definition_watch',
      'foreshadowing_watch',
    ],
  },
  {
    name: 'annotation evidence source',
    normalize: normalizeAnnotationEvidenceSource,
    validValues: ['localText', 'chapterSummary', 'trace', 'relatedPassage'],
  },
  {
    name: 'annotation confidence',
    normalize: normalizeAnnotationConfidence,
    validValues: ['low', 'medium', 'high'],
  },
] as const;

const invalidValues = ['invalid', '', ' quote ', 'QUOTE', null, undefined, 1, false, {}, []];

describe.each(normalizerCases)('$name normalizer', ({ normalize, validValues }) => {
  it.each(validValues)('preserves %s', (value) => {
    expect(normalize(value)).toBe(value);
  });

  it.each(invalidValues)('rejects invalid input %#', (value) => {
    expect(normalize(value)).toBeNull();
  });
});
