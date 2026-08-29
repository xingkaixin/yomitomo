import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import type { ImmutableObjectStore, ObjectCreation, StoredObject } from './model-publication.ts';

export class R2ObjectStore implements ImmutableObjectStore {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(client: S3Client, bucket: string) {
    this.client = client;
    this.bucket = bucket;
  }

  async inspect(key: string): Promise<StoredObject | null> {
    try {
      const object = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (object.ContentLength === undefined) {
        throw new Error(`${key} does not have a stored content length`);
      }
      return {
        sizeBytes: object.ContentLength,
        sha256: object.Metadata?.sha256,
        contentType: object.ContentType,
        contentEncoding: object.ContentEncoding,
      };
    } catch (error) {
      if (hasStatus(error, 404)) return null;
      throw error;
    }
  }

  async create(input: ObjectCreation): Promise<'created' | 'exists'> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: createReadStream(input.filePath),
          ContentLength: input.sizeBytes,
          ContentMD5: input.md5Base64,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
          Metadata: { sha256: input.sha256 },
          IfNoneMatch: '*',
        }),
      );
      return 'created';
    } catch (error) {
      if (hasStatus(error, 412)) return 'exists';
      throw error;
    }
  }

  async read(key: string): Promise<AsyncIterable<Uint8Array>> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!object.Body || !isAsyncIterable(object.Body)) {
      throw new Error(`${key} does not have a readable body`);
    }
    return object.Body;
  }
}

export function createR2ObjectStore(environment: NodeJS.ProcessEnv = process.env) {
  const bucket = environment.R2_BUCKET_NAME || 'yomitomo-model-assets';
  return new R2ObjectStore(new S3Client(r2ClientConfiguration(environment)), bucket);
}

export function r2ClientConfiguration(environment: NodeJS.ProcessEnv): S3ClientConfig {
  const accountId = requiredEnvironmentValue(environment, 'CLOUDFLARE_ACCOUNT_ID');
  const accessKeyId = requiredEnvironmentValue(environment, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnvironmentValue(environment, 'R2_SECRET_ACCESS_KEY');

  return {
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: 'auto',
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId, secretAccessKey },
  };
}

function requiredEnvironmentValue(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function hasStatus(error: unknown, status: number) {
  return error instanceof S3ServiceException && error.$metadata.httpStatusCode === status;
}

function isAsyncIterable(value: object): value is AsyncIterable<Uint8Array> {
  return Symbol.asyncIterator in value;
}
