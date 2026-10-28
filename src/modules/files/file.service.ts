import type { FileObject } from '@prisma/client';
import { getPrisma } from '../../database/prisma.js';
import { loadConfig } from '../../config/index.js';
import {
  DependencyUnavailableError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { reportError } from '../../common/observability/error-monitor.js';
import { increment, MetricName } from '../../common/observability/metrics.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import {
  enqueue,
  isQueueingEnabled,
  JOB_NAMES,
  QUEUE_NAMES,
  stableJobId,
} from '../../platform/queue/queue.registry.js';
import {
  bucketForCategory,
  buildObjectKey,
  getStorage,
} from '../../platform/storage/storage.service.js';
import { getMalwareScanner } from '../../platform/storage/malware-scanner.js';
import { interpretGuardDutyTags } from '../../platform/storage/guardduty-scan.js';
import type { BucketKind } from '../../platform/storage/storage.types.js';
import type { AuthContext } from '../auth/index.js';

const log = createModuleLogger('files');
const GUARDDUTY_RECONCILE_BATCH_SIZE = 50;

const MIME_ALLOWLIST: Record<string, readonly string[]> = {
  PROFILE_PHOTO: ['image/jpeg', 'image/png', 'image/webp'],
  CV: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  CERTIFICATION: ['application/pdf', 'image/jpeg', 'image/png'],
  PORTFOLIO: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  ORGANISATION_LOGO: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  MESSAGE_ATTACHMENT: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'],
};

function assertCategoryAccess(auth: AuthContext, category: string, organisationId?: string): void {
  if (organisationId) {
    const scoped = auth.organisationId === organisationId && auth.membershipStatus === 'ACTIVE';
    const allowed = scoped && auth.organisationPermissions.has('file:upload');
    if (!allowed && !auth.platformPermissions.has('file:upload')) {
      throw new NotFoundError(ErrorCode.ORGANISATION_NOT_FOUND, 'That organisation was not found.');
    }
  }
  if (category === 'PAYROLL_REPORT' || category === 'EXPORT') {
    if (
      !auth.organisationPermissions.has('export:create') &&
      !auth.platformPermissions.has('export:create')
    ) {
      throw new NotFoundError(
        ErrorCode.RESOURCE_ACCESS_DENIED,
        'That file category is not available.',
      );
    }
  }
}

