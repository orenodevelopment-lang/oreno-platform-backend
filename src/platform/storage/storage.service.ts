import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { loadConfig } from '../../config/index.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { LocalStorageAdapter, decodeLocalToken } from './local-storage.adapter.js';
import { S3StorageAdapter } from './s3-storage.adapter.js';
import type { BucketKind, StorageAdapter } from './storage.types.js';
import { StorageError } from './storage.types.js';

const log = createModuleLogger('storage');

/**
 * Storage facade.
 *
 * The rest of the application depends on `StorageAdapter`, never on a driver.
 * That is what makes "the S3 credentials are not available yet" a configuration
 * problem rather than a code change.
 */
let adapter: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  if (adapter) return adapter;

  const config = loadConfig();
  adapter = config.storage.driver === 's3' ? new S3StorageAdapter() : new LocalStorageAdapter();

  log.info({ driver: adapter.name }, 'storage adapter initialised');
  return adapter;
}

export function getLocalStorage(): LocalStorageAdapter | undefined {
  const instance = getStorage();
  return instance instanceof LocalStorageAdapter ? instance : undefined;
}

export function resetStorage(): void {
  adapter = undefined;
}

/**
 * Generate an opaque, partitioned object key.
 *
 * The organisation id is the first path segment so an operator (and a future
 * bucket policy) can reason about tenancy from the key alone, and the random
 * component means a key can never be guessed from a file id.
 */
export function buildObjectKey(input: {
  organisationId?: string | undefined;
  category: string;
  filename: string;
}): string {
  const now = new Date();
  const partition = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const extension = extname(input.filename).toLowerCase().slice(0, 12);
  const tenant = input.organisationId ?? 'platform';
  return `${tenant}/${input.category.toLowerCase()}/${partition}/${randomUUID()}${extension}`;
}

export function bucketForCategory(category: string): BucketKind {
  switch (category) {
    // Only genuinely public assets belong in the public storage area: a profile photo
    // and an organisation logo are shown to anyone who can see the profile.
    // Every other category is private and served through a signed URL.
    case 'PROFILE_PHOTO':
    case 'ORGANISATION_LOGO':
    case 'PUBLIC_ASSET':
      return 'public';
    case 'EXPORT':
    case 'PAYROLL_REPORT':
      return 'exports';
    default:
      return 'private';
  }
}

export { decodeLocalToken, StorageError };
export type { BucketKind, StorageAdapter } from './storage.types.js';
