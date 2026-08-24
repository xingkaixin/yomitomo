export type AnnotationOutputFormat = 'json' | 'ndjson';

export const MULTI_ANNOTATION_OUTPUT_FRAMING = {
  json: `请返回 JSON 数组，每个元素是一条完整批注。没有值得批注的内容时返回空数组。

只返回 JSON，不要输出 Markdown。`,
  ndjson: `请用 NDJSON 返回批注，每一行是一个完整 JSON 对象。每发现一条值得批注的内容，就立刻输出一行；没有值得批注的内容时不输出任何行。

只输出 NDJSON，不要输出 Markdown，不要输出数组。`,
} as const satisfies Record<AnnotationOutputFormat, string>;
