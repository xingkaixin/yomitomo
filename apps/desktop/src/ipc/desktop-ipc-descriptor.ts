export type RendererRole = 'annotation' | 'main';

export type DesktopIpcValidationExemption = 'domain-payload' | 'handler-owned' | 'no-args';

export type DesktopIpcValidationPolicy = 'schema' | { exempt: DesktopIpcValidationExemption };

export type DesktopIpcRendererRoles = readonly [RendererRole, ...RendererRole[]];

export const mainOnly = ['main'] as const satisfies DesktopIpcRendererRoles;
export const annotationAndMain = ['annotation', 'main'] as const satisfies DesktopIpcRendererRoles;

declare const desktopIpcInvokeTypes: unique symbol;

export type DesktopIpcInvokeDescriptor<Args extends unknown[] = unknown[], Result = unknown> = {
  readonly route: readonly [domain: string, ...path: string[]];
  readonly roles: DesktopIpcRendererRoles;
  readonly validation: DesktopIpcValidationPolicy;
  readonly appLockBypass?: true;
  readonly databaseLifecycle?: true;
  readonly [desktopIpcInvokeTypes]?: { args: Args; result: Result };
};

export type DesktopIpcInvokeDescriptorInit = Pick<
  DesktopIpcInvokeDescriptor,
  'appLockBypass' | 'databaseLifecycle' | 'roles' | 'route' | 'validation'
>;

export type DesktopIpcInvokeDescriptorMap = Record<string, DesktopIpcInvokeDescriptor>;

type DesktopIpcInvokeDescriptorTypeMetadata<Args extends unknown[], Result> = {
  readonly [desktopIpcInvokeTypes]?: { args: Args; result: Result };
};

type DesktopIpcInvokeDescriptorTypes<Descriptor> =
  Descriptor extends DesktopIpcInvokeDescriptor<infer Args, infer Result>
    ? { args: Args; result: Result }
    : never;

export type DesktopIpcInvokeMapFromDescriptors<Descriptors extends DesktopIpcInvokeDescriptorMap> =
  {
    [Channel in keyof Descriptors]: DesktopIpcInvokeDescriptorTypes<Descriptors[Channel]> & {
      validation: Descriptors[Channel]['validation'];
    };
  };

export type DesktopIpcInvokeRoutesFromDescriptors<
  Descriptors extends DesktopIpcInvokeDescriptorMap,
> = {
  readonly [Channel in keyof Descriptors]: Descriptors[Channel]['route'];
};

export type DesktopIpcInvokeRolesFromDescriptors<
  Descriptors extends DesktopIpcInvokeDescriptorMap,
> = {
  readonly [Channel in keyof Descriptors]: Descriptors[Channel]['roles'];
};

export function desktopIpcInvoke<Args extends unknown[], Result>() {
  return <const Init extends DesktopIpcInvokeDescriptorInit>(init: Init) =>
    init as Init & DesktopIpcInvokeDescriptorTypeMetadata<Args, Result>;
}

export function desktopIpcInvokeRoutesFromDescriptors<
  const Descriptors extends DesktopIpcInvokeDescriptorMap,
>(descriptors: Descriptors): DesktopIpcInvokeRoutesFromDescriptors<Descriptors> {
  return Object.fromEntries(
    Object.entries(descriptors).map(([channel, descriptor]) => [channel, descriptor.route]),
  ) as DesktopIpcInvokeRoutesFromDescriptors<Descriptors>;
}

export function desktopIpcInvokeRolesFromDescriptors<
  const Descriptors extends DesktopIpcInvokeDescriptorMap,
>(descriptors: Descriptors): DesktopIpcInvokeRolesFromDescriptors<Descriptors> {
  return Object.fromEntries(
    Object.entries(descriptors).map(([channel, descriptor]) => [channel, descriptor.roles]),
  ) as DesktopIpcInvokeRolesFromDescriptors<Descriptors>;
}

export function desktopIpcInvokeChannelsWithFlag<
  const Descriptors extends DesktopIpcInvokeDescriptorMap,
>(
  descriptors: Descriptors,
  flag: 'appLockBypass' | 'databaseLifecycle',
): Set<Extract<keyof Descriptors, string>> {
  return new Set(
    Object.entries(descriptors)
      .filter(([, descriptor]) => descriptor[flag])
      .map(([channel]) => channel),
  ) as Set<Extract<keyof Descriptors, string>>;
}
