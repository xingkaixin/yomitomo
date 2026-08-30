import {
  agentIpcInvokeDescriptors,
  annotationWindowIpcInvokeDescriptors,
  appIpcInvokeDescriptors,
  appLockIpcInvokeDescriptors,
  articleIpcInvokeDescriptors,
  dataIpcInvokeDescriptors,
  libraryCollectionIpcInvokeDescriptors,
  providerIpcInvokeDescriptors,
  storeIpcInvokeDescriptors,
  updateIpcInvokeDescriptors,
  weReadIpcInvokeDescriptors,
} from './desktop-ipc-contract-fragments';
import {
  desktopIpcInvokeRoutesFromDescriptors,
  type DesktopIpcInvokeMapFromDescriptors,
} from './desktop-ipc-descriptor';
import { readingMemoryIpcInvokeDescriptors } from './reading-memory-descriptors';

export type {
  DesktopIpcValidationExemption,
  DesktopIpcValidationPolicy,
} from './desktop-ipc-descriptor';

export const desktopIpcInvokeDescriptors = {
  ...agentIpcInvokeDescriptors,
  ...annotationWindowIpcInvokeDescriptors,
  ...appIpcInvokeDescriptors,
  ...appLockIpcInvokeDescriptors,
  ...articleIpcInvokeDescriptors,
  ...dataIpcInvokeDescriptors,
  ...libraryCollectionIpcInvokeDescriptors,
  ...providerIpcInvokeDescriptors,
  ...readingMemoryIpcInvokeDescriptors,
  ...storeIpcInvokeDescriptors,
  ...updateIpcInvokeDescriptors,
  ...weReadIpcInvokeDescriptors,
};

export type DesktopIpcInvokeMap = DesktopIpcInvokeMapFromDescriptors<
  typeof desktopIpcInvokeDescriptors
>;

export type DesktopIpcInvokeChannel = keyof DesktopIpcInvokeMap;

export type DesktopIpcInvokeArgs<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['args'];

export type DesktopIpcInvokeResult<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['result'];

export const desktopIpcInvokeRoutes = desktopIpcInvokeRoutesFromDescriptors(
  desktopIpcInvokeDescriptors,
) satisfies Record<DesktopIpcInvokeChannel, readonly [domain: string, ...path: string[]]>;

type DesktopIpcRouteApi<Route extends readonly string[], Operation> = Route extends readonly [
  infer Segment extends string,
  ...infer Rest extends string[],
]
  ? { [Key in Segment]: DesktopIpcRouteApi<Rest, Operation> }
  : Operation;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

export type DesktopIpcInvokeApi = UnionToIntersection<
  {
    [Channel in DesktopIpcInvokeChannel]: DesktopIpcRouteApi<
      (typeof desktopIpcInvokeRoutes)[Channel],
      (...args: DesktopIpcInvokeArgs<Channel>) => Promise<DesktopIpcInvokeResult<Channel>>
    >;
  }[DesktopIpcInvokeChannel]
>;

export type DesktopIpcDeclaredSchemaChannel = {
  [Channel in DesktopIpcInvokeChannel]: DesktopIpcInvokeMap[Channel]['validation'] extends 'schema'
    ? Channel
    : never;
}[DesktopIpcInvokeChannel];
