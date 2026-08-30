import { ARTICLE_SOURCE_TYPES, type TextAnchor } from '@yomitomo/shared';
import { z } from 'zod';
import type { ReadingRelationsSearchInput } from './reading-memory-domain';

const idSchema = z.string().min(1).max(256);
const requestIdSchema = z.string().min(1).max(128);
const textSchema = z.string().max(100_000);
const offsetSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ratioSchema = z.number().min(0).max(1);
const pageSizeSchema = z.number().positive().max(Number.MAX_SAFE_INTEGER);

const textAnchorShape = {
  exact: textSchema,
  prefix: textSchema,
  suffix: textSchema,
  start: offsetSchema,
  end: offsetSchema,
  paragraphId: idSchema.optional(),
  chapterId: idSchema.optional(),
  segmentId: idSchema.optional(),
  textStartInParagraph: offsetSchema.optional(),
  textEndInParagraph: offsetSchema.optional(),
  textStartInBook: offsetSchema.optional(),
  textEndInBook: offsetSchema.optional(),
  quoteHash: z.string().max(256).optional(),
};

const textAnchorSchema = z.strictObject(textAnchorShape).refine(hasOrderedTextRanges);
const pdfTextAnchorSchema = z
  .strictObject({
    ...textAnchorShape,
    kind: z.literal('pdf-text'),
    pageIndex: offsetSchema,
    pageWidth: pageSizeSchema,
    pageHeight: pageSizeSchema,
    rects: z
      .array(
        z.strictObject({
          x: ratioSchema,
          y: ratioSchema,
          width: ratioSchema,
          height: ratioSchema,
        }),
      )
      .max(4096),
  })
  .refine(hasOrderedTextRanges);

const readerQuestionContextSchema = z.strictObject({
  sourceType: z.enum(ARTICLE_SOURCE_TYPES),
  quote: textSchema.min(1),
  title: z.string().max(10_000).optional(),
  locationLabel: z.string().max(1000).optional(),
  anchor: z.union([pdfTextAnchorSchema, textAnchorSchema]).optional(),
  nearbyText: textSchema.optional(),
});

const searchArgsSchema: z.ZodType<[ReadingRelationsSearchInput]> = z.tuple([
  z.strictObject({
    requestId: requestIdSchema,
    articleId: idSchema,
    context: readerQuestionContextSchema,
    question: z.string().max(10_000).optional(),
  }),
]);

const requestArgsSchema = z.tuple([z.strictObject({ requestId: requestIdSchema })]);

export const readingMemoryIpcInvokeSchemas = {
  'reading-memory:relations:search': searchArgsSchema,
  'reading-memory:relations:judge': requestArgsSchema,
  'reading-memory:relations:cancel': requestArgsSchema,
};

export type ReadingMemoryIpcSchemaArgs<Channel extends keyof typeof readingMemoryIpcInvokeSchemas> =
  z.output<(typeof readingMemoryIpcInvokeSchemas)[Channel]>;

function hasOrderedTextRanges(anchor: TextAnchor): boolean {
  return (
    anchor.end >= anchor.start &&
    (anchor.textStartInParagraph === undefined ||
      anchor.textEndInParagraph === undefined ||
      anchor.textEndInParagraph >= anchor.textStartInParagraph) &&
    (anchor.textStartInBook === undefined ||
      anchor.textEndInBook === undefined ||
      anchor.textEndInBook >= anchor.textStartInBook)
  );
}
