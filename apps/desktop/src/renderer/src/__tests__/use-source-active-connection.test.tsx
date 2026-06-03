// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { HighlightBox } from '@yomitomo/core';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { useSourceActiveConnection } from '../source/bookcase/use-source-active-connection';

const now = '2026-05-16T12:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

const annotationAgents: PublicAgent[] = [];

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockRect(element: Element, value: DOMRect) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => value,
  });
}

function annotation(id: string): Annotation {
  return {
    id,
    anchor: {
      exact: '同一段原文',
      prefix: '',
      suffix: '',
      start: 10,
      end: 15,
    },
    author: 'user',
    color: userProfile.annotationColor,
    userId: userProfile.id,
    userUsername: userProfile.username,
    userNickname: userProfile.nickname,
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function box(annotationId: string): HighlightBox {
  return {
    id: `${annotationId}-box`,
    annotationId,
    color: userProfile.annotationColor,
    left: 100,
    top: 80,
    width: 50,
    height: 20,
  };
}

function HookProbe() {
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const noteRefs = React.useRef(new Map<string, HTMLElement>());
  const railRef = React.useRef<HTMLElement | null>(null);
  const annotations = React.useMemo(() => [annotation('note-1')], []);
  const boxes = React.useMemo(() => [box('note-1')], []);
  const { activeConnection } = useSourceActiveConnection({
    annotationAgents,
    annotations,
    boxes,
    canvasRef,
    noteRefs,
    selectedAnnotationId: 'note-1',
    surfaceRef,
    userProfile,
  });

  return (
    <div
      className="reader-app"
      ref={(element) => {
        if (element) mockRect(element, rect(10, 20, 900, 700));
      }}
    >
      <div
        ref={(element) => {
          surfaceRef.current = element;
          if (element) mockRect(element, rect(10, 20, 900, 700));
        }}
      >
        <div
          ref={(element) => {
            canvasRef.current = element;
            if (element) mockRect(element, rect(30, 50, 760, 900));
          }}
        >
          <aside
            ref={(element) => {
              railRef.current = element;
              if (element) mockRect(element, rect(390, 70, 320, 900));
            }}
          >
            <section
              data-testid="note"
              style={{ top: '210px', transform: 'translateX(28px)' }}
              ref={(element) => {
                if (!element) {
                  noteRefs.current.delete('note-1');
                  return;
                }
                mockRect(element, rect(418, 322, 320, 140));
                Object.defineProperty(element, 'offsetParent', {
                  configurable: true,
                  get: () => railRef.current,
                });
                Object.defineProperty(element, 'offsetLeft', {
                  configurable: true,
                  get: () => 0,
                });
                noteRefs.current.set('note-1', element);
              }}
            />
          </aside>
        </div>
      </div>
      <output data-testid="path">{activeConnection?.path || ''}</output>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

describe('useSourceActiveConnection', () => {
  it('targets the final layout edge of an active stacked note', async () => {
    render(<HookProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('path').textContent).toMatch(/372 330$/);
    });
  });
});
