import { describe, expectTypeOf, it } from 'vitest';
import type { AgentMessagePayload, ArticleStorePatch, Comment } from '@yomitomo/shared';
import type {
  DesktopIpcEventChannel,
  DesktopIpcStreamDoneEvent,
  DesktopIpcStreamPayload,
  DesktopIpcStreamProgressEvent,
  DesktopIpcToMainEventArgs,
  DesktopIpcToRendererEventArgs,
} from './ipc-contract';

describe('desktop IPC event contract', () => {
  it('derives static event channels and payload tuples', () => {
    expectTypeOf<DesktopIpcToRendererEventArgs<'article:patched'>>().toEqualTypeOf<
      [payload: ArticleStorePatch]
    >();
    expectTypeOf<DesktopIpcToRendererEventArgs<'annotation-window:closing'>>().toEqualTypeOf<[]>();
    expectTypeOf<DesktopIpcToMainEventArgs<'app:renderer-ready'>>().toEqualTypeOf<[]>();
    expectTypeOf<'unknown:event'>().not.toMatchTypeOf<DesktopIpcEventChannel>();
  });

  it('derives stream payload, progress, and completion events', () => {
    expectTypeOf<
      DesktopIpcStreamPayload<'agent:comment:stream'>
    >().toEqualTypeOf<AgentMessagePayload>();
    expectTypeOf<{ type: 'delta'; delta: string }>().toMatchTypeOf<
      DesktopIpcStreamProgressEvent<'agent:comment:stream'>
    >();
    expectTypeOf<{ type: 'done'; comment: Comment }>().not.toMatchTypeOf<
      DesktopIpcStreamProgressEvent<'agent:comment:stream'>
    >();
    expectTypeOf<DesktopIpcStreamDoneEvent<'agent:comment:stream'>>().toEqualTypeOf<{
      type: 'done';
      comment: Comment;
    }>();
  });
});
