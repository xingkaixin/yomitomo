import { describe, expectTypeOf, it } from 'vitest';
import type { AgentMessagePayload, ArticleStorePatch, Comment } from '@yomitomo/shared';
import type {
  DesktopIpcDeclaredSchemaChannel,
  DesktopIpcEventChannel,
  DesktopIpcInvokeArgs,
  DesktopIpcInvokeResult,
  DesktopIpcStreamDoneEvent,
  DesktopIpcStreamPayload,
  DesktopIpcStreamProgressEvent,
  DesktopIpcToMainEventArgs,
  DesktopIpcToRendererEventArgs,
} from './ipc-contract';
import type { DesktopIpcSchemaChannel } from './ipc/desktop-ipc-schema-fragments';
import { desktopIpcInvoke } from './ipc/desktop-ipc-descriptor';

describe('desktop IPC event contract', () => {
  it('derives the PDFium wasm invoke contract', () => {
    expectTypeOf<DesktopIpcInvokeArgs<'app:pdfium-wasm-url'>>().toEqualTypeOf<[]>();
    expectTypeOf<DesktopIpcInvokeResult<'app:pdfium-wasm-url'>>().toEqualTypeOf<string>();
  });

  it('keeps descriptor routes literal and requires sender roles', () => {
    const descriptor = desktopIpcInvoke<[], void>()({
      route: ['app', 'quit'],
      roles: ['main'],
      validation: { exempt: 'no-args' },
    });

    expectTypeOf(descriptor.route).toEqualTypeOf<readonly ['app', 'quit']>();

    desktopIpcInvoke<[], void>()({
      // @ts-expect-error Route segments must be strings.
      route: ['app', 1],
      roles: ['main'],
      validation: { exempt: 'no-args' },
    });

    desktopIpcInvoke<[], void>()({
      route: ['app', 'quit'],
      // @ts-expect-error Every invoke descriptor must authorize a sender role.
      roles: [],
      validation: { exempt: 'no-args' },
    });

    // @ts-expect-error Every invoke descriptor must authorize a sender role.
    desktopIpcInvoke<[], void>()({
      route: ['app', 'quit'],
      validation: { exempt: 'no-args' },
    });
  });

  it('keeps schema declarations exact to descriptor validation', () => {
    expectTypeOf<DesktopIpcDeclaredSchemaChannel>().toEqualTypeOf<DesktopIpcSchemaChannel>();
    expectTypeOf<'article:import-url'>().toMatchTypeOf<DesktopIpcDeclaredSchemaChannel>();
    expectTypeOf<'settings:save'>().toMatchTypeOf<DesktopIpcDeclaredSchemaChannel>();
  });

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
