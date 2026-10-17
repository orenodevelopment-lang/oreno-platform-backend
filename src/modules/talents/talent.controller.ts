import type { Request, Response } from 'express';
import { buildPageMeta } from '../../common/pagination/pagination.js';
import { sendCreated, sendNoContent, sendSuccess } from '../../common/http/response.js';
import { validate } from '../../common/validation/validate.js';
import { requireAuthContext } from '../auth/index.js';
import * as service from './talent.service.js';
import {
  createCertificationSchema,
  createEducationSchema,
  createExperienceSchema,
  createPortfolioSchema,
  createTalentSkillSchema,
  discoveryQuerySchema,
  itemParamsSchema,
  linkProfileFileSchema,
  profileParamsSchema,
  skillSearchQuerySchema,
  updateAccountPreferencesSchema,
  updateAvailabilitySchema,
  updateCertificationSchema,
  updateEducationSchema,
  updateExperienceSchema,
  updatePortfolioSchema,
  updateProfileSchema,
  updateTalentSkillSchema,
  updateVisibilitySchema,
} from './talent.schema.js';

export async function getAccount(req: Request, res: Response): Promise<void> {
  sendSuccess(res, { account: await service.getTalentAccount(requireAuthContext(req)) });
}
export async function updateAccountPreferences(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: updateAccountPreferencesSchema });
  sendSuccess(res, { account: await service.updateAccountPreferences(requireAuthContext(req), body) });
}
export async function getMyProfile(req: Request, res: Response): Promise<void> {
  sendSuccess(res, { profile: await service.getMyProfile(requireAuthContext(req)) });
}
export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: updateProfileSchema });
  sendSuccess(res, { profile: await service.updateMyProfile(requireAuthContext(req), body) });
}
export async function updateAvailability(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: updateAvailabilitySchema });
  sendSuccess(res, { profile: await service.updateAvailability(requireAuthContext(req), body) });
}
export async function updateVisibility(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: updateVisibilitySchema });
  sendSuccess(res, { profile: await service.updateVisibility(requireAuthContext(req), body) });
}
export async function completeOnboarding(req: Request, res: Response): Promise<void> {
  sendSuccess(res, { profile: await service.completeOnboarding(requireAuthContext(req)) });
}
export async function linkFile(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: linkProfileFileSchema });
  sendSuccess(res, { file: await service.linkProfileFile(requireAuthContext(req), body.fileId, body.field) });
}

export async function createExperience(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: createExperienceSchema }); const item = await service.createExperience(requireAuthContext(req), body); sendCreated(res, { experience: item });
}
export async function updateExperience(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: itemParamsSchema, body: updateExperienceSchema }); sendSuccess(res, { experience: await service.updateExperience(requireAuthContext(req), params.itemId, body) });
}
export async function deleteExperience(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: itemParamsSchema }); await service.deleteExperience(requireAuthContext(req), params.itemId); sendNoContent(res);
}
export async function createEducation(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: createEducationSchema }); sendCreated(res, { education: await service.createEducation(requireAuthContext(req), body) });
}
export async function updateEducation(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: itemParamsSchema, body: updateEducationSchema }); sendSuccess(res, { education: await service.updateEducation(requireAuthContext(req), params.itemId, body) });
}
export async function deleteEducation(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: itemParamsSchema }); await service.deleteEducation(requireAuthContext(req), params.itemId); sendNoContent(res);
}
export async function createCertification(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: createCertificationSchema }); sendCreated(res, { certification: await service.createCertification(requireAuthContext(req), body) });
}
export async function updateCertification(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: itemParamsSchema, body: updateCertificationSchema }); sendSuccess(res, { certification: await service.updateCertification(requireAuthContext(req), params.itemId, body) });
}
export async function deleteCertification(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: itemParamsSchema }); await service.deleteCertification(requireAuthContext(req), params.itemId); sendNoContent(res);
}
export async function createPortfolioItem(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: createPortfolioSchema }); sendCreated(res, { portfolioItem: await service.createPortfolioItem(requireAuthContext(req), body) });
}
export async function updatePortfolioItem(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: itemParamsSchema, body: updatePortfolioSchema }); sendSuccess(res, { portfolioItem: await service.updatePortfolioItem(requireAuthContext(req), params.itemId, body) });
}
export async function deletePortfolioItem(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: itemParamsSchema }); await service.deletePortfolioItem(requireAuthContext(req), params.itemId); sendNoContent(res);
}
export async function createSkill(req: Request, res: Response): Promise<void> {
  const { body } = validate(req, { body: createTalentSkillSchema }); sendCreated(res, { skill: await service.createSkill(requireAuthContext(req), body) });
}
export async function updateSkill(req: Request, res: Response): Promise<void> {
  const { params, body } = validate(req, { params: itemParamsSchema, body: updateTalentSkillSchema }); sendSuccess(res, { skill: await service.updateSkill(requireAuthContext(req), params.itemId, body) });
}
export async function deleteSkill(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: itemParamsSchema }); await service.deleteSkill(requireAuthContext(req), params.itemId); sendNoContent(res);
}

export async function discover(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: discoveryQuerySchema }); const result = await service.discover(req.auth, query); sendSuccess(res, { talents: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}
export async function getDiscoverableProfile(req: Request, res: Response): Promise<void> {
  const { params } = validate(req, { params: profileParamsSchema }); sendSuccess(res, { profile: await service.getDiscoverableProfile(req.auth, params.profileId) });
}

export async function searchSkills(req: Request, res: Response): Promise<void> {
  const { query } = validate(req, { query: skillSearchQuerySchema });
  const result = await service.searchSkills(query);
  sendSuccess(res, { skills: result.items }, { meta: { ...buildPageMeta(query, result.total) } });
}

export async function listSkillCategories(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, { categories: await service.listSkillCategories() });
}
