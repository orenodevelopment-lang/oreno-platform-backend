import { describe, expect, it } from 'vitest';
import { getPrisma } from '../../src/database/prisma.js';
import { getFile } from '../../src/modules/files/file.service.js';
import {
  authContext,
  createTestOrganisation,
  createTestUser,
  suffix,
} from '../helpers/factories.js';

describe('private file access', () => {
  it('allows only the owner, an authorised tenant, or an active explicit grant', async () => {
    const prisma = getPrisma();
    const owner = await createTestUser('file-owner');
    const stranger = await createTestUser('file-stranger');
    const organisation = await createTestOrganisation('file-org');
    const file = await prisma.fileObject.create({
      data: {
        organisationId: organisation.id,
        ownerId: owner.id,
        category: 'CV',
        visibility: 'PRIVATE',
        status: 'READY',
        bucket: 'private',
        storageKey: `tests/private/${suffix()}.pdf`,
        originalName: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 128n,
        scannedAt: new Date(),
        readyAt: new Date(),
      },
    });

    const ownerView = await getFile(authContext(owner.id), file.id);
    expect(ownerView).toMatchObject({ id: file.id, sizeBytes: '128' });
    expect(ownerView).not.toHaveProperty('storageKey');
    expect(ownerView).not.toHaveProperty('bucket');
    await expect(getFile(authContext(stranger.id), file.id)).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      status: 404,
    });

    const grant = await prisma.fileAccessGrant.create({
      data: {
        fileId: file.id,
        grantedToId: stranger.id,
        grantedById: owner.id,
        purpose: 'Candidate review',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    expect((await getFile(authContext(stranger.id), file.id)).id).toBe(file.id);
    await prisma.fileAccessGrant.update({
      where: { id: grant.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expect(getFile(authContext(stranger.id), file.id)).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      status: 404,
    });
  });
});
