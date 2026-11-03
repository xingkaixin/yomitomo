// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationCard } from '../annotations/reader-annotation-card';
import type { Annotation, UserProfile } from '@yomitomo/shared';

const now = '2026-05-12T08:00:00.000Z';

afterEach(() => {
  cleanup();
});

const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation-1',
    anchor: {
      exact: '需要批注的原文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 7,
    },
    author: {
      kind: 'user',
      userId: userProfile.id,
      username: userProfile.username,
      nickname: userProfile.nickname,
    },
    annotationType: 'key_point',
    color: userProfile.annotationColor,
    comments: [
      {
        id: 'comment-1',
        author: {
          kind: 'user',
          userId: userProfile.id,
          username: userProfile.username,
          nickname: userProfile.nickname,
        },
        content: '这是一段足够长的批注正文。'.repeat(12),
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AnnotationCard', () => {
  it('deletes the annotation only after confirming in the dialog', () => {
    const onDelete = vi.fn();

    render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation()}
        noteRef={vi.fn()}
        userProfile={userProfile}
        onDelete={onDelete}
        onFocus={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开划线操作' }));
    // 点击菜单里的删除入口只打开确认弹窗，不直接删除
    fireEvent.click(screen.getByRole('menuitem', { name: '删除划线' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toContain('删除这条划线？');

    // Escape 关闭确认弹窗，不删除
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    // 取消后不删除
    fireEvent.click(screen.getByRole('button', { name: '打开划线操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除划线' }));
    fireEvent.click(screen.getByRole('dialog').querySelector('.reader-confirm-cancel')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    // 重新触发并确认后才删除
    fireEvent.click(screen.getByRole('button', { name: '打开划线操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除划线' }));
    fireEvent.click(screen.getByRole('dialog').querySelector('.reader-confirm-delete')!);

    expect(onDelete).toHaveBeenCalledWith('annotation-1');
  });
});
