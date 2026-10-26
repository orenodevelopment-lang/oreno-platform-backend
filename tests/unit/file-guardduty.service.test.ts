import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/index.js', () => ({
  loadConfig: vi.fn(),
}));
vi.mock('../../src/database/prisma.js', () => ({
  getPrisma: vi.fn(),
}));
vi.mock('../../src/platform/storage/storage.service.js', () => ({
  bucketForCategory: vi.fn(() => 'private'),
  buildObjectKey: vi.fn(),
  getStorage: vi.fn(),
}));
vi.mock('../../src/platform/outbox/outbox.service.js', () => ({
  emitEvent: vi.fn(),
}));
vi.mock('../../src/platform/queue/queue.registry.js', () => ({
  enqueue: vi.fn(),
  isQueueingEnabled: vi.fn(() => false),
  stableJobId: vi.fn(() => 'scan-file-id'),
  JOB_NAMES: { SCAN_FILE: 'scan-file' },
  QUEUE_NAMES: { FILES: 'files' },
}));
vi.mock('../../src/platform/storage/malware-scanner.js', () => ({
  getMalwareScanner: vi.fn(),
}));
vi.mock('../../src/common/observability/error-monitor.js', () => ({
  reportError: vi.fn(),
}));
vi.mock('../../src/common/observability/metrics.js', () => ({
  increment: vi.fn(),
  MetricName: { FILE_SCAN_COMPLETED: 'file_scan_completed' },
}));

import { loadConfig } from '../../src/config/index.js';
import { getPrisma } from '../../src/database/prisma.js';
import { completeUpload, processGuardDutyFileScan } from '../../src/modules/files/file.service.js';
import { emitEvent } from '../../src/platform/outbox/outbox.service.js';
import { getStorage } from '../../src/platform/storage/storage.service.js';
import { GUARDDUTY_SCAN_STATUS_TAG } from '../../src/platform/storage/guardduty-scan.js';

