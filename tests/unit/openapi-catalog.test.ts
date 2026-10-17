import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument, operationDefinitions } from '../../src/openapi/index.js';

describe('OpenAPI route catalogue', () => {
  it('has unique method/path and operation id pairs', () => {
    const operations = operationDefinitions();
    expect(new Set(operations.map((operation) => `${operation.method} ${operation.path}`)).size).toBe(operations.length);
    expect(new Set(operations.map((operation) => operation.operationId)).size).toBe(operations.length);
  });

  it('documents the full mounted product surface', () => {
    const document = buildOpenApiDocument('http://localhost:4000');
    expect(Object.keys(document.paths).length).toBeGreaterThan(200);
    for (const path of [
      '/api/v1/public/jobs',
      '/api/v1/talents/me/profile',
      '/api/v1/organisations/{organisationId}/jobs',
      '/api/v1/organisations/{organisationId}/payroll/{payrollPeriodId}/approve',
      '/api/v1/conversations/{conversationId}/messages',
      '/api/v1/admin/operations/jobs/{id}/retry',
    ]) expect(document.paths[path]).toBeDefined();
  });

  it('marks public discovery unauthenticated and tenant commands authenticated', () => {
    const document = buildOpenApiDocument('http://localhost:4000');
    const publicJobs = document.paths['/api/v1/public/jobs'] as { get?: { security?: unknown } };
    const tenantJobs = document.paths['/api/v1/organisations/{organisationId}/jobs'] as { post?: { security?: unknown } };
    expect(publicJobs.get?.security).toEqual([]);
    expect(tenantJobs.post?.security).toBeUndefined();
  });

  it('publishes controller request contracts and idempotency headers', () => {
    const document = buildOpenApiDocument('http://localhost:4000');
    const createJob = document.paths['/api/v1/organisations/{organisationId}/jobs'] as {
      post?: {
        parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
        requestBody?: { content?: { 'application/json'?: { schema?: { required?: string[] } } } };
      };
    };
    const required = createJob.post?.requestBody?.content?.['application/json']?.schema?.required;
    expect(required).toEqual(
      expect.arrayContaining(['title', 'employmentType', 'description']),
    );
    expect(createJob.post?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'organisationId', in: 'path', required: true }),
        expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
      ]),
    );

    const deleteMessage = document.paths[
      '/api/v1/conversations/{conversationId}/messages/{messageId}'
    ] as { delete?: { requestBody?: unknown } };
    expect(deleteMessage.delete?.requestBody).toBeDefined();
  });
});
