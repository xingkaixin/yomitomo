// @vitest-environment jsdom

import React, { useState, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingMemory } from './app-reading-memory';

type ReadingMemoryProps = ComponentProps<typeof ReadingMemory>;
type DistillationProps = Pick<ReadingMemoryProps, 'onOpenEvidenceSource'>;
type ReviewProps = Pick<ReadingMemoryProps, 'catalogRevision' | 'onOpenEvidenceSource'>;

const children = vi.hoisted(() => ({
  distillations: vi.fn<(props: DistillationProps) => void>(),
  library: vi.fn<(props: ReadingMemoryProps) => void>(),
  review: vi.fn<(props: ReviewProps) => void>(),
  recordUsage: vi.fn(),
}));

const release = vi.hoisted(() => ({ enabled: undefined as boolean | undefined }));

vi.mock('../../../reading-memory-release', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../reading-memory-release')>();
  return {
    get readingMemoryEnabled() {
      return release.enabled ?? actual.readingMemoryEnabled;
    },
  };
});

vi.mock('./reading-memory-usage', () => ({ recordReadingMemoryUsage: children.recordUsage }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../distillations/app-distillation-library', () => ({
  DistillationLibrary: (props: DistillationProps) => {
    children.distillations(props);
    return <div>Distillation child</div>;
  },
}));

vi.mock('./reading-library-question', () => ({
  ReadingLibraryQuestion: (props: ReadingMemoryProps) => {
    children.library(props);
    const [draft, setDraft] = useState('');
    return (
      <input
        aria-label="Question child draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  },
}));

vi.mock('./reading-review', () => ({
  ReadingReview: (props: ReviewProps) => {
    children.review(props);
    const [answer, setAnswer] = useState('');
    return (
      <input
        aria-label="Review child answer"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
      />
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  release.enabled = true;
});

function renderMemory() {
  const props: ReadingMemoryProps = {
    collections: [{ id: 'collection-1', name: 'Reading list', createdAt: '', updatedAt: '' }],
    catalogRevision: { revision: 7 },
    onOpenEvidenceSource: vi.fn(),
  };
  return { props, ...render(<ReadingMemory {...props} />) };
}

function tab(value: 'distillations' | 'library' | 'review') {
  return screen.getByRole('tab', { name: `readingMemory.tabs.${value}` });
}

describe('ReadingMemory', () => {
  it('keeps only the legacy distillation library in the default release', () => {
    release.enabled = undefined;
    const { props } = renderMemory();

    expect(screen.getByText('Distillation child')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(children.library).not.toHaveBeenCalled();
    expect(children.review).not.toHaveBeenCalled();
    expect(children.recordUsage).not.toHaveBeenCalled();
    expect(children.distillations.mock.lastCall?.[0].onOpenEvidenceSource).toBe(
      props.onOpenEvidenceSource,
    );
  });

  it('records opening a new tab only after an explicit change to library or review', () => {
    const { props, rerender } = renderMemory();
    expect(children.recordUsage).not.toHaveBeenCalled();
    fireEvent.click(tab('library'));
    expect(children.recordUsage).toHaveBeenCalledExactlyOnceWith('feature_opened');
    fireEvent.click(tab('library'));
    rerender(<ReadingMemory {...props} catalogRevision={8} />);
    fireEvent.click(tab('distillations'));
    expect(children.recordUsage).toHaveBeenCalledOnce();
    fireEvent.click(tab('review'));
    expect(children.recordUsage.mock.calls).toEqual([['feature_opened'], ['feature_opened']]);
  });

  it('opens the existing distillation library by default without mounting a question session', () => {
    renderMemory();

    expect(screen.getByRole('region', { name: 'readingMemory.title' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'readingMemory.tabs.label' })).toBeTruthy();
    expect(tab('distillations').getAttribute('aria-selected')).toBe('true');
    expect(
      screen.getByRole('tabpanel', { name: 'readingMemory.tabs.distillations' }).textContent,
    ).toBe('Distillation child');
    expect(children.library).not.toHaveBeenCalled();
    expect(children.review).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('passes library inputs and the same evidence navigation callback directly to the children', () => {
    const { props } = renderMemory();
    const distillationProps = children.distillations.mock.lastCall?.[0];
    expect(distillationProps?.onOpenEvidenceSource).toBe(props.onOpenEvidenceSource);

    fireEvent.click(tab('library'));

    const libraryProps = children.library.mock.lastCall?.[0];
    expect(libraryProps?.collections).toBe(props.collections);
    expect(libraryProps?.catalogRevision).toBe(props.catalogRevision);
    expect(libraryProps?.onOpenEvidenceSource).toBe(props.onOpenEvidenceSource);
    expect(screen.queryByText('Distillation child')).toBeNull();
    expect(screen.getByRole('tabpanel', { name: 'readingMemory.tabs.library' })).toBeTruthy();

    const target = {
      articleId: 'article-1',
      annotationId: 'annotation-1',
      view: 'discussion' as const,
    };
    libraryProps?.onOpenEvidenceSource(target);
    expect(props.onOpenEvidenceSource).toHaveBeenCalledExactlyOnceWith(target);
  });

  it('unmounts the short question session when leaving and starts with a fresh draft on return', () => {
    renderMemory();
    fireEvent.click(tab('library'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Question child draft' }), {
      target: { value: 'A temporary question' },
    });
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('A temporary question');

    fireEvent.click(tab('distillations'));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Distillation child')).toBeTruthy();

    fireEvent.click(tab('library'));

    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('');
  });

  it('includes review in keyboard navigation and passes the shared navigation and revision inputs', () => {
    const { props } = renderMemory();
    expect((tab('review') as HTMLButtonElement).disabled).toBe(false);
    tab('distillations').focus();
    fireEvent.keyDown(tab('distillations'), { key: 'ArrowRight' });
    expect(tab('library').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('library'), { key: 'ArrowRight' });
    expect(tab('review').getAttribute('aria-selected')).toBe('true');
    expect(children.review.mock.lastCall?.[0]).toEqual({
      catalogRevision: props.catalogRevision,
      onOpenEvidenceSource: props.onOpenEvidenceSource,
    });
    fireEvent.keyDown(tab('review'), { key: 'ArrowRight' });
    expect(tab('distillations').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('distillations'), { key: 'ArrowLeft' });
    expect(tab('review').getAttribute('aria-selected')).toBe('true');
  });

  it('unmounts a review when leaving and starts with an empty answer on return', () => {
    renderMemory();
    fireEvent.click(tab('review'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Review child answer' }), {
      target: { value: 'A private answer' },
    });
    fireEvent.click(tab('library'));
    expect(screen.queryByRole('textbox', { name: 'Review child answer' })).toBeNull();
    fireEvent.click(tab('review'));
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: 'Review child answer' }).value,
    ).toBe('');
  });
});