function scanningFile(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: '2a81a58f-769f-4596-a99e-3a7f643d4691',
    organisationId: null,
    ownerId: '3c6780ad-e89c-4fea-a53b-97af28eb2ecf',
    category: 'CV',
    visibility: 'PRIVATE',
    status: 'SCANNING',
    bucket: 'quarantine',
    storageKey: 'platform/cv/2026/10/file.pdf',
    originalName: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 512n,
    checksumSha256: null,
    quarantineVersionId: 'version-123',
    quarantineEtag: '"etag-123"',
    scanStartedAt: new Date(now.getTime() - 2_000),
    scanDeadlineAt: new Date(now.getTime() + 60_000),
    scannedAt: null,
    readyAt: null,
    rejectedAt: null,
    rejectionReason: null,
    deletedAt: null,
    expiresAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function arrange(file = scanningFile(), transitionCount = 1) {
  const tx = {
    fileObject: { updateMany: vi.fn().mockResolvedValue({ count: transitionCount }) },
    fileScanResult: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    fileObject: { findUnique: vi.fn().mockResolvedValue(file) },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  const storage = {
    getObjectTags: vi.fn(),
    copyObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(getPrisma).mockReturnValue(prisma as never);
  vi.mocked(getStorage).mockReturnValue(storage as never);
  return { prisma, storage, tx };
}

describe('GuardDuty file processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockReturnValue({
      malwareScanner: {
        driver: 'guardduty',
        guardDuty: { pollSeconds: 10, timeoutMinutes: 15 },
      },
    } as never);
  });

  it('captures the immutable upload version without exposing storage internals', async () => {
    const file = scanningFile({
      status: 'PENDING_UPLOAD',
      quarantineVersionId: null,
      quarantineEtag: null,
      scanStartedAt: null,
      scanDeadlineAt: null,
    });
    const updated = scanningFile();
    const prisma = {
      fileObject: {
        findFirst: vi.fn().mockResolvedValue(file),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      },
    };
    const storage = {
      headObject: vi.fn().mockResolvedValue({
        size: 512,
        etag: updated.quarantineEtag,
        versionId: updated.quarantineVersionId,
      }),
    };
    vi.mocked(getPrisma).mockReturnValue(prisma as never);
    vi.mocked(getStorage).mockReturnValue(storage as never);

    const result = await completeUpload({ userId: file.ownerId } as never, file.id, undefined);

    expect(prisma.fileObject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SCANNING',
          quarantineVersionId: updated.quarantineVersionId,
          quarantineEtag: updated.quarantineEtag,
          scanStartedAt: expect.any(Date),
          scanDeadlineAt: expect.any(Date),
        }),
      }),
    );
    expect(result).not.toHaveProperty('storageKey');
    expect(result).not.toHaveProperty('bucket');
    expect(result).not.toHaveProperty('quarantineVersionId');
    expect(result).not.toHaveProperty('quarantineEtag');
    expect(result).not.toHaveProperty('scanStartedAt');
    expect(result).not.toHaveProperty('scanDeadlineAt');
  });

  it('leaves the file pending while the GuardDuty tag is absent', async () => {
    const { storage, tx } = arrange();
    storage.getObjectTags.mockResolvedValue({});

    await expect(processGuardDutyFileScan(scanningFile().id)).resolves.toBe('pending');
    expect(storage.copyObject).not.toHaveBeenCalled();
    expect(tx.fileObject.updateMany).not.toHaveBeenCalled();
  });

  it('promotes only the recorded clean object version and ETag', async () => {
    const file = scanningFile();
    const { storage, tx } = arrange(file);
    storage.getObjectTags.mockResolvedValue({
      [GUARDDUTY_SCAN_STATUS_TAG]: 'NO_THREATS_FOUND',
    });

    await expect(processGuardDutyFileScan(file.id)).resolves.toBe('clean');
    expect(storage.getObjectTags).toHaveBeenCalledWith({
      bucket: 'quarantine',
      key: file.storageKey,
      versionId: file.quarantineVersionId,
    });
    expect(storage.copyObject).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: file.quarantineVersionId }),
      { bucket: 'private', key: file.storageKey },
      { sourceEtag: file.quarantineEtag },
    );
    expect(tx.fileObject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: file.id, status: 'SCANNING' },
        data: expect.objectContaining({ status: 'READY', bucket: 'private' }),
      }),
    );
    expect(tx.fileScanResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scanner: 'guardduty', status: 'CLEAN' }),
      }),
    );
    expect(storage.deleteObject).toHaveBeenCalledWith({
      bucket: 'quarantine',
      key: file.storageKey,
    });
  });

  it('rejects a threat without copying it out of quarantine', async () => {
    const file = scanningFile();
    const { storage, tx } = arrange(file);
    storage.getObjectTags.mockResolvedValue({
      [GUARDDUTY_SCAN_STATUS_TAG]: 'THREATS_FOUND',
    });

    await expect(processGuardDutyFileScan(file.id)).resolves.toBe('infected');
    expect(storage.copyObject).not.toHaveBeenCalled();
    expect(tx.fileObject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: 'File failed security validation.',
        }),
      }),
    );
    expect(tx.fileScanResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scanner: 'guardduty', status: 'INFECTED' }),
      }),
    );
  });

  it('fails closed when the scan deadline has passed', async () => {
    const file = scanningFile({ scanDeadlineAt: new Date(Date.now() - 1_000) });
    const { storage, tx } = arrange(file);

    await expect(processGuardDutyFileScan(file.id)).resolves.toBe('failed');
    expect(storage.getObjectTags).not.toHaveBeenCalled();
    expect(tx.fileScanResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', detail: 'GuardDuty scan timed out.' }),
      }),
    );
  });

  it('does not duplicate scan records or events after another worker wins the transition', async () => {
    const file = scanningFile();
    const { storage, tx } = arrange(file, 0);
    storage.getObjectTags.mockResolvedValue({
      [GUARDDUTY_SCAN_STATUS_TAG]: 'NO_THREATS_FOUND',
    });

    await expect(processGuardDutyFileScan(file.id)).resolves.toBe('skipped');
    expect(tx.fileScanResult.create).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
