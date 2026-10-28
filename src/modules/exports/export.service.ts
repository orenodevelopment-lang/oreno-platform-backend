import { createHash } from 'node:crypto';
import type { ExportStatus, ExportType, Prisma } from '@prisma/client';
import { loadConfig } from '../../config/index.js';
import { ConflictError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import { enqueue, isQueueingEnabled, JOB_NAMES, QUEUE_NAMES, stableJobId } from '../../platform/queue/queue.registry.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import { buildObjectKey, getStorage } from '../../platform/storage/storage.service.js';
import type { AuthContext } from '../auth/index.js';
import { assertOrganisationAccess, assertOrganisationMutation } from '../organisations/organisation.policy.js';

const ORGANISATION_EXPORTS: readonly ExportType[] = [
  'PAYROLL_CSV', 'STAFF_ROSTER_CSV', 'APPLICATIONS_CSV', 'TALENT_LIST_CSV',
  'TIME_ENTRIES_CSV', 'AUDIT_CSV',
];
const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type ExportParameters = { from?: string | Date; to?: string | Date; status?: string };
type CsvValue = string | number | bigint | boolean | Date | null | undefined | Prisma.Decimal;
type CsvRow = Record<string, CsvValue>;

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function renderCsv(rows: CsvRow[], fallbackHeaders: string[]): string {
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : fallbackHeaders;
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function dateRange(parameters: ExportParameters): { gte?: Date; lte?: Date } | undefined {
  const gte = parameters.from ? new Date(parameters.from) : undefined;
  const lte = parameters.to ? new Date(parameters.to) : undefined;
  return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined;
}

function assertPlatformExport(auth: AuthContext, permission: string): void {
  if (!auth.platformPermissions.has(permission) && !auth.platformPermissions.has('admin:read')) {
    throw new NotFoundError(ErrorCode.EXPORT_NOT_FOUND, 'That export was not found.');
  }
}

export async function createExport(
  auth: AuthContext,
  organisationId: string | undefined,
  input: { type: ExportType; parameters: ExportParameters },
) {
  if (organisationId) {
    assertOrganisationMutation(auth, organisationId, 'export:create');
    if (!ORGANISATION_EXPORTS.includes(input.type)) {
      throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'That export type is platform-only.');
    }
  } else {
    assertPlatformExport(auth, 'export:create');
    if (input.type !== 'PLATFORM_ANALYTICS_CSV' && input.type !== 'AUDIT_CSV') {
      throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'That export requires an organisation.');
    }
  }
  if (input.parameters.from && input.parameters.to && input.parameters.from > input.parameters.to) {
    throw new UnprocessableError(ErrorCode.VALIDATION_FAILED, 'The export start date must precede its end date.');
  }
  const request = await getPrisma().exportRequest.create({
    data: {
      organisationId: organisationId ?? null,
      requestedById: auth.userId,
      type: input.type,
      parameters: input.parameters,
      expiresAt: new Date(Date.now() + EXPORT_TTL_MS),
    },
  });
  if (isQueueingEnabled()) {
    await enqueue(QUEUE_NAMES.EXPORTS, JOB_NAMES.GENERATE_EXPORT, { exportRequestId: request.id }, {
      jobId: stableJobId('generate-export', request.id),
    });
  } else {
    await processExport(request.id);
  }
  return getPrisma().exportRequest.findUniqueOrThrow({ where: { id: request.id }, include: { files: true } });
}

