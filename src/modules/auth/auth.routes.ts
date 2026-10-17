import { Router } from 'express';
import { asyncHandler } from '../../common/http/async-handler.js';
import { authRateLimit } from '../../common/middleware/rate-limit.js';
import {
  authenticate,
  authenticatePendingMfa,
  requireMfaSatisfied,
} from './auth.middleware.js';
import * as controller from './auth.controller.js';

/**
 * `/api/v1/auth`
 *
 * Rate limiting is applied per-endpoint rather than once for the whole router:
 * the credential endpoints need a much tighter budget than `GET /me`, which the
 * frontend calls on every page load.
 *
 * CSRF, origin checks and the global limit are applied once in `app.ts`, before
 * module routers are mounted. They are not repeated here.
 */
export function createAuthRouter(): Router {
  const router = Router();

  /* -------- Credentials (public, tightly rate limited) -------- */
  router.post('/register', authRateLimit(), asyncHandler(controller.register));
  router.post('/login', authRateLimit(), asyncHandler(controller.login));

  /* -------- Email verification -------- */
  router.post('/email/verify', authRateLimit(), asyncHandler(controller.verifyEmail));
  router.post('/email/resend', authRateLimit(), asyncHandler(controller.resendVerification));

  /* -------- Password reset (public) -------- */
  router.post('/password/forgot', authRateLimit(), asyncHandler(controller.forgotPassword));
  router.post('/password/reset', authRateLimit(), asyncHandler(controller.resetPassword));

  /* -------- Federated sign-in (public) -------- */
  router.get('/oauth/:provider/start', authRateLimit(), asyncHandler(controller.startOAuth));
  router.get(
    '/oauth/:provider/callback',
    authRateLimit(),
    asyncHandler(controller.handleOAuthCallback),
  );

  /* -------- Session lifecycle -------- */
  router.post('/logout', authenticate(), asyncHandler(controller.logout));
  router.post('/logout-all', authenticate(), asyncHandler(controller.logoutAll));
  router.get('/sessions', authenticate(), asyncHandler(controller.listSessions));
  router.delete('/sessions/:sessionId', authenticate(), asyncHandler(controller.revokeSession));

  /* -------- Current account -------- */
  router.get('/me', authenticate(), asyncHandler(controller.currentUser));
  router.patch('/me', authenticate(), asyncHandler(controller.updateProfile));
  router.get('/me/preferences', authenticate(), asyncHandler(controller.getPreferences));
  router.patch('/me/preferences', authenticate(), asyncHandler(controller.updatePreferences));
  router.get('/me/activity', authenticate(), asyncHandler(controller.listActivity));
  router.delete(
    '/me/oauth/:provider',
    authenticate(),
    asyncHandler(controller.unlinkOAuthProvider),
  );

  /* -------- Password change (authenticated) -------- */
  router.post('/password/change', authenticate(), asyncHandler(controller.changePassword));

  /* -------- Two-factor authentication -------- */
  //
  // A successful password/OAuth login without an enrolled factor is already a
  // fully authenticated session and may begin first-time enrolment. An account
  // with an enabled factor cannot replace it through this path.
  router.post('/2fa/setup', authenticate(), asyncHandler(controller.startTwoFactorSetup));
  router.post('/2fa/confirm', authenticate(), asyncHandler(controller.confirmTwoFactorSetup));
  // OAuth sessions that still owe their second factor can reach only this
  // endpoint (plus logout); ordinary `authenticate` rejects them.
  router.post(
    '/2fa/challenge',
    authenticatePendingMfa(),
    asyncHandler(controller.completeTwoFactorChallenge),
  );
  router.post('/2fa/disable', authenticate(), asyncHandler(controller.disableTwoFactor));
  router.post(
    '/2fa/recovery-codes',
    authenticate(),
    requireMfaSatisfied(),
    asyncHandler(controller.regenerateRecoveryCodes),
  );

  return router;
}
