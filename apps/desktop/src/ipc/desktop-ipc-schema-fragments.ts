import { z } from 'zod';
import {
  MAX_EBOOK_IMPORT_BYTES,
  MAX_PDF_IMPORT_BYTES,
  MAX_TEXT_IMPORT_BYTES,
} from '../ipc-contract';
import type { DesktopIpcInvokeChannel } from '../ipc-contract';
import type { DesktopIpcSchemaMap } from './desktop-ipc-schema-types';

const idSchema = z.string().min(1).max(256);
const requestIdSchema = z.string().min(1).max(128);
const fileNameSchema = z.string().min(1).max(512);
const mimeTypeSchema = z.string().min(1).max(255).optional();
const httpUrlSchema = z.string().min(1).max(4096).refine(isHttpUrl);
const arrayBufferSchema = z.custom<ArrayBuffer>(isArrayBuffer);
const textFormatSchema = z.enum(['plain', 'markdown']);
const textBodySchema = z.string().max(20_000_000);
const textPrepareInputSchema = z.union([
  z.object({ kind: z.literal('paste'), content: textBodySchema, format: textFormatSchema }),
  z.object({
    kind: z.literal('files'),
    files: z
      .array(
        z.object({
          fileName: fileNameSchema,
          data: arrayBufferSchema.refine((value) => value.byteLength <= MAX_TEXT_IMPORT_BYTES),
        }),
      )
      .min(1)
      .max(50),
  }),
]);
const textCommitInputSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(1000),
        author: z.string().max(1000).optional(),
        format: textFormatSchema,
        body: textBodySchema,
      }),
    )
    .min(1)
    .max(50),
});
const appLockPinSchema = z.string().regex(/^\d{4}$/);
const appLockShortcutSchema = z.string().trim().min(1).max(80).nullable();
const collectionNameSchema = z.string().trim().min(1).max(160);
const contentRefSchema = z.object({
  id: idSchema,
  kind: z.enum(['article', 'weread']),
});
const articleTranslationRequestSchema = z.object({
  articleId: idSchema,
  force: z.boolean().optional(),
  sourceBlockIds: z.array(z.string().min(1).max(160)).optional(),
  targetLanguage: z.string().min(1).max(80).optional(),
});

export const appLockIpcInvokeSchemas = {
  'appLock:setEnabled': z.tuple([
    z.object({
      enabled: z.boolean(),
      pin: appLockPinSchema.optional(),
    }),
  ]),
  'appLock:setLocked': z.tuple([
    z.object({
      locked: z.boolean(),
    }),
  ]),
  'appLock:setPin': z.tuple([
    z.object({
      confirmPin: appLockPinSchema,
      pin: appLockPinSchema,
    }),
  ]),
  'appLock:setShortcut': z.tuple([
    z.object({
      shortcut: appLockShortcutSchema,
    }),
  ]),
  'appLock:verifyPin': z.tuple([
    z.object({
      pin: appLockPinSchema,
    }),
  ]),
  'appLock:unlock': z.tuple([
    z.object({
      pin: appLockPinSchema,
    }),
  ]),
} satisfies DesktopIpcSchemaMap;

export const articleIpcInvokeSchemas = {
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
  'text:import-prepare': z.tuple([textPrepareInputSchema]),
  'text:import-commit': z.tuple([textCommitInputSchema]),
} satisfies DesktopIpcSchemaMap;

export const dataIpcInvokeSchemas = {
  'data:open-path': z.tuple([z.enum(['dataDir', 'logFile', 'databaseFile'])]),
} satisfies DesktopIpcSchemaMap;

export const libraryCollectionIpcInvokeSchemas = {
  'library-collection:add-members': z.tuple([
    z.object({
      collectionId: idSchema,
      members: z.array(contentRefSchema).max(500),
    }),
  ]),
  'library-collection:create': z.tuple([
    z.object({
      name: collectionNameSchema,
    }),
  ]),
  'library-collection:delete': z.tuple([idSchema]),
  'library-collection:remove-member': z.tuple([
    z.object({
      collectionId: idSchema,
      member: contentRefSchema,
    }),
  ]),
  'library-collection:rename': z.tuple([
    z.object({
      collectionId: idSchema,
      name: collectionNameSchema,
    }),
  ]),
  'library-pin:set': z.tuple([
    z.object({
      pinned: z.boolean(),
      target: z.object({
        id: idSchema,
        kind: z.enum(['article', 'weread', 'collection']),
      }),
    }),
  ]),
} satisfies DesktopIpcSchemaMap;

export const wereadIpcInvokeSchemas = {
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
      openMethod: z.enum(['deeplink', 'web']).optional(),
      removeApiKey: z.boolean().optional(),
      syncMode: z.enum(['manual', 'auto']).optional(),
    }),
  ]),
  'weread:sync-book': z.tuple([idSchema]),
  'weread:test': z.tuple([z.string().max(4096).optional()]),
} satisfies DesktopIpcSchemaMap;

export const highRiskDesktopIpcSchemaChannels = [
  'article:import-url',
  'article:import-url-cancel',
  'ebook:import-file',
  'ebook:read-file',
  'pdf:import-file',
  'pdf:read-file',
  'pdf:get-thumbnail',
  'text:import-prepare',
  'text:import-commit',
  'data:open-path',
  'appLock:setEnabled',
  'appLock:setPin',
  'appLock:verifyPin',
  'appLock:unlock',
  'weread:save-settings',
  'weread:test',
  'weread:sync-book',
  'weread:get-book',
  'weread:open',
  'weread:query-reading-stats',
  'library-collection:add-members',
  'library-collection:create',
  'library-collection:delete',
  'library-collection:remove-member',
  'library-collection:rename',
  'library-pin:set',
] satisfies DesktopIpcInvokeChannel[];

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