export async function listExports(
  auth: AuthContext,
  organisationId: string | undefined,
  query: { page: number; pageSize: number; status?: ExportStatus; type?: ExportType },
) {
  if (organisationId) assertOrganisationAccess(auth, organisationId, 'export:read');
  else assertPlatformExport(auth, 'export:read');
  const where: Prisma.ExportRequestWhereInput = {
    organisationId: organisationId ?? null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
  };
  const [items, total] = await Promise.all([
    getPrisma().exportRequest.findMany({ where, include: { files: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    getPrisma().exportRequest.count({ where }),
  ]);
  return { items: items.map(serialiseExport), total };
}

async function authorisedExport(auth: AuthContext, organisationId: string | undefined, exportId: string) {
  if (organisationId) assertOrganisationAccess(auth, organisationId, 'export:read');
  else assertPlatformExport(auth, 'export:read');
  const request = await getPrisma().exportRequest.findFirst({
    where: { id: exportId, organisationId: organisationId ?? null }, include: { files: true },
  });
  if (!request) throw new NotFoundError(ErrorCode.EXPORT_NOT_FOUND, 'That export was not found.');
  return request;
}

export async function getExport(auth: AuthContext, organisationId: string | undefined, exportId: string) {
  return serialiseExport(await authorisedExport(auth, organisationId, exportId));
}

export async function downloadExport(auth: AuthContext, organisationId: string | undefined, exportId: string) {
  const request = await authorisedExport(auth, organisationId, exportId);
  if (request.expiresAt && request.expiresAt <= new Date()) {
    await getPrisma().exportRequest.updateMany({ where: { id: request.id, status: 'READY' }, data: { status: 'EXPIRED' } });
    throw new UnprocessableError(ErrorCode.EXPORT_EXPIRED, 'That export has expired.');
  }
  if (request.status === 'FAILED') throw new UnprocessableError(ErrorCode.EXPORT_FAILED, 'That export failed.');
  if (request.status !== 'READY' || request.files.length === 0) throw new ConflictError(ErrorCode.EXPORT_NOT_READY, 'That export is not ready.');
  const file = await getPrisma().fileObject.findFirst({ where: { id: request.files[0]!.fileId, status: 'READY' } });
  if (!file) throw new NotFoundError(ErrorCode.EXPORT_NOT_FOUND, 'That export file was not found.');
  const ttl = loadConfig().storage.presignedDownloadTtlSeconds;
  return {
    downloadUrl: await getStorage().createDownloadUrl({ bucket: 'exports', key: file.storageKey, expiresInSeconds: ttl, downloadFilename: file.originalName, contentType: file.mimeType }),
    expiresAt: new Date(Date.now() + ttl * 1000),
  };
}

async function exportRows(type: ExportType, organisationId: string | null, parameters: ExportParameters): Promise<{ rows: CsvRow[]; headers: string[] }> {
  const prisma = getPrisma();
  const range = dateRange(parameters);
  switch (type) {
    case 'STAFF_ROSTER_CSV': {
      const data = await prisma.staffAssignment.findMany({ where: { organisationId: organisationId!, ...(parameters.status ? { status: parameters.status as never } : {}) }, include: { talentProfile: { include: { user: { select: { displayName: true, firstName: true, lastName: true } } } }, department: { select: { name: true } } }, orderBy: [{ employeeCode: 'asc' }, { id: 'asc' }] });
      return { headers: ['employeeCode','name','jobTitle','department','employmentType','workArrangement','status','effectiveFrom','effectiveTo'], rows: data.map((item) => ({ employeeCode: item.employeeCode, name: item.talentProfile.user.displayName ?? `${item.talentProfile.user.firstName} ${item.talentProfile.user.lastName}`, jobTitle: item.jobTitle, department: item.department?.name, employmentType: item.employmentType, workArrangement: item.workArrangement, status: item.status, effectiveFrom: item.effectiveFrom, effectiveTo: item.effectiveTo })) };
    }
    case 'APPLICATIONS_CSV': {
      const data = await prisma.application.findMany({ where: { organisationId: organisationId!, screening: { is: { status: 'RELEASED_TO_COMPANY', releasedToCompanyAt: { not: null } } }, ...(parameters.status ? { status: parameters.status as never } : {}), ...(range ? { submittedAt: range } : {}) }, include: { job: { select: { reference: true, title: true } }, talentProfile: { include: { user: { select: { displayName: true, firstName: true, lastName: true } } } } }, orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }] });
      return { headers: ['applicationId','jobReference','jobTitle','candidate','status','source','expectedRateAmount','expectedRateCurrency','expectedRateUnit','submittedAt'], rows: data.map((item) => ({ applicationId: item.id, jobReference: item.job.reference, jobTitle: item.job.title, candidate: item.talentProfile.user.displayName ?? `${item.talentProfile.user.firstName} ${item.talentProfile.user.lastName}`, status: item.status, source: item.source, expectedRateAmount: item.expectedRateAmount, expectedRateCurrency: item.expectedRateCurrency, expectedRateUnit: item.expectedRateUnit, submittedAt: item.submittedAt })) };
    }
    case 'TIME_ENTRIES_CSV': {
      const data = await prisma.timeEntry.findMany({ where: { organisationId: organisationId!, ...(parameters.status ? { status: parameters.status as never } : {}), ...(range ? { workDate: range } : {}) }, include: { staffAssignment: { include: { talentProfile: { include: { user: { select: { displayName: true, firstName: true, lastName: true } } } } } } }, orderBy: [{ workDate: 'desc' }, { id: 'asc' }] });
      return { headers: ['timeEntryId','employeeCode','name','workDate','ordinaryMinutes','overtimeMinutes','status','description'], rows: data.map((item) => ({ timeEntryId: item.id, employeeCode: item.staffAssignment.employeeCode, name: item.staffAssignment.talentProfile.user.displayName ?? `${item.staffAssignment.talentProfile.user.firstName} ${item.staffAssignment.talentProfile.user.lastName}`, workDate: item.workDate, ordinaryMinutes: item.ordinaryMinutes, overtimeMinutes: item.overtimeMinutes, status: item.status, description: item.description })) };
    }
    case 'PAYROLL_CSV': {
      const data = await prisma.payrollLineItem.findMany({ where: { payrollPeriod: { organisationId: organisationId!, ...(parameters.status ? { status: parameters.status as never } : {}), ...(range ? { startDate: { lte: range.lte }, endDate: { gte: range.gte } } : {}) } }, include: { payrollPeriod: { select: { name: true, status: true } }, staffAssignment: { select: { employeeCode: true } } }, orderBy: [{ payrollPeriodId: 'desc' }, { staffAssignmentId: 'asc' }, { createdAt: 'asc' }] });
      return { headers: ['period','periodStatus','employeeCode','kind','description','quantityHours','rateAmount','amount','currency'], rows: data.map((item) => ({ period: item.payrollPeriod.name, periodStatus: item.payrollPeriod.status, employeeCode: item.staffAssignment.employeeCode, kind: item.kind, description: item.description, quantityHours: item.quantityHours, rateAmount: item.rateAmount, amount: item.amount, currency: item.currency })) };
    }
    case 'TALENT_LIST_CSV': {
      const data = await prisma.talentProfile.findMany({ where: { applications: { some: { organisationId: organisationId!, screening: { is: { status: 'RELEASED_TO_COMPANY', releasedToCompanyAt: { not: null } } } } } }, include: { user: { select: { displayName: true, firstName: true, lastName: true } }, skills: { include: { skill: { select: { name: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
      return { headers: ['talentProfileId','name','headline','seniority','availability','visibility','skills'], rows: data.map((item) => ({ talentProfileId: item.id, name: item.user.displayName ?? `${item.user.firstName} ${item.user.lastName}`, headline: item.headline, seniority: item.seniority, availability: item.availabilityStatus, visibility: item.visibility, skills: item.skills.map((skill) => skill.skill.name).sort().join('; ') })) };
    }
    case 'AUDIT_CSV': {
      const data = await prisma.auditEvent.findMany({ where: { organisationId, ...(parameters.status ? { outcome: parameters.status as never } : {}), ...(range ? { createdAt: range } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
      return { headers: ['createdAt','actorId','action','outcome','resourceType','resourceId','summary','reason','requestId'], rows: data.map((item) => ({ createdAt: item.createdAt, actorId: item.actorId, action: item.action, outcome: item.outcome, resourceType: item.resourceType, resourceId: item.resourceId, summary: item.summary, reason: item.reason, requestId: item.requestId })) };
    }
    case 'PLATFORM_ANALYTICS_CSV': {
      const [users, organisations, talents, jobs, applications, placements] = await Promise.all([prisma.user.count(), prisma.organisation.count(), prisma.talentProfile.count(), prisma.job.count(), prisma.application.count(), prisma.placement.count()]);
      return { headers: ['metric','value','generatedAt'], rows: [{ metric: 'users', value: users }, { metric: 'organisations', value: organisations }, { metric: 'talents', value: talents }, { metric: 'jobs', value: jobs }, { metric: 'applications', value: applications }, { metric: 'placements', value: placements }].map((row) => ({ ...row, generatedAt: new Date() })) };
    }
  }
}

export async function processExport(exportRequestId: string): Promise<void> {
  const prisma = getPrisma();
  const claimed = await prisma.exportRequest.updateMany({ where: { id: exportRequestId, status: 'REQUESTED' }, data: { status: 'PROCESSING', startedAt: new Date(), failureReason: null } });
  if (claimed.count === 0) return;
  try {
    const request = await prisma.exportRequest.findUniqueOrThrow({ where: { id: exportRequestId } });
    const generated = await exportRows(request.type, request.organisationId, request.parameters as ExportParameters);
    const csv = renderCsv(generated.rows, generated.headers);
    const filename = `${request.type.toLowerCase()}-${request.id}.csv`;
    const key = buildObjectKey({ organisationId: request.organisationId ?? undefined, category: 'EXPORT', filename });
    await getStorage().putObject({ bucket: 'exports', key }, csv, 'text/csv; charset=utf-8');
    const size = Buffer.byteLength(csv);
    await prisma.$transaction(async (tx) => {
      const file = await tx.fileObject.create({ data: { organisationId: request.organisationId, ownerId: request.requestedById, category: 'EXPORT', visibility: 'PRIVATE', status: 'READY', bucket: 'exports', storageKey: key, originalName: filename, mimeType: 'text/csv', sizeBytes: BigInt(size), checksumSha256: createHash('sha256').update(csv).digest('hex'), scannedAt: new Date(), readyAt: new Date(), expiresAt: request.expiresAt, metadata: { exportRequestId: request.id, type: request.type } } });
      await tx.exportFile.create({ data: { exportRequestId: request.id, fileId: file.id, rowCount: generated.rows.length, sizeBytes: BigInt(size) } });
      await tx.exportRequest.update({ where: { id: request.id }, data: { status: 'READY', rowCount: generated.rows.length, completedAt: new Date() } });
      await emitEvent(tx, { eventKey: EVENT_KEYS.EXPORT_COMPLETED, aggregateType: 'ExportRequest', aggregateId: request.id, organisationId: request.organisationId, payload: { exportRequestId: request.id, requestedById: request.requestedById, organisationId: request.organisationId } });
    });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      const failed = await tx.exportRequest.update({ where: { id: exportRequestId }, data: { status: 'FAILED', completedAt: new Date(), failureReason: error instanceof Error ? error.message.slice(0, 1000) : 'Export generation failed.' } });
      await emitEvent(tx, { eventKey: EVENT_KEYS.EXPORT_FAILED, aggregateType: 'ExportRequest', aggregateId: failed.id, organisationId: failed.organisationId, payload: { exportRequestId: failed.id, requestedById: failed.requestedById, organisationId: failed.organisationId } });
    });
    throw error;
  }
}

export async function expireExports(): Promise<number> {
  const expired = await getPrisma().exportRequest.findMany({ where: { status: 'READY', expiresAt: { lte: new Date() } }, include: { files: true } });
  for (const request of expired) {
    for (const link of request.files) {
      const file = await getPrisma().fileObject.findUnique({ where: { id: link.fileId } });
      if (file) await getStorage().deleteObject({ bucket: 'exports', key: file.storageKey });
    }
    await getPrisma().$transaction([
      getPrisma().fileObject.updateMany({ where: { id: { in: request.files.map((file) => file.fileId) } }, data: { status: 'DELETED', deletedAt: new Date() } }),
      getPrisma().exportRequest.update({ where: { id: request.id }, data: { status: 'EXPIRED' } }),
    ]);
  }
  return expired.length;
}

function serialiseExport<T extends { files: Array<{ sizeBytes: bigint }> }>(request: T) {
  return { ...request, files: request.files.map((file) => ({ ...file, sizeBytes: file.sizeBytes.toString() })) };
}

