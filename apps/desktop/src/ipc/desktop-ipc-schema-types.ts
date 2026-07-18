import type { ZodType } from 'zod';
import type {
  DesktopIpcDeclaredSchemaChannel,
  DesktopIpcInvokeArgs,
  DesktopIpcInvokeChannel,
} from '../ipc-contract';

export type DesktopIpcArgsSchema<Channel extends DesktopIpcDeclaredSchemaChannel> = ZodType<
  DesktopIpcInvokeArgs<Channel>
>;

export type DesktopIpcSchemaMap = {
  [Channel in DesktopIpcDeclaredSchemaChannel]: DesktopIpcArgsSchema<Channel>;
};

export type DesktopIpcSchemaLookup = {
  [Channel in DesktopIpcInvokeChannel]?: ZodType<DesktopIpcInvokeArgs<Channel>>;
};

export function defineDesktopIpcSchemas<Schemas extends DesktopIpcSchemaMap>(
  schemas: Schemas & Record<Exclude<keyof Schemas, DesktopIpcDeclaredSchemaChannel>, never>,
): Schemas {
  return schemas;
}
