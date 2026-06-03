export type GenerateOptions = {
  failOnMaxTokens?: boolean;
};

export type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  description?: string;
};

export type ResponseSchema = {
  name: string;
  schema: JsonSchema;
  strict?: boolean;
};

export type TextPayload = {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  responseSchema?: ResponseSchema;
};