export async function initiateUpload(
  auth: AuthContext,
  input: {
    category: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    organisationId?: string;
  },
) {
  const config = loadConfig();
  if (input.sizeBytes > config.storage.maxUploadBytes)
    throw new UnprocessableError(
      ErrorCode.FILE_SIZE_EXCEEDED,
      `Files may not exceed ${config.storage.maxUploadBytes} bytes.`,
    );
  const allowed = MIME_ALLOWLIST[input.category];
  if (allowed && !allowed.includes(input.mimeType.toLowerCase()))
    throw new UnprocessableError(
      ErrorCode.FILE_TYPE_NOT_ALLOWED,
      'That file type is not allowed for this category.',
    );
  assertCategoryAccess(auth, input.category, input.organisationId);
  const key = buildObjectKey({
    organisationId: input.organisationId,
    category: input.category,
    filename: input.originalName,
  });
  const upload = await getStorage().createUploadUrl({
    bucket: 'quarantine',
    key,
    contentType: input.mimeType,
    contentLength: input.sizeBytes,
    expiresInSeconds: config.storage.presignedUploadTtlSeconds,
  });
  const file = await getPrisma().fileObject.create({
    data: {
      organisationId: input.organisationId ?? null,
      ownerId: auth.userId,
      category: input.category as never,
      visibility: ['PROFILE_PHOTO', 'ORGANISATION_LOGO', 'PUBLIC_ASSET'].includes(input.category)
        ? 'PUBLIC'
        : 'PRIVATE',
      status: 'PENDING_UPLOAD',
      bucket: 'quarantine',
      storageKey: key,
      originalName: input.originalName,
      mimeType: input.mimeType.toLowerCase(),
      sizeBytes: BigInt(input.sizeBytes),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return { file: serialiseFile(file), upload: { ...upload, storageKey: undefined } };
}

export async function completeUpload(auth: AuthContext, fileId: string, checksumSha256?: string) {
  const prisma = getPrisma();
  const config = loadConfig();
  const file = await prisma.fileObject.findFirst({
    where: { id: fileId, ownerId: auth.userId, status: 'PENDING_UPLOAD' },
  });
  if (!file) throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That upload was not found.');
  const metadata = await getStorage().headObject({ bucket: 'quarantine', key: file.storageKey });
  if (!metadata)
    throw new UnprocessableError(
      ErrorCode.FILE_UPLOAD_NOT_COMPLETED,
      'The file has not been uploaded yet.',
    );
  if (metadata.size <= 0 || metadata.size > Number(file.sizeBytes))
    throw new UnprocessableError(
      ErrorCode.FILE_SIZE_EXCEEDED,
      'The uploaded file size does not match the declared size.',
    );
  const guardDuty = config.malwareScanner.driver === 'guardduty';
  if (guardDuty && !metadata.versionId) {
    throw new DependencyUnavailableError('File security scanning is temporarily unavailable.', {
      details: { reason: 'quarantine bucket versioning is not enabled' },
    });
  }

  const scanStartedAt = new Date();
  const transitioned = await prisma.fileObject.updateMany({
    where: { id: fileId, ownerId: auth.userId, status: 'PENDING_UPLOAD' },
    data: {
      status: 'SCANNING',
      sizeBytes: BigInt(metadata.size),
      checksumSha256: checksumSha256 ?? null,
      quarantineVersionId: guardDuty ? metadata.versionId : null,
      quarantineEtag: guardDuty ? (metadata.etag ?? null) : null,
      scanStartedAt,
      scanDeadlineAt: guardDuty
        ? new Date(
            scanStartedAt.getTime() + config.malwareScanner.guardDuty.timeoutMinutes * 60_000,
          )
        : null,
      expiresAt: null,
    },
  });
  if (transitioned.count !== 1) {
    throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That upload was not found.');
  }
  const updated = await prisma.fileObject.findUniqueOrThrow({ where: { id: fileId } });

  if (!guardDuty) {
    if (isQueueingEnabled())
      await enqueue(
        QUEUE_NAMES.FILES,
        JOB_NAMES.SCAN_FILE,
        { fileId },
        { jobId: stableJobId('scan-file', fileId) },
      );
    else await processFileScan(fileId);
  }
  return serialiseFile(updated);
}

export async function processFileScan(fileId: string): Promise<void> {
  if (loadConfig().malwareScanner.driver === 'guardduty') {
    await processGuardDutyFileScan(fileId);
    return;
  }
  const prisma = getPrisma();
  const file = await prisma.fileObject.findUnique({ where: { id: fileId } });
  if (!file || !['SCANNING', 'UPLOADED'].includes(file.status)) return;
  const source = { bucket: file.bucket as BucketKind, key: file.storageKey };
  const body = await getStorage().getObject(source);
  const scanner = getMalwareScanner();
  const started = Date.now();
  const scan = await scanner.scan(body);
  await prisma.fileScanResult.create({
    data: {
      fileId,
      scanner: scanner.name,
      status:
        scan.verdict === 'clean'
          ? scanner.name === 'none'
            ? 'SKIPPED'
            : 'CLEAN'
          : scan.verdict === 'infected'
            ? 'INFECTED'
            : 'FAILED',
      signature: scan.signature ?? null,
      detail: scan.detail ?? null,
      durationMs: Date.now() - started,
      completedAt: new Date(),
    },
  });
  if (scan.verdict !== 'clean') {
    await prisma.fileObject.update({
      where: { id: fileId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason:
          scan.verdict === 'infected'
            ? `Malware detected: ${scan.signature ?? 'unknown'}`
            : 'Malware scan failed',
      },
    });
    await emitEvent(prisma, {
      eventKey: EVENT_KEYS.FILE_SCAN_FAILED,
      aggregateType: 'FileObject',
      aggregateId: fileId,
      organisationId: file.organisationId,
      payload: { fileId },
    });
    return;
  }
  const destinationBucket = bucketForCategory(file.category);
  await getStorage().copyObject(source, { bucket: destinationBucket, key: file.storageKey });
  if (source.bucket !== destinationBucket) await getStorage().deleteObject(source);
  await prisma.$transaction(async (tx) => {
    await tx.fileObject.update({
      where: { id: fileId },
      data: {
        bucket: destinationBucket,
        status: 'READY',
        scannedAt: new Date(),
        readyAt: new Date(),
        rejectionReason: null,
      },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.FILE_SCAN_COMPLETED,
      aggregateType: 'FileObject',
      aggregateId: fileId,
      organisationId: file.organisationId,
      payload: { fileId },
    });
  });
}

export interface GuardDutyReconciliationSummary {
  checked: number;
  pending: number;
  clean: number;
  infected: number;
  failed: number;
}

type GuardDutyProcessingOutcome = 'pending' | 'clean' | 'infected' | 'failed' | 'skipped';

/** Reconcile scans in batches so pending objects survive worker restarts without failed jobs. */
export async function reconcileGuardDutyScans(
  batchSize = GUARDDUTY_RECONCILE_BATCH_SIZE,
): Promise<GuardDutyReconciliationSummary> {
  const summary: GuardDutyReconciliationSummary = {
    checked: 0,
    pending: 0,
    clean: 0,
    infected: 0,
    failed: 0,
  };
  if (loadConfig().malwareScanner.driver !== 'guardduty') return summary;

  const files = await getPrisma().fileObject.findMany({
    where: { status: 'SCANNING' },
    orderBy: [{ scanStartedAt: 'asc' }, { createdAt: 'asc' }],
    take: Math.max(1, Math.min(batchSize, 200)),
  });
  summary.checked = files.length;

  const outcomes = await Promise.allSettled(files.map((file) => processGuardDutyFileScan(file.id)));
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') {
      reportError(outcome.reason, { route: 'reconcileGuardDutyScans' });
      log.error({ err: outcome.reason }, 'guardduty reconciliation failed unexpectedly');
      summary.failed += 1;
      continue;
    }
    if (outcome.value !== 'skipped') summary[outcome.value] += 1;
  }
  return summary;
}

export async function processGuardDutyFileScan(
  fileId: string,
): Promise<GuardDutyProcessingOutcome> {
  const prisma = getPrisma();
  const file = await prisma.fileObject.findUnique({ where: { id: fileId } });
  if (!file || file.status !== 'SCANNING') return 'skipped';

  if (!file.quarantineVersionId) {
    return rejectGuardDutyFile(file, 'FAILED', 'The uploaded object has no recorded version.');
  }

  const now = new Date();
  if (file.scanDeadlineAt && file.scanDeadlineAt <= now) {
    return rejectGuardDutyFile(file, 'FAILED', 'GuardDuty scan timed out.');
  }

  const source = {
    bucket: 'quarantine' as const,
    key: file.storageKey,
    versionId: file.quarantineVersionId,
  };

  let tags: Record<string, string>;
  try {
    tags = await getStorage().getObjectTags(source);
  } catch (error) {
    if (file.scanDeadlineAt && file.scanDeadlineAt <= new Date()) {
      return rejectGuardDutyFile(file, 'FAILED', 'GuardDuty scan status could not be read.');
    }
    log.warn({ err: error, fileId }, 'guardduty scan status is temporarily unavailable');
    return 'pending';
  }

  const result = interpretGuardDutyTags(tags);
  if (result.verdict === 'pending') return 'pending';
  if (result.verdict === 'infected') {
    return rejectGuardDutyFile(file, 'INFECTED', result.status);
  }
  if (result.verdict === 'error') {
    return rejectGuardDutyFile(file, 'FAILED', `${result.status}: ${result.detail}`);
  }

  const destinationBucket = bucketForCategory(file.category);
  await getStorage().copyObject(
    source,
    { bucket: destinationBucket, key: file.storageKey },
    { ...(file.quarantineEtag ? { sourceEtag: file.quarantineEtag } : {}) },
  );

  const completedAt = new Date();
  const durationMs = scanDurationMs(file, completedAt);
  const promoted = await prisma.$transaction(async (tx) => {
    const transition = await tx.fileObject.updateMany({
      where: { id: file.id, status: 'SCANNING' },
      data: {
        bucket: destinationBucket,
        status: 'READY',
        scannedAt: completedAt,
        readyAt: completedAt,
        rejectionReason: null,
      },
    });
    if (transition.count !== 1) return false;
    await tx.fileScanResult.create({
      data: {
        fileId: file.id,
        scanner: 'guardduty',
        status: 'CLEAN',
        detail: result.status,
        durationMs,
        completedAt,
      },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.FILE_SCAN_COMPLETED,
      aggregateType: 'FileObject',
      aggregateId: file.id,
      organisationId: file.organisationId,
      payload: { fileId: file.id },
    });
    return true;
  });

  if (!promoted) return 'skipped';
  increment(MetricName.FILE_SCAN_COMPLETED, { scanner: 'guardduty', verdict: 'clean' });
  try {
    await getStorage().deleteObject({ bucket: 'quarantine', key: file.storageKey });
  } catch (error) {
    log.warn({ err: error, fileId }, 'promoted file could not be removed from quarantine');
  }
  return 'clean';
}

async function rejectGuardDutyFile(
  file: FileObject,
  status: 'INFECTED' | 'FAILED',
  detail: string,
): Promise<'infected' | 'failed' | 'skipped'> {
  const completedAt = new Date();
  const outcome = status === 'INFECTED' ? 'infected' : 'failed';
  const transitioned = await getPrisma().$transaction(async (tx) => {
    const transition = await tx.fileObject.updateMany({
      where: { id: file.id, status: 'SCANNING' },
      data: {
        status: 'REJECTED',
        rejectedAt: completedAt,
        rejectionReason: 'File failed security validation.',
      },
    });
    if (transition.count !== 1) return false;
    await tx.fileScanResult.create({
      data: {
        fileId: file.id,
        scanner: 'guardduty',
        status,
        detail: detail.slice(0, 1_000),
        durationMs: scanDurationMs(file, completedAt),
        completedAt,
      },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.FILE_SCAN_FAILED,
      aggregateType: 'FileObject',
      aggregateId: file.id,
      organisationId: file.organisationId,
      payload: { fileId: file.id },
    });
    return true;
  });
  if (!transitioned) return 'skipped';
  increment(MetricName.FILE_SCAN_COMPLETED, { scanner: 'guardduty', verdict: outcome });
  if (status === 'FAILED') {
    reportError(new Error(detail), { fileId: file.id, provider: 'guardduty' });
  }
  return outcome;
}

function scanDurationMs(file: FileObject, completedAt: Date): number {
  return Math.max(0, completedAt.getTime() - (file.scanStartedAt ?? file.updatedAt).getTime());
}

export async function getFile(auth: AuthContext, fileId: string) {
  const file = await authorisedFile(auth, fileId);
  return serialiseFile(file);
}
export async function createDownload(auth: AuthContext, fileId: string) {
  const file = await authorisedFile(auth, fileId);
  if (file.status !== 'READY')
    throw new UnprocessableError(ErrorCode.FILE_NOT_READY, 'That file is not ready.');
  const config = loadConfig();
  const downloadUrl =
    file.visibility === 'PUBLIC'
      ? await getStorage().publicUrl(file.storageKey, config.storage.presignedDownloadTtlSeconds)
      : await getStorage().createDownloadUrl({
          bucket: file.bucket as BucketKind,
          key: file.storageKey,
          expiresInSeconds: config.storage.presignedDownloadTtlSeconds,
          downloadFilename: file.originalName,
          contentType: file.mimeType,
        });
  return {
    downloadUrl,
    expiresAt: new Date(Date.now() + config.storage.presignedDownloadTtlSeconds * 1000),
  };
}
async function authorisedFile(auth: AuthContext, fileId: string) {
  const file = await getPrisma().fileObject.findUnique({ where: { id: fileId } });
  if (!file || file.status === 'DELETED')
    throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That file was not found.');
  const owner = file.ownerId === auth.userId;
  const applicationAttachment = await getPrisma().applicationAttachment.findFirst({
    where: { fileId },
    select: {
      application: {
        select: {
          id: true,
          organisationId: true,
          screening: { select: { status: true, releasedToCompanyAt: true } },
        },
      },
    },
  });
  const org = applicationAttachment
    ? applicationAttachment.application.organisationId === auth.organisationId &&
      applicationAttachment.application.screening?.status === 'RELEASED_TO_COMPANY' &&
      Boolean(applicationAttachment.application.screening.releasedToCompanyAt) &&
      auth.membershipStatus === 'ACTIVE' &&
      auth.organisationPermissions.has('file:read')
    : Boolean(
        file.organisationId &&
        file.organisationId === auth.organisationId &&
        auth.membershipStatus === 'ACTIVE' &&
        auth.organisationPermissions.has('file:read'),
      );
  const grant = await getPrisma().fileAccessGrant.count({
    where: { fileId, grantedToId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  const messageUsage = await getPrisma().fileUsage.findFirst({
    where: { fileId, resourceType: 'Message', file: { status: 'READY' } },
    select: { resourceId: true },
  });
  const conversationAccess = messageUsage
    ? await getPrisma().message.count({
        where: {
          id: messageUsage.resourceId,
          conversation: { members: { some: { userId: auth.userId, leftAt: null } } },
        },
      })
    : 0;
  const taskUsage = await getPrisma().fileUsage.findFirst({
    where: { fileId, resourceType: 'Task', file: { status: 'READY' } },
    select: { resourceId: true },
  });
  const taskAccess = taskUsage
    ? await getPrisma().task.count({
        where: {
          id: taskUsage.resourceId,
          OR: [
            {
              organisationId: auth.organisationId,
              organisation: { memberships: { some: { userId: auth.userId, status: 'ACTIVE' } } },
            },
            { assignees: { some: { talentProfile: { userId: auth.userId } } } },
          ],
        },
      })
    : 0;
  if (
    !owner &&
    !org &&
    !grant &&
    !conversationAccess &&
    !taskAccess &&
    !(applicationAttachment
      ? auth.platformPermissions.has('screening:read')
      : auth.platformPermissions.has('file:read'))
  )
    throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That file was not found.');
  return file;
}
export async function archiveFile(auth: AuthContext, fileId: string): Promise<void> {
  const file = await authorisedFile(auth, fileId);
  if (
    file.ownerId !== auth.userId &&
    !auth.organisationPermissions.has('file:delete') &&
    !auth.platformPermissions.has('file:delete')
  )
    throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That file was not found.');
  await getPrisma().$transaction(async (tx) => {
    await tx.fileObject.update({
      where: { id: fileId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.FILE_ARCHIVED,
      aggregateType: 'FileObject',
      aggregateId: fileId,
      organisationId: file.organisationId,
      payload: { fileId },
    });
  });
}

function serialiseFile<
  T extends {
    sizeBytes: bigint;
    storageKey: string;
    bucket: string;
    quarantineVersionId?: unknown;
    quarantineEtag?: unknown;
    scanStartedAt?: unknown;
    scanDeadlineAt?: unknown;
  },
>(file: T) {
  const {
    storageKey: _storageKey,
    bucket: _bucket,
    quarantineVersionId: _quarantineVersionId,
    quarantineEtag: _quarantineEtag,
    scanStartedAt: _scanStartedAt,
    scanDeadlineAt: _scanDeadlineAt,
    ...safe
  } = file;
  return { ...safe, sizeBytes: file.sizeBytes.toString() };
}
