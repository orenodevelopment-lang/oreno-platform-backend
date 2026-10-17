import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('public HTTP contract', () => {
  const app = createApp();

  it('serves liveness without authentication', async () => {
    const response = await request(app).get('/health/live').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('returns the standard success envelope for public job discovery', async () => {
    const response = await request(app).get('/api/v1/public/jobs?page=1&pageSize=10').expect(200);
    expect(response.body).toHaveProperty('data.jobs');
    expect(response.body).toHaveProperty('meta.page');
  });

  it('returns safe field errors for malformed public forms', async () => {
    const response = await request(app).post('/api/v1/public/newsletter/subscribe').set('Origin', 'http://localhost:3000').send({ email: 'not-an-email', consent: false }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error).toHaveProperty('requestId');
    expect(response.body.error).toHaveProperty('fieldErrors');
  });
});
