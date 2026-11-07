import { useMemo } from 'react';
import './word-reveal.css';

const MAX_STEP_MS = 26;

let segmenter: Intl.Segmenter | undefined;

function splitWords(text: string) {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

function isWord(part: string) {
  return part.trim().length > 0;
}

// Long text compresses its per-word step so the whole run fits in spreadMs.
function wordStepMs(wordCount: number, spreadMs: number) {
  return Math.min(MAX_STEP_MS, spreadMs / Math.max(wordCount, 1));
}

export function WordReveal({
  delayMs = 0,
  spreadMs = 650,
  text,
}: {
  delayMs?: number;
  spreadMs?: number;
  text: string;
}) {
  const parts = useMemo(() => {
    const segments = splitWords(text);
    const step = wordStepMs(segments.filter(isWord).length, spreadMs);
    const result: { delay: number | null; text: string }[] = [];
    let order = 0;
    for (const segment of segments) {
      if (!isWord(segment)) {
        result.push({ delay: null, text: segment });
        continue;
      }
      result.push({ delay: Math.round(delayMs + order * step), text: segment });
      order += 1;
    }
    return result;
  }, [delayMs, spreadMs, text]);

  return parts.map((part, index) =>
    part.delay === null ? (
      part.text
    ) : (
      <span key={index} className="word-reveal" style={{ animationDelay: `${part.delay}ms` }}>
        {part.text}
      </span>
    ),
  );
}
