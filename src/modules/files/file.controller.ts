import type { Request, Response } from 'express';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/http/response.js';
import { PayloadTooLargeError, UnauthenticatedError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { validate } from '../../common/validation/validate.js';
import { decodeLocalToken, getLocalStorage } from '../../platform/storage/storage.service.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './file.service.js';
import { completeUploadSchema, fileParamsSchema, initiateUploadSchema, localTokenQuerySchema } from './file.schema.js';

export async function initiateUpload(req: Request, res: Response): Promise<void> { const { body } = validate(req, { body: initiateUploadSchema }); const result = await service.initiateUpload(requireAuthContext(req), body); sendCreated(res, result); }
export async function completeUpload(req: Request, res: Response): Promise<void> { const { params, body } = validate(req, { params: fileParamsSchema, body: completeUploadSchema }); sendSuccess(res, { file: await service.completeUpload(requireAuthContext(req), params.fileId, body.checksumSha256) }); }
export async function getFile(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: fileParamsSchema }); sendSuccess(res, { file: await service.getFile(requireAuthContext(req), params.fileId) }); }
export async function downloadFile(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: fileParamsSchema }); sendSuccess(res, await service.createDownload(requireAuthContext(req), params.fileId)); }
export async function archiveFile(req: Request, res: Response): Promise<void> { const { params } = validate(req, { params: fileParamsSchema }); await service.archiveFile(requireAuthContext(req), params.fileId); sendNoContent(res); }

export async function localUpload(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: localTokenQuerySchema }); const token = decodeLocalToken(query.token); if (token.purpose !== 'upload') throw new UnauthenticatedError(ErrorCode.TOKEN_INVALID, 'That upload link is invalid.'); const local = getLocalStorage(); if (!local) throw new UnauthenticatedError(ErrorCode.TOKEN_INVALID, 'That upload link is unavailable.'); const bytes = await local.putStream({ bucket: token.bucket, key: token.key }, req); if (token.maxBytes && bytes > token.maxBytes) { await local.deleteObject({ bucket: token.bucket, key: token.key }); throw new PayloadTooLargeError('The uploaded file exceeded its declared size.'); } res.status(200).end();
}
export function localDownload(req: Request, res: Response): void {
  const { query } = validate(req, { query: localTokenQuerySchema }); const token = decodeLocalToken(query.token); if (token.purpose !== 'download') throw new UnauthenticatedError(ErrorCode.TOKEN_INVALID, 'That download link is invalid.'); const local = getLocalStorage(); if (!local) throw new UnauthenticatedError(ErrorCode.TOKEN_INVALID, 'That download link is unavailable.'); if (token.filename) res.setHeader('Content-Disposition', `attachment; filename="${token.filename.replace(/["\r\n]/g, '_')}"`); local.createReadStream({ bucket: token.bucket, key: token.key }).pipe(res);
}
