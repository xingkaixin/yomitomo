export class AssistantRuntimeFailure extends Error {
  constructor(readonly failureReason: string) {
    super(failureReason);
    this.name = 'AssistantRuntimeFailure';
  }
}

export class AssistantRuntimeProviderFailure extends Error {
  readonly _tag = 'AssistantRuntimeProviderFailure';

  constructor(cause: unknown) {
    super(errorMessage(cause) || 'provider_failed');
  }
}

export class AssistantRuntimeToolFailure extends Error {
  readonly _tag = 'AssistantRuntimeToolFailure';

  constructor(cause: unknown) {
    super(errorMessage(cause) || 'tool_execution_failed');
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function assistantRuntimeFailureReason(error: unknown) {
  if (error instanceof AssistantRuntimeFailure) return error.failureReason;
  if (error instanceof Error) return error.message;
  return 'provider_failed';
}
