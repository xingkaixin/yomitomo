import type { AgentReadingPlanItem, PublicAgent } from '@yomitomo/shared';

export type VirtualReadingMode = 'article' | 'careful' | 'target';

export type VirtualReadingSection = {
  start: number;
  end: number;
};

export type VirtualReadingSession = {
  agent: PublicAgent;
  timerId: number;
  offset: number;
  paused: boolean;
  done: boolean;
  mode: VirtualReadingMode;
  step: number;
  sections: VirtualReadingSection[];
  sectionIndex: number;
};

export type VirtualReadingProgress = Pick<
  VirtualReadingSession,
  'offset' | 'step' | 'sections' | 'sectionIndex'
>;

export function normalizedReadingSections(readingPlan: AgentReadingPlanItem[]) {
  return readingPlan
    .map((item) => ({
      start: Math.max(0, item.sectionStart),
      end: Math.max(0, item.sectionEnd),
    }))
    .filter((section) => section.end > section.start)
    .toSorted((left, right) => left.start - right.start);
}

export function currentReadingSection(session: VirtualReadingProgress) {
  return session.sections[session.sectionIndex] || null;
}

export function nextReadingOffset(session: VirtualReadingProgress, textLength: number) {
  if (!session.sections.length) {
    return { offset: session.offset + session.step, sectionIndex: session.sectionIndex };
  }

  let sectionIndex = session.sections[session.sectionIndex] ? session.sectionIndex : 0;
  const section = session.sections[sectionIndex];
  if (!section) return { offset: session.offset + session.step, sectionIndex };

  const nextOffset = session.offset + session.step;
  if (nextOffset < section.end - 1) {
    return { offset: Math.max(section.start, nextOffset), sectionIndex };
  }

  sectionIndex = (sectionIndex + 1) % session.sections.length;
  const nextSection = session.sections[sectionIndex];
  return {
    offset: Math.min(Math.max(nextSection?.start || 0, 0), Math.max(0, textLength - 1)),
    sectionIndex,
  };
}

export function usesAgentDock(mode: VirtualReadingMode) {
  return mode === 'careful' || mode === 'target';
}
