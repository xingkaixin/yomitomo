import { useCallback, useMemo, useRef, type CSSProperties } from 'react';
import './word-reveal.css';

const MAX_STEP_MS = 26;
// Must match the word-reveal animation duration in word-reveal.css.
const REVEAL_MS = 900;
// The main process publishes run progress every 150ms; spreading a chunk over that interval keeps
// words flowing until the next chunk lands.
const STREAM_SPREAD_MS = 150;

type RevealedWord = { from: number; startsAt: number; to: number };
type StreamReveal = { id: string; length: number; words: RevealedWord[] };

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

export function wordRevealAccent(color: string) {
  return { '--word-reveal-accent': color } as CSSProperties;
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

/**
 * Reveals text appended to a streaming element. Attach the returned ref to an element whose key
 * changes with its content: each new element wraps the appended words, and words still animating
 * from earlier chunks resume where they were instead of restarting.
 */
export function useStreamingWordReveal(id: string, streaming: boolean) {
  const revealRef = useRef<StreamReveal | null>(null);
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element || !streaming) return;
      const length = element.textContent?.length ?? 0;
      const now = performance.now();
      const previous = revealRef.current?.id === id ? revealRef.current : null;
      // Text already on screen when this view first sees the run stays as it is.
      const words = previous
        ? [
            ...previous.words.filter(
              (word) => word.startsAt + REVEAL_MS > now && word.to <= length,
            ),
            ...scheduleWords(element.textContent ?? '', previous.length, now),
          ]
        : [];
      revealRef.current = { id, length, words };
      if (words.length > 0) wrapWords(element, words, now);
    },
    [id, streaming],
  );
}

function scheduleWords(text: string, from: number, now: number) {
  if (text.length <= from) return [];
  const parts = splitWords(text.slice(from));
  const step = wordStepMs(parts.filter(isWord).length, STREAM_SPREAD_MS);
  const words: RevealedWord[] = [];
  let offset = from;
  for (const part of parts) {
    if (isWord(part)) {
      words.push({ from: offset, startsAt: now + words.length * step, to: offset + part.length });
    }
    offset += part.length;
  }
  return words;
}

function wrapWords(element: HTMLElement, words: RevealedWord[], now: number) {
  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);

  let nodeStart = 0;
  let first = 0;
  for (const node of nodes) {
    const start = nodeStart;
    const end = start + node.data.length;
    nodeStart = end;
    while (first < words.length && words[first].to <= start) first += 1;
    if (first >= words.length || words[first].from >= end) continue;

    const fragment = doc.createDocumentFragment();
    let cursor = start;
    for (let index = first; index < words.length && words[index].from < end; index += 1) {
      const word = words[index];
      const from = Math.max(word.from, start);
      const to = Math.min(word.to, end);
      if (from > cursor) fragment.append(node.data.slice(cursor - start, from - start));
      const span = doc.createElement('span');
      span.className = 'word-reveal';
      // Negative delays resume words that were mid-animation before this re-render.
      span.style.animationDelay = `${Math.round(word.startsAt - now)}ms`;
      span.textContent = node.data.slice(from - start, to - start);
      fragment.append(span);
      cursor = to;
    }
    if (cursor < end) fragment.append(node.data.slice(cursor - start));
    node.replaceWith(fragment);
  }
}
