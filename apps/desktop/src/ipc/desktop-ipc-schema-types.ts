import type { ZodType } from 'zod';
import type { DesktopIpcInvokeArgs, DesktopIpcInvokeChannel } from '../ipc-contract';

export type DesktopIpcArgsSchema<Channel extends DesktopIpcInvokeChannel> = ZodType<
  DesktopIpcInvokeArgs<Channel>
>;

export type DesktopIpcSchemaMap = {
  [Channel in DesktopIpcInvokeChannel]?: DesktopIpcArgsSchema<Channel>;
};
