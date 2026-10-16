export type GenerateOptions = {
  failOnMaxTokens?: boolean;
  signal?: AbortSignal;
};

export type TextPayload = {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
};
