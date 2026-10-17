import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authenticate } from '../auth/index.js';
import * as controller from './talent.controller.js';
import { createTalentApplicationRouter } from '../jobs/index.js';
import { createMyWorkforceRouter } from '../workforce/index.js';
import { createTalentPipelineRouter } from '../pipeline/index.js';
import { createTalentWorkRouter } from '../work/index.js';
import { createTalentPerformanceRouter } from '../performance/index.js';
import { createTalentVettingRouter } from '../vetting/index.js';
import { createTalentPlacementRouter } from '../placements/index.js';
import { createTalentCompensationRouter } from '../compensation/index.js';

export function createTalentRouter(): Router {
  const router = Router();

  router.get('/skills/categories', asyncHandler(controller.listSkillCategories));
  router.get('/skills', asyncHandler(controller.searchSkills));
  router.use('/me/applications', createTalentApplicationRouter());
  router.use('/me/workforce', createMyWorkforceRouter());
  router.use('/me', createTalentPipelineRouter());
  router.use('/me', createTalentWorkRouter());
  router.use('/me', createTalentPerformanceRouter());
  router.use('/me', createTalentVettingRouter());
  router.use('/me', createTalentPlacementRouter());
  router.use('/me', createTalentCompensationRouter());

  router.get('/me/account', authenticate(), asyncHandler(controller.getAccount));
  router.patch('/me/account/preferences', authenticate(), asyncHandler(controller.updateAccountPreferences));
  router.get('/me/profile', authenticate(), asyncHandler(controller.getMyProfile));
  router.patch('/me/profile', authenticate(), asyncHandler(controller.updateMyProfile));
  router.patch('/me/availability', authenticate(), asyncHandler(controller.updateAvailability));
  router.patch('/me/visibility', authenticate(), asyncHandler(controller.updateVisibility));
  router.post('/me/onboarding/complete', authenticate(), asyncHandler(controller.completeOnboarding));
  router.put('/me/files', authenticate(), asyncHandler(controller.linkFile));

  router.post('/me/experience', authenticate(), asyncHandler(controller.createExperience));
  router.patch('/me/experience/:itemId', authenticate(), asyncHandler(controller.updateExperience));
  router.delete('/me/experience/:itemId', authenticate(), asyncHandler(controller.deleteExperience));
  router.post('/me/education', authenticate(), asyncHandler(controller.createEducation));
  router.patch('/me/education/:itemId', authenticate(), asyncHandler(controller.updateEducation));
  router.delete('/me/education/:itemId', authenticate(), asyncHandler(controller.deleteEducation));
  router.post('/me/certifications', authenticate(), asyncHandler(controller.createCertification));
  router.patch('/me/certifications/:itemId', authenticate(), asyncHandler(controller.updateCertification));
  router.delete('/me/certifications/:itemId', authenticate(), asyncHandler(controller.deleteCertification));
  router.post('/me/portfolio', authenticate(), asyncHandler(controller.createPortfolioItem));
  router.patch('/me/portfolio/:itemId', authenticate(), asyncHandler(controller.updatePortfolioItem));
  router.delete('/me/portfolio/:itemId', authenticate(), asyncHandler(controller.deletePortfolioItem));
  router.post('/me/skills', authenticate(), asyncHandler(controller.createSkill));
  router.patch('/me/skills/:itemId', authenticate(), asyncHandler(controller.updateSkill));
  router.delete('/me/skills/:itemId', authenticate(), asyncHandler(controller.deleteSkill));

  router.get('/', asyncHandler(controller.discover));
  router.get('/:profileId', asyncHandler(controller.getDiscoverableProfile));
  return router;
}

export function createPublicTalentRouter(): Router {
  const router = Router();
  router.get('/skills/categories', asyncHandler(controller.listSkillCategories));
  router.get('/skills', asyncHandler(controller.searchSkills));
  router.get('/', asyncHandler(controller.discover));
  router.get('/:profileId', asyncHandler(controller.getDiscoverableProfile));
  return router;
}
