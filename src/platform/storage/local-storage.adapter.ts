import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { loadConfig } from '../../config/index.js';
import { StorageError, type BucketKind, type ObjectMetadata } from './storage.types.js';

/**
 * Local filesystem storage driver.
 *
 * Exists so the whole upload flow — pre-signed URL, direct upload, download,
 * quarantine promotion — can be exercised in development and in the integration
 * suite without cloud credentials. `STORAGE_DRIVER=local` is rejected in
 * production by the environment schema, so this adapter can never serve a live
 * deployment.
 *
 * The "pre-signed URL" is an HMAC-signed link to an API route that performs the
 * same transfer, which keeps the client contract identical to the S3 driver.
 */
interface LocalTokenPayload {
  bucket: BucketKind;
  key: string;
  contentType?: string;
  maxBytes?: number;
  purpose: 'upload' | 'download';
  expiresAt: number;
  filename?: string;
}

function sign(payload: string): string {
  return createHmac('sha256', loadConfig().session.secret).update(payload).digest('base64url');
}

function encodeToken(payload: LocalTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeLocalToken(token: string): LocalTokenPayload {
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new StorageError('Malformed storage token', 'decodeToken');

  const expected = sign(body);
  const provided = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    throw new StorageError('Invalid storage token signature', 'decodeToken');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LocalTokenPayload;
  if (payload.expiresAt <= Date.now()) {
    throw new StorageError('Storage token has expired', 'decodeToken');
  }
  return payload;
}

function bucketRoot(bucket: BucketKind): string {
  const config = loadConfig();
  return resolve(config.storage.localDir, bucket);
}

/**
 * Resolve an object path and refuse anything that escapes the bucket root.
 * Object keys are generated server-side, but a traversal guard here means a
 * future caller that accepts a user-supplied key cannot read `/etc/passwd`.
 */
function objectPath(bucket: BucketKind, key: string): string {
  const root = bucketRoot(bucket);
  const candidate = resolve(root, normalize(key).replace(/^([/\\])+/, ''));
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    throw new StorageError('Object key escapes the bucket root', 'resolve');
  }
  return candidate;
}

function apiUrl(path: string): string {
  return `${loadConfig().apiUrl.replace(/\/$/, '')}${path}`;
}

export class LocalStorageAdapter {
  readonly name = 'local';
  readonly supportsPublicDelivery = false;

  createUploadUrl(input: {
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
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
    const token = encodeToken({
      bucket: input.bucket,
      key: input.key,
      contentType: input.contentType,
      maxBytes: input.contentLength,
      purpose: 'upload',
      expiresAt: expiresAt.getTime(),
    });

    return Promise.resolve({
      uploadUrl: apiUrl(`/api/v1/storage/local/upload?token=${encodeURIComponent(token)}`),
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      storageKey: input.key,
      expiresAt,
    });
  }

  createDownloadUrl(input: {
    bucket: BucketKind;
    key: string;
    expiresInSeconds: number;
    downloadFilename?: string;
  }): Promise<string> {
    const expiresAt = Date.now() + input.expiresInSeconds * 1000;
    const token = encodeToken({
      bucket: input.bucket,
      key: input.key,
      purpose: 'download',
      expiresAt,
      ...(input.downloadFilename ? { filename: input.downloadFilename } : {}),
    });
    return Promise.resolve(
      apiUrl(`/api/v1/storage/local/download?token=${encodeURIComponent(token)}`),
    );
  }

  async headObject(location: {
    bucket: BucketKind;
    key: string;
  }): Promise<ObjectMetadata | undefined> {
    try {
      const info = await stat(objectPath(location.bucket, location.key));
      return { size: info.size };
    } catch {
      return undefined;
    }
  }

  async putObject(
    location: { bucket: BucketKind; key: string },
    body: Buffer | string,
    _contentType?: string,
  ): Promise<void> {
    const target = objectPath(location.bucket, location.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  /** Stream a request body straight to disk without buffering it in memory. */
  async putStream(
    location: { bucket: BucketKind; key: string },
    source: NodeJS.ReadableStream,
  ): Promise<number> {
    const target = objectPath(location.bucket, location.key);
    await mkdir(dirname(target), { recursive: true });
    await pipeline(source, createWriteStream(target));
    const info = await stat(target);
    return info.size;
  }

  async getObject(location: { bucket: BucketKind; key: string }): Promise<Buffer> {
    try {
      return await readFile(objectPath(location.bucket, location.key));
    } catch (error) {
      throw new StorageError('Object not found', 'getObject', error);
    }
  }

  getObjectTags(_location: { bucket: BucketKind; key: string }): Promise<Record<string, string>> {
    return Promise.resolve({});
  }

  createReadStream(location: { bucket: BucketKind; key: string }): NodeJS.ReadableStream {
    return createReadStream(objectPath(location.bucket, location.key));
  }

  async deleteObject(location: { bucket: BucketKind; key: string }): Promise<void> {
    await rm(objectPath(location.bucket, location.key), { force: true });
  }

  async copyObject(
    from: { bucket: BucketKind; key: string },
    to: { bucket: BucketKind; key: string },
  ): Promise<void> {
    const target = objectPath(to.bucket, to.key);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(objectPath(from.bucket, from.key), target);
  }

  async publicUrl(key: string, expiresInSeconds: number): Promise<string> {
    // No CDN locally; fall back to a signed link so nothing is world-readable.
    return this.createDownloadUrl({ bucket: 'public', key, expiresInSeconds });
  }
}

export function localObjectPathForTest(bucket: BucketKind, key: string): string {
  return join(bucketRoot(bucket), key);
}
