/**
 * Public surface of the auth module.
 *
 * Other modules import middleware, the `AuthContext` type and the small set of
 * helpers they need from here — never from the internal files directly — so the
 * module can be reorganised without touching its consumers.
 */
export { createAuthRouter } from './auth.routes.js';

export {
  authenticate,
  authenticatePendingMfa,
  optionalAuthenticate,
  requireAuthContext,
  requireMfaSatisfied,
  requireOrganisation,
  requirePermission,
  requirePlatformPermission,
  extractBearerToken,
  ORGANISATION_HEADER,
} from './auth.middleware.js';

export {
  effectivePermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isAdministrator,
  requireOrganisationScope,
} from './auth.types.js';

export type {
  AuthContext,
  AuthMethod,
  ImpersonationContext,
  SessionContext,
} from './auth.types.js';

export type { PublicUser, RequestMeta, SessionSummary } from './auth.service.js';

export { hashToken, generateToken, safeCompare } from '../../common/security/tokens.js';
