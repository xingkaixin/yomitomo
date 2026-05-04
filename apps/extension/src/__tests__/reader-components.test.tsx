// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, UserProfile } from '@yomitomo/shared';
import { AnnotationCard, Composer } from '../reader-components';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const userProfile: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

const annotation: Annotation = {
  id: 'annotation_1',
  anchor: {
    exact: '重要原文',
    prefix: '',
    suffix: '',
    start: 0,
    end: 4,
  },
  author: 'user',
  annotationType: 'key_point',
  color: '#f4c95d',
  comments: [],
  createdAt: '2026-05-04T00:00:00.000Z',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

describe('Composer', () => {
  it('provides an accessible name for the annotation textarea', () => {
    render(
      <Composer
        composer={{ x: 0, y: 0, anchor: annotation.anchor }}
        shortcutModifier="⌘"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('批注内容')).toBeTruthy();
  });
});

describe('AnnotationCard', () => {
  it('provides an accessible name for the comment textarea', () => {
    render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation}
        desktopConnected
        noteRef={vi.fn()}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /0 条评论/ }));

    expect(screen.getByLabelText('评论内容')).toBeTruthy();
  });
});
