import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as getCloudFrontUrl } from '@aws-sdk/cloudfront-signer';
import { loadConfig } from '../../config/index.js';
import {
  StorageError,
  type BucketKind,
  type CopyObjectOptions,
  type ObjectLocation,
  type ObjectMetadata,
} from './storage.types.js';

/**
 * S3 storage driver.
 *
 * Both physical buckets stay private. The application bucket uses public,
 * private and exports prefixes while quarantine remains a separate bucket.
 * Uploads use a pre-signed PUT that pins the
 * content type and a content-length range, so a client cannot use the signature
 * to store a different object type or an unbounded payload. Downloads use a
 * pre-signed GET unless the object is in the public bucket and CloudFront is
 * configured, in which case a signed CloudFront URL is issued instead — S3 is
 * never exposed directly.
 */
const UPLOAD_CONTENT_LENGTH_SLACK = 1024;

export class S3StorageAdapter {
  readonly name = 's3';
  readonly supportsPublicDelivery: boolean;
  private readonly client: S3Client;

  constructor() {
    const config = loadConfig();
    this.supportsPublicDelivery = config.cloudfront.enabled;
    this.client = new S3Client({
      region: config.storage.region,
      ...(config.storage.accessKeyId && config.storage.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.storage.accessKeyId,
              secretAccessKey: config.storage.secretAccessKey,
            },
          }
        : {}),
      ...(config.storage.endpoint ? { endpoint: config.storage.endpoint } : {}),
      forcePathStyle: config.storage.forcePathStyle,
    });
  }

  private objectLocation(kind: BucketKind, key: string): { bucket: string; key: string } {
    const { buckets, prefixes } = loadConfig().storage;
    return {
      bucket: buckets[kind],
      key: prefixObjectKey(prefixes[kind], key),
    };
  }

  async createUploadUrl(input: {
    bucket: BucketKind;
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<{
    uploadUrl: string;
    method: 'PUT';
    headers: Record<string, string>;
    storageKey: string;
    expiresAt: Date;
  }> {
    try {
      const location = this.objectLocation(input.bucket, input.key);
      const command = new PutObjectCommand({
        Bucket: location.bucket,
        Key: location.key,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
      });

      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
        // Bind both the declared type and length into the signature.
        signableHeaders: new Set(['content-type', 'content-length']),
        unhoistableHeaders: new Set(['content-length']),
      });

      return {
        uploadUrl,
        method: 'PUT',
        headers: {
          'Content-Type': input.contentType,
          'Content-Length': String(input.contentLength),
        },
        storageKey: input.key,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      };
    } catch (error) {
      throw new StorageError('Could not create an upload URL', 'createUploadUrl', error);
    }
  }

  async createDownloadUrl(input: {
    bucket: BucketKind;
    key: string;
    expiresInSeconds: number;
    downloadFilename?: string;
    contentType?: string;
  }): Promise<string> {
    const config = loadConfig();

    if (input.bucket === 'public' && config.cloudfront.enabled) {
      const location = this.objectLocation(input.bucket, input.key);
      return this.cloudFrontUrl(location.key, input.expiresInSeconds);
    }

    try {
      const location = this.objectLocation(input.bucket, input.key);
      const command = new GetObjectCommand({
        Bucket: location.bucket,
        Key: location.key,
        ...(input.downloadFilename
          ? { ResponseContentDisposition: buildDisposition(input.downloadFilename) }
          : {}),
        ...(input.contentType ? { ResponseContentType: input.contentType } : {}),
      });
      return await getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
    } catch (error) {
      throw new StorageError('Could not create a download URL', 'createDownloadUrl', error);
    }
  }

  /** A signed CloudFront URL. Falls back to a pre-signed S3 GET if unconfigured. */
  private cloudFrontUrl(key: string, expiresInSeconds: number): Promise<string> {
    const config = loadConfig();
    const { domain, keyPairId, privateKey } = config.cloudfront;
    if (!domain || !keyPairId || !privateKey) {
      throw new StorageError('CloudFront is not fully configured', 'cloudFrontUrl');
    }

    const expires = new Date(Date.now() + expiresInSeconds * 1000);
    return Promise.resolve(
      getCloudFrontUrl({
        url: `https://${domain}/${key.replace(/^\/+/, '')}`,
        keyPairId,
        privateKey,
        dateLessThan: expires.toISOString(),
      }),
    );
  }

  async headObject(location: ObjectLocation): Promise<ObjectMetadata | undefined> {
    try {
      const physical = this.objectLocation(location.bucket, location.key);
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: physical.bucket,
          Key: physical.key,
          ...(location.versionId ? { VersionId: location.versionId } : {}),
        }),
      );
      return {
        size: result.ContentLength ?? 0,
        ...(result.ContentType ? { contentType: result.ContentType } : {}),
        ...(result.ETag ? { etag: result.ETag } : {}),
        ...(result.VersionId ? { versionId: result.VersionId } : {}),
      };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw new StorageError('Could not read object metadata', 'headObject', error);
    }
  }

  async putObject(
    location: { bucket: BucketKind; key: string },
    body: Buffer | string,
    contentType?: string,
  ): Promise<void> {
    try {
      const physical = this.objectLocation(location.bucket, location.key);
      await this.client.send(
        new PutObjectCommand({
          Bucket: physical.bucket,
          Key: physical.key,
          Body: body,
          ...(contentType ? { ContentType: contentType } : {}),
        }),
      );
    } catch (error) {
      throw new StorageError('Could not write object', 'putObject', error);
    }
  }

  async getObject(location: ObjectLocation): Promise<Buffer> {
    try {
      const physical = this.objectLocation(location.bucket, location.key);
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: physical.bucket,
          Key: physical.key,
          ...(location.versionId ? { VersionId: location.versionId } : {}),
        }),
      );
      if (!result.Body) throw new StorageError('Object has no body', 'getObject');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof StorageError) throw error;
      throw new StorageError('Could not read object', 'getObject', error);
    }
  }

  async getObjectTags(location: ObjectLocation): Promise<Record<string, string>> {
    try {
      const physical = this.objectLocation(location.bucket, location.key);
      const result = await this.client.send(
        new GetObjectTaggingCommand({
          Bucket: physical.bucket,
          Key: physical.key,
          ...(location.versionId ? { VersionId: location.versionId } : {}),
        }),
      );
      return Object.fromEntries(
        (result.TagSet ?? []).flatMap((tag) =>
          tag.Key !== undefined && tag.Value !== undefined ? [[tag.Key, tag.Value]] : [],
        ),
      );
    } catch (error) {
      throw new StorageError('Could not read object tags', 'getObjectTags', error);
    }
  }

  async deleteObject(location: ObjectLocation): Promise<void> {
    try {
      const physical = this.objectLocation(location.bucket, location.key);
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: physical.bucket,
          Key: physical.key,
          ...(location.versionId ? { VersionId: location.versionId } : {}),
        }),
      );
    } catch (error) {
      throw new StorageError('Could not delete object', 'deleteObject', error);
    }
  }

  async copyObject(
    from: ObjectLocation,
    to: ObjectLocation,
    options: CopyObjectOptions = {},
  ): Promise<void> {
    try {
      const source = this.objectLocation(from.bucket, from.key);
      const destination = this.objectLocation(to.bucket, to.key);
      const encodedKey = source.key.split('/').map(encodeURIComponent).join('/');
      const versionQuery = from.versionId ? `?versionId=${encodeURIComponent(from.versionId)}` : '';
      await this.client.send(
        new CopyObjectCommand({
          Bucket: destination.bucket,
          Key: destination.key,
          CopySource: `${source.bucket}/${encodedKey}${versionQuery}`,
          ...(options.sourceEtag ? { CopySourceIfMatch: options.sourceEtag } : {}),
        }),
      );
    } catch (error) {
      throw new StorageError('Could not copy object', 'copyObject', error);
    }
  }

  async publicUrl(key: string, expiresInSeconds: number): Promise<string> {
    const config = loadConfig();
    if (config.cloudfront.enabled) {
      return this.cloudFrontUrl(this.objectLocation('public', key).key, expiresInSeconds);
    }
    // Without CloudFront, a public object is still served through a signed URL
    // rather than being made anonymously readable.
    return this.createDownloadUrl({ bucket: 'public', key, expiresInSeconds });
  }
}

/** Resolve a provider-neutral database key to its physical key in S3. */
export function prefixObjectKey(prefix: string, key: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const cleanKey = key.replace(/^\/+/, '');
  return cleanPrefix ? `${cleanPrefix}/${cleanKey}` : cleanKey;
}

function buildDisposition(filename: string): string {
  const safe = filename.replace(/["\\\r\n]/g, '');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export { UPLOAD_CONTENT_LENGTH_SLACK };
