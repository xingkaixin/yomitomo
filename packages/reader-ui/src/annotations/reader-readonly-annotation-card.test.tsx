// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalLink } from 'lucide-react';
import { ReadonlyAnnotationCard } from './reader-readonly-annotation-card';

describe('ReadonlyAnnotationCard', () => {
  afterEach(() => cleanup());

  it('renders a read-only annotation card without write actions', () => {
    const onOpen = vi.fn();
    render(
      <ReadonlyAnnotationCard
        action={{ icon: <ExternalLink size={13} />, label: '定位到批注', onClick: onOpen }}
        author={{ color: '#8a8f4f', fallback: '我', name: 'Kevin' }}
        createdAt="2026-05-20T00:00:00.000Z"
        id="note_1"
        quote="这是一条划线"
        thoughts={[
          {
            id: 'thought_1',
            author: { color: '#8a8f4f', fallback: '我', name: 'Kevin' },
            content: '**我的想法**',
            createdAt: '2026-05-20T00:00:01.000Z',
          },
        ]}
      />,
    );

    expect(screen.getByText('这是一条划线')).toBeTruthy();
    expect(screen.getByText('我的想法')).toBeTruthy();
    expect(screen.getByLabelText('1 条想法')).toBeTruthy();
    expect(screen.getByRole('button', { name: '定位到批注' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '添加想法' })).toBeNull();
    expect(screen.queryByRole('button', { name: '回复' })).toBeNull();
    expect(screen.queryByRole('button', { name: '邀请审阅' })).toBeNull();
    expect(screen.queryByRole('button', { name: /删除/ })).toBeNull();
  });
});
