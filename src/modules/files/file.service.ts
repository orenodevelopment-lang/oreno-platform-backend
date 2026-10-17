import { getPrisma } from '../../database/prisma.js';
import { loadConfig } from '../../config/index.js';
import { NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import { enqueue, isQueueingEnabled, JOB_NAMES, QUEUE_NAMES, stableJobId } from '../../platform/queue/queue.registry.js';
import { bucketForCategory, buildObjectKey, getStorage } from '../../platform/storage/storage.service.js';
import { getMalwareScanner } from '../../platform/storage/malware-scanner.js';
import type { BucketKind } from '../../platform/storage/storage.types.js';
import type { AuthContext } from '../auth/index.js';

const MIME_ALLOWLIST: Record<string, readonly string[]> = {
  PROFILE_PHOTO: ['image/jpeg', 'image/png', 'image/webp'],
  CV: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
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
    if (!auth.organisationPermissions.has('export:create') && !auth.platformPermissions.has('export:create')) {
      throw new NotFoundError(ErrorCode.RESOURCE_ACCESS_DENIED, 'That file category is not available.');
    }
  }
}

export async function initiateUpload(auth: AuthContext, input: { category: string; originalName: string; mimeType: string; sizeBytes: number; organisationId?: string }) {
  const config = loadConfig();
  if (input.sizeBytes > config.storage.maxUploadBytes) throw new UnprocessableError(ErrorCode.FILE_SIZE_EXCEEDED, `Files may not exceed ${config.storage.maxUploadBytes} bytes.`);
  const allowed = MIME_ALLOWLIST[input.category];
  if (allowed && !allowed.includes(input.mimeType.toLowerCase())) throw new UnprocessableError(ErrorCode.FILE_TYPE_NOT_ALLOWED, 'That file type is not allowed for this category.');
  assertCategoryAccess(auth, input.category, input.organisationId);
  const key = buildObjectKey({ organisationId: input.organisationId, category: input.category, filename: input.originalName });
  const upload = await getStorage().createUploadUrl({ bucket: 'quarantine', key, contentType: input.mimeType, contentLength: input.sizeBytes, expiresInSeconds: config.storage.presignedUploadTtlSeconds });
  const file = await getPrisma().fileObject.create({ data: { organisationId: input.organisationId ?? null, ownerId: auth.userId, category: input.category as never, visibility: ['PROFILE_PHOTO', 'ORGANISATION_LOGO', 'PUBLIC_ASSET'].includes(input.category) ? 'PUBLIC' : 'PRIVATE', status: 'PENDING_UPLOAD', bucket: 'quarantine', storageKey: key, originalName: input.originalName, mimeType: input.mimeType.toLowerCase(), sizeBytes: BigInt(input.sizeBytes), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
  return { file: serialiseFile(file), upload: { ...upload, storageKey: undefined } };
}

export async function completeUpload(auth: AuthContext, fileId: string, checksumSha256?: string) {
  const file = await getPrisma().fileObject.findFirst({ where: { id: fileId, ownerId: auth.userId, status: 'PENDING_UPLOAD' } });
  if (!file) throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That upload was not found.');
  const metadata = await getStorage().headObject({ bucket: 'quarantine', key: file.storageKey });
  if (!metadata) throw new UnprocessableError(ErrorCode.FILE_UPLOAD_NOT_COMPLETED, 'The file has not been uploaded yet.');
  if (metadata.size <= 0 || metadata.size > Number(file.sizeBytes)) throw new UnprocessableError(ErrorCode.FILE_SIZE_EXCEEDED, 'The uploaded file size does not match the declared size.');
  const updated = await getPrisma().fileObject.update({ where: { id: fileId }, data: { status: 'SCANNING', sizeBytes: BigInt(metadata.size), checksumSha256: checksumSha256 ?? null, expiresAt: null } });
  if (isQueueingEnabled()) await enqueue(QUEUE_NAMES.FILES, JOB_NAMES.SCAN_FILE, { fileId }, { jobId: stableJobId('scan-file', fileId) }); else await processFileScan(fileId);
  return serialiseFile(updated);
}

export async function processFileScan(fileId: string): Promise<void> {
  const prisma = getPrisma(); const file = await prisma.fileObject.findUnique({ where: { id: fileId } }); if (!file || !['SCANNING', 'UPLOADED'].includes(file.status)) return;
  const source = { bucket: file.bucket as BucketKind, key: file.storageKey }; const body = await getStorage().getObject(source); const scanner = getMalwareScanner(); const started = Date.now(); const scan = await scanner.scan(body);
  await prisma.fileScanResult.create({ data: { fileId, scanner: scanner.name, status: scan.verdict === 'clean' ? (scanner.name === 'none' ? 'SKIPPED' : 'CLEAN') : scan.verdict === 'infected' ? 'INFECTED' : 'FAILED', signature: scan.signature ?? null, detail: scan.detail ?? null, durationMs: Date.now() - started, completedAt: new Date() } });
  if (scan.verdict !== 'clean') {
    await prisma.fileObject.update({ where: { id: fileId }, data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: scan.verdict === 'infected' ? `Malware detected: ${scan.signature ?? 'unknown'}` : 'Malware scan failed' } });
    await emitEvent(prisma, { eventKey: EVENT_KEYS.FILE_SCAN_FAILED, aggregateType: 'FileObject', aggregateId: fileId, organisationId: file.organisationId, payload: { fileId } }); return;
  }
  const destinationBucket = bucketForCategory(file.category); await getStorage().copyObject(source, { bucket: destinationBucket, key: file.storageKey }); if (source.bucket !== destinationBucket) await getStorage().deleteObject(source);
  await prisma.$transaction(async (tx) => { await tx.fileObject.update({ where: { id: fileId }, data: { bucket: destinationBucket, status: 'READY', scannedAt: new Date(), readyAt: new Date(), rejectionReason: null } }); await emitEvent(tx, { eventKey: EVENT_KEYS.FILE_SCAN_COMPLETED, aggregateType: 'FileObject', aggregateId: fileId, organisationId: file.organisationId, payload: { fileId } }); });
}

export async function getFile(auth: AuthContext, fileId: string) {
  const file = await authorisedFile(auth, fileId); return serialiseFile(file);
}
export async function createDownload(auth: AuthContext, fileId: string) {
  const file = await authorisedFile(auth, fileId); if (file.status !== 'READY') throw new UnprocessableError(ErrorCode.FILE_NOT_READY, 'That file is not ready.'); const config = loadConfig(); const downloadUrl = file.visibility === 'PUBLIC' ? await getStorage().publicUrl(file.storageKey, config.storage.presignedDownloadTtlSeconds) : await getStorage().createDownloadUrl({ bucket: file.bucket as BucketKind, key: file.storageKey, expiresInSeconds: config.storage.presignedDownloadTtlSeconds, downloadFilename: file.originalName, contentType: file.mimeType }); return { downloadUrl, expiresAt: new Date(Date.now() + config.storage.presignedDownloadTtlSeconds * 1000) };
}
async function authorisedFile(auth: AuthContext, fileId: string) {
  const file = await getPrisma().fileObject.findUnique({ where: { id: fileId } }); if (!file || file.status === 'DELETED') throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That file was not found.'); const owner = file.ownerId === auth.userId; const org = file.organisationId && file.organisationId === auth.organisationId && auth.membershipStatus === 'ACTIVE' && auth.organisationPermissions.has('file:read'); const grant = await getPrisma().fileAccessGrant.count({ where: { fileId, grantedToId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } } });
  const messageUsage = await getPrisma().fileUsage.findFirst({ where: { fileId, resourceType: 'Message', file: { status: 'READY' } }, select: { resourceId: true } });
  const conversationAccess = messageUsage ? await getPrisma().message.count({ where: { id: messageUsage.resourceId, conversation: { members: { some: { userId: auth.userId, leftAt: null } } } } }) : 0;
  const taskUsage = await getPrisma().fileUsage.findFirst({ where: { fileId, resourceType: 'Task', file: { status: 'READY' } }, select: { resourceId: true } });
  const taskAccess = taskUsage ? await getPrisma().task.count({ where: { id: taskUsage.resourceId, OR: [{ organisationId: auth.organisationId, organisation: { memberships: { some: { userId: auth.userId, status: 'ACTIVE' } } } }, { assignees: { some: { talentProfile: { userId: auth.userId } } } }] } }) : 0;
  if (!owner && !org && !grant && !conversationAccess && !taskAccess && !auth.platformPermissions.has('file:read')) throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That file was not found.'); return file;
}
export async function archiveFile(auth: AuthContext, fileId: string): Promise<void> { const file = await authorisedFile(auth, fileId); if (file.ownerId !== auth.userId && !auth.organisationPermissions.has('file:delete') && !auth.platformPermissions.has('file:delete')) throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'That file was not found.'); await getPrisma().$transaction(async (tx) => { await tx.fileObject.update({ where: { id: fileId }, data: { status: 'DELETED', deletedAt: new Date() } }); await emitEvent(tx, { eventKey: EVENT_KEYS.FILE_ARCHIVED, aggregateType: 'FileObject', aggregateId: fileId, organisationId: file.organisationId, payload: { fileId } }); }); }

function serialiseFile<T extends { sizeBytes: bigint; storageKey: string; bucket: string }>(file: T) { const { storageKey: _storageKey, bucket: _bucket, ...safe } = file; return { ...safe, sizeBytes: file.sizeBytes.toString() }; }
