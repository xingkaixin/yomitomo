import { z, type ZodType } from 'zod';
import {
  MAX_EBOOK_IMPORT_BYTES,
  MAX_PDF_IMPORT_BYTES,
  type DesktopIpcInvokeArgs,
  type DesktopIpcInvokeChannel,
} from './ipc-contract';
import { DesktopIpcError, desktopIpcErrorCodes } from './ipc-errors';

type DesktopIpcArgsSchema<Channel extends DesktopIpcInvokeChannel> = ZodType<
  DesktopIpcInvokeArgs<Channel>
>;

type DesktopIpcSchemaMap = {
  [Channel in DesktopIpcInvokeChannel]?: DesktopIpcArgsSchema<Channel>;
};

const idSchema = z.string().min(1).max(256);
const requestIdSchema = z.string().min(1).max(128);
const fileNameSchema = z.string().min(1).max(512);
const mimeTypeSchema = z.string().min(1).max(255).optional();
const httpUrlSchema = z.string().min(1).max(4096).refine(isHttpUrl);
const arrayBufferSchema = z.custom<ArrayBuffer>(isArrayBuffer);
const articleTranslationRequestSchema = z.object({
  articleId: idSchema,
  force: z.boolean().optional(),
  sourceBlockIds: z.array(z.string().min(1).max(160)).optional(),
  targetLanguage: z.string().min(1).max(80).optional(),
});

const desktopIpcInvokeSchemas: DesktopIpcSchemaMap = {
  'article-translation:get-current': z.tuple([articleTranslationRequestSchema]),
  'article-translation:translate': z.tuple([articleTranslationRequestSchema]),
  'article-translation:delete-current': z.tuple([
    articleTranslationRequestSchema.pick({ articleId: true, targetLanguage: true }),
  ]),
  'article:import-url': z.tuple([
    z.union([
      httpUrlSchema,
      z.object({
        requestId: requestIdSchema.optional(),
        url: httpUrlSchema,
      }),
    ]),
  ]),
  'article:import-url-cancel': z.tuple([requestIdSchema]),
  'data:open-path': z.tuple([z.enum(['dataDir', 'logFile', 'databaseFile'])]),
  'ebook:import-file': z.tuple([
    z.object({
      data: arrayBufferSchema.refine((value) => value.byteLength <= MAX_EBOOK_IMPORT_BYTES),
      fileName: fileNameSchema,
      mimeType: mimeTypeSchema,
    }),
  ]),
  'ebook:read-file': z.tuple([idSchema]),
  'pdf:get-thumbnail': z.tuple([idSchema]),
  'pdf:import-file': z.tuple([
    z.object({
      data: arrayBufferSchema.refine((value) => value.byteLength <= MAX_PDF_IMPORT_BYTES),
      fileName: fileNameSchema,
      mimeType: mimeTypeSchema,
    }),
  ]),
  'pdf:read-file': z.tuple([idSchema]),
  'weread:get-book': z.tuple([idSchema]),
  'weread:open': z.tuple([
    z.object({
      bookId: idSchema,
      chapterUid: z.number().int().nonnegative().optional(),
      range: z.string().min(1).max(256).optional(),
      userVid: z.number().int().nonnegative().optional(),
    }),
  ]),
  'weread:query-reading-stats': z.tuple([
    z.object({
      baseTime: z.number().int().nonnegative().optional(),
      mode: z.enum(['weekly', 'monthly', 'annually', 'overall']),
    }),
  ]),
  'weread:save-settings': z.tuple([
    z.object({
      apiKey: z.string().max(4096).optional(),
      openMethod: z.enum(['deeplink', 'web']),
      removeApiKey: z.boolean().optional(),
    }),
  ]),
  'weread:sync-book': z.tuple([idSchema]),
  'weread:test': z.tuple([z.string().max(4096).optional()]),
};

export function validateDesktopIpcInvokeArgs<Channel extends DesktopIpcInvokeChannel>(
  channel: Channel,
  args: DesktopIpcInvokeArgs<Channel>,
): DesktopIpcInvokeArgs<Channel> {
  const schema = desktopIpcInvokeSchemas[channel];
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

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}
