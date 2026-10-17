import { z } from 'zod';
import type { OperationDoc } from './openapi.types.js';

const TAG = 'users';

const userSummary = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string().nullable(),
  avatarFileId: z.string().uuid().nullable(),
  jobTitle: z.string().nullable(),
  status: z.enum(['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
});

export const usersOperations: OperationDoc[] = [
  {
    method: 'get',
    path: '/api/v1/users',
    operationId: 'searchUsers',
    summary: 'Search the user directory',
    description:
      'A platform administrator searches the whole directory; a tenant user is limited to people who share an active organisation with them.',
    tags: [TAG],
    responses: [
      {
        status: 200,
        description: 'A page of matching users.',
        schema: z.object({ users: z.array(userSummary) }),
        envelope: true,
      },
      { status: 429, description: 'Rate limit exceeded.', ref: '#/components/responses/TooManyRequests' },
    ],
  },
  {
    method: 'get',
    path: '/api/v1/users/{userId}',
    operationId: 'getUserProfile',
    summary: 'Read a user profile',
    description:
      'Returns the full profile to the subject and to administrators, and the public summary to someone who shares an organisation. A caller with no visibility receives `404`.',
    tags: [TAG],
    responses: [
      {
        status: 200,
        description: 'The profile, or the public summary when the caller is not the subject.',
        schema: z.object({ user: userSummary }),
        envelope: true,
      },
      { status: 404, description: 'No such user, or not visible.', ref: '#/components/responses/NotFound' },
    ],
  },
  {
    method: 'put',
    path: '/api/v1/users/me/avatar',
    operationId: 'setUserAvatar',
    summary: 'Set or clear your profile avatar',
    description:
      'Links a ready `AVATAR` upload owned by the caller, or clears the current avatar when `fileId` is `null`.',
    tags: [TAG],
    responses: [
      {
        status: 200,
        description: 'The updated user summary.',
        schema: z.object({ user: userSummary }),
        envelope: true,
      },
      { status: 404, description: 'The file was not found.', ref: '#/components/responses/NotFound' },
      { status: 422, description: 'The file is not ready or is the wrong category.', ref: '#/components/responses/Unprocessable' },
    ],
  },
];
