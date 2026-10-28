import type { Prisma } from '@prisma/client';
import { NotFoundError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';

/** One predicate used by every employer-facing application projection. */
export function releasedToOrganisationWhere(organisationId: string): Prisma.ApplicationWhereInput {
  return {
    organisationId,
    screening: {
      is: {
        status: 'RELEASED_TO_COMPANY',
        releasedToCompanyAt: { not: null },
      },
    },
  };
}

export async function isReleasedToOrganisation(applicationId: string, organisationId: string): Promise<boolean> {
  return (await getPrisma().application.count({
    where: { id: applicationId, ...releasedToOrganisationWhere(organisationId) },
  })) === 1;
}

export async function assertReleasedToOrganisation(applicationId: string, organisationId: string): Promise<void> {
  if (!(await isReleasedToOrganisation(applicationId, organisationId))) {
    throw new NotFoundError(ErrorCode.APPLICATION_NOT_FOUND, 'That application was not found.');
  }
}
