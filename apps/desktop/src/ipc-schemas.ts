import { type DesktopIpcInvokeArgs, type DesktopIpcInvokeChannel } from './ipc-contract';
import { DesktopIpcError, desktopIpcErrorCodes } from './ipc-errors';
import { desktopIpcRawInvokeSchemas } from './ipc/desktop-ipc-schema-fragments';
import {
  defineDesktopIpcSchemas,
  type DesktopIpcSchemaLookup,
} from './ipc/desktop-ipc-schema-types';

export const desktopIpcInvokeSchemas = defineDesktopIpcSchemas(desktopIpcRawInvokeSchemas);
const desktopIpcInvokeSchemaLookup: DesktopIpcSchemaLookup = desktopIpcInvokeSchemas;

export const desktopIpcInvokeSchemaChannels = Object.keys(
  desktopIpcInvokeSchemas,
) as DesktopIpcInvokeChannel[];

export function validateDesktopIpcInvokeArgs<Channel extends DesktopIpcInvokeChannel>(
  channel: Channel,
  args: DesktopIpcInvokeArgs<Channel>,
): DesktopIpcInvokeArgs<Channel> {
  const schema = desktopIpcInvokeSchemaLookup[channel];
  if (!schema) return args;
  const result = schema.safeParse(args);
  if (result.success) return result.data;
  throw new DesktopIpcError(desktopIpcErrorCodes.invalidArgs, desktopIpcErrorCodes.invalidArgs, {
    cause: result.error,
    detail: {
      channel,
      issues: result.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path,
      })),
    },
  });
}
