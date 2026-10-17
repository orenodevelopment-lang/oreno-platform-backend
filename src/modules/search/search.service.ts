import { NotFoundError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getPrisma } from '../../database/prisma.js';
import type { AuthContext } from '../auth/index.js';

type SearchType = 'jobs' | 'talents' | 'staff' | 'organisations' | 'users';

export async function search(
  auth: AuthContext,
  query: { q: string; types: SearchType[]; page: number; pageSize: number },
) {
  if (!auth.organisationPermissions.has('search:read') && !auth.platformPermissions.has('search:read')) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'Search is not available.');
  }
  const prisma = getPrisma();
  const skip = (query.page - 1) * query.pageSize;
  const take = query.pageSize;
  const q = query.q;
  const platform = auth.platformPermissions.has('admin:read');
  const tenant = auth.organisationId && auth.membershipStatus === 'ACTIVE' ? auth.organisationId : undefined;
  const result: Record<string, unknown> = {};

  await Promise.all(query.types.map(async (type) => {
    switch (type) {
      case 'jobs':
        result.jobs = await prisma.job.findMany({
          where: tenant
            ? { organisationId: tenant, OR: [{ title: { contains: q, mode: 'insensitive' } }, { reference: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] }
            : { status: 'PUBLISHED', moderationStatus: { not: 'REMOVED' }, OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] },
          select: { id: true, organisationId: true, reference: true, title: true, status: true, employmentType: true, workArrangement: true, city: true, countryCode: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip, take,
        });
        return;
      case 'talents':
        result.talents = await prisma.talentProfile.findMany({
          where: { status: 'ACTIVE', visibility: tenant ? { in: ['PUBLIC', 'ORENO_COMPANIES_ONLY'] } : 'PUBLIC', OR: [{ headline: { contains: q, mode: 'insensitive' } }, { currentTitle: { contains: q, mode: 'insensitive' } }, { skills: { some: { skill: { name: { contains: q, mode: 'insensitive' } } } } }] },
          select: { id: true, headline: true, currentTitle: true, seniority: true, availabilityStatus: true, visibility: true, user: { select: { firstName: true, lastName: true, displayName: true } } },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip, take,
        });
        return;
      case 'staff':
        result.staff = tenant ? await prisma.staffAssignment.findMany({
          where: { organisationId: tenant, OR: [{ employeeCode: { contains: q, mode: 'insensitive' } }, { jobTitle: { contains: q, mode: 'insensitive' } }, { talentProfile: { user: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] } } }] },
          select: { id: true, employeeCode: true, jobTitle: true, status: true, talentProfile: { select: { user: { select: { firstName: true, lastName: true, displayName: true } } } } },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip, take,
        }) : [];
        return;
      case 'organisations':
        result.organisations = platform ? await prisma.organisation.findMany({
          where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { legalName: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] },
          select: { id: true, name: true, slug: true, status: true, verificationStatus: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip, take,
        }) : [];
        return;
      case 'users':
        result.users = platform ? await prisma.user.findMany({
          where: { OR: [{ email: { contains: q, mode: 'insensitive' } }, { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] },
          select: { id: true, email: true, firstName: true, lastName: true, displayName: true, status: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip, take,
        }) : [];
        return;
    }
  }));
  return result;
}
