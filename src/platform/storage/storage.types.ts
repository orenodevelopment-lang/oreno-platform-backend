/**
 * Storage abstraction.
 *
 * All physical buckets are private. A client never receives an S3 URL; it receives either
 * a short-lived pre-signed URL (uploads and private downloads) or a CloudFront
 * URL (files that are deliberately publishable, such as a company logo).
 *
 * The driver is selected by `STORAGE_DRIVER`. `local` writes to disk and is
 * rejected outright in production by the environment schema; `s3` is the real
 * implementation and needs no code change to enable.
 */
export type BucketKind = 'public' | 'private' | 'quarantine' | 'exports';

export interface ObjectLocation {
  bucket: BucketKind;
  key: string;
  /** Exact S3 object version. Local storage ignores this value. */
  versionId?: string;
}

export interface CreateUploadUrlInput {
  bucket: BucketKind;
  key: string;
  contentType: string;
  /** Upper bound the signature enforces, so a client cannot upload more. */
  contentLength: number;
  expiresInSeconds: number;
}

export interface PresignedUpload {
  uploadUrl: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  /** Form fields for a POST policy upload; empty for PUT. */
  fields?: Record<string, string>;
  storageKey: string;
  expiresAt: Date;
}

export interface CreateDownloadUrlInput {
  bucket: BucketKind;
  key: string;
  expiresInSeconds: number;
  /** Forces a download with the given filename rather than inline display. */
  downloadFilename?: string;
  contentType?: string;
}

export interface ObjectMetadata {
  size: number;
  contentType?: string;
  etag?: string;
  versionId?: string;
}

export interface CopyObjectOptions {
  /** Refuse the copy if the selected source version no longer has this ETag. */
  sourceEtag?: string;
}

export interface StorageAdapter {
  readonly name: string;
  /** Whether downloads for the logical public area go through CloudFront. */
  readonly supportsPublicDelivery: boolean;

  createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUpload>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  headObject(location: ObjectLocation): Promise<ObjectMetadata | undefined>;
  putObject(location: ObjectLocation, body: Buffer | string, contentType?: string): Promise<void>;
  getObject(location: ObjectLocation): Promise<Buffer>;
  getObjectTags(location: ObjectLocation): Promise<Record<string, string>>;
  deleteObject(location: ObjectLocation): Promise<void>;
  /** Server-side copy, used to promote a file out of quarantine. */
  copyObject(from: ObjectLocation, to: ObjectLocation, options?: CopyObjectOptions): Promise<void>;

  /**
   * A directly usable URL for a deliberately public object. Returns a
   * CloudFront URL when configured; otherwise a pre-signed private URL is
   * returned so behaviour never silently becomes "world readable".
   */
  publicUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}
