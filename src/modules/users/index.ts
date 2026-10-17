/**
 * Public surface of the users module.
 *
 * Other modules import the summary shape and the read helpers from here rather
 * than reaching into the repository, so the projection of a person used across
 * the platform stays consistent.
 */
export { createUserRouter } from './user.routes.js';

export { getProfile, search, setAvatar } from './user.service.js';
export { toSummary } from './user.repository.js';
export * as userPolicy from './user.policy.js';
export * as userRepository from './user.repository.js';

export type { UserProfile, UserSummary, UserOrganisationMembership } from './user.types.js';
export type { ProfileView } from './user.service.js';
