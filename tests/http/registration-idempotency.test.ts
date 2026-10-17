import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { getPrisma } from '../../src/database/prisma.js';

describe('registration intent and idempotency', () => {
  const app = createApp();

  it('creates one talent journey and replays the same completed response', async () => {
    const prisma = getPrisma();
    const marker = randomUUID();
    const email = `registration-${marker}@example.test`;
    const key = `registration-${marker}`;
    const origin = loadConfig().allowedOrigins[0] ?? 'http://localhost:3000';
    const body = {
      accountType: 'TALENT',
      email,
      password: 'N7!qZ4#vL9@pR2$x',
      firstName: 'Registration',
      lastName: 'Talent',
      timeZone: 'Africa/Lagos',
      acceptTerms: true,
    };

    const created = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const replayed = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    expect(replayed.body.data).toEqual(created.body.data);
    expect(replayed.body.meta.replayed).toBe(true);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(
      await prisma.talentProfile.count({ where: { userId: created.body.data.userId } }),
    ).toBe(1);
    expect(
      await prisma.emailDelivery.count({
        where: { recipientEmail: email, templateKey: 'email-verification' },
      }),
    ).toBe(1);

    const mismatch = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('Idempotency-Key', key)
      .send({ ...body, firstName: 'Changed' })
      .expect(409);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('requires a key and rejects privilege-bearing registration input', async () => {
    const marker = randomUUID();
    const origin = loadConfig().allowedOrigins[0] ?? 'http://localhost:3000';
    const body = {
      accountType: 'COMPANY_OWNER',
      email: `company-registration-${marker}@example.test`,
      password: 'N7!qZ4#vL9@pR2$x',
      firstName: 'Company',
      lastName: 'Owner',
      organisationName: 'Example Company',
      acceptTerms: true,
    };
    const missing = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send(body)
      .expect(400);
    expect(missing.body.error.code).toBe('VALIDATION_FAILED');

    const malicious = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('Idempotency-Key', `malicious-${marker}`)
      .send({ ...body, platformRole: 'PLATFORM_OWNER', isPlatformAdmin: true })
      .expect(400);
    expect(malicious.body.error.code).toBe('VALIDATION_FAILED');
    expect(await getPrisma().user.count({ where: { email: body.email } })).toBe(0);
  });
});
