import { Prisma } from '@prisma/client';
import { loadConfig } from '../../config/index.js';
import { UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { fingerprint, generateToken, hashToken } from '../../common/security/tokens.js';
import { getPrisma } from '../../database/prisma.js';
import { stageEmail } from '../../platform/email/email.service.js';
import { EMAIL_TEMPLATES } from '../../platform/email/email.types.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';

type RequestMeta = { ipAddress?: string; userAgent?: string };
function leadDedupe(scope: string, email: string, content: string): string { const day = new Date().toISOString().slice(0, 10); return fingerprint(`${email}:${content}:${day}`, scope); }
function firstName(fullName: string): string { return fullName.trim().split(/\s+/)[0] ?? 'there'; }

export async function submitDemo(input: { fullName: string; email: string; companyName: string; companySize?: string; phone?: string; countryCode?: string; message?: string; source?: string }, meta: RequestMeta) {
  const prisma = getPrisma(); const dedupeKey = leadDedupe('demo', input.email, input.companyName);
  const existing = await prisma.demoRequest.findUnique({ where: { dedupeKey }, select: { id: true, createdAt: true } });
  if (existing) return existing;
  const request = await prisma.$transaction(async (tx) => { const created = await tx.demoRequest.create({ data: { ...input, email: input.email.toLowerCase(), ipAddress: meta.ipAddress, dedupeKey } }); await emitEvent(tx, { eventKey: EVENT_KEYS.DEMO_REQUEST_SUBMITTED, aggregateType: 'DemoRequest', aggregateId: created.id, payload: { demoRequestId: created.id } }); await stageEmail(tx, { to: input.email, toName: input.fullName, template: EMAIL_TEMPLATES.DEMO_REQUEST_RECEIVED, variables: { firstName: firstName(input.fullName), companyName: input.companyName }, dedupeKey: `demo-request:${created.id}` }); return created; });
  return { id: request.id, createdAt: request.createdAt };
}

export async function submitContact(input: { fullName: string; email: string; subject?: string; message: string; source?: string }, meta: RequestMeta) {
  const prisma = getPrisma(); const dedupeKey = leadDedupe('contact', input.email, input.message);
  const existing = await prisma.contactRequest.findUnique({ where: { dedupeKey }, select: { id: true, createdAt: true } });
  if (existing) return existing;
  const request = await prisma.$transaction(async (tx) => { const created = await tx.contactRequest.create({ data: { fullName: input.fullName, email: input.email.toLowerCase(), subject: input.subject, message: input.message, ipAddress: meta.ipAddress, dedupeKey } }); await emitEvent(tx, { eventKey: EVENT_KEYS.CONTACT_REQUEST_SUBMITTED, aggregateType: 'ContactRequest', aggregateId: created.id, payload: { contactRequestId: created.id } }); await stageEmail(tx, { to: input.email, toName: input.fullName, template: EMAIL_TEMPLATES.CONTACT_REQUEST_RECEIVED, variables: { firstName: firstName(input.fullName), messageSummary: input.message.slice(0, 240) }, dedupeKey: `contact-request:${created.id}` }); return created; });
  return { id: request.id, createdAt: request.createdAt };
}

export async function subscribeNewsletter(input: { email: string; consent: true; policyVersion: string; source?: string }, meta: RequestMeta): Promise<void> {
  const email = input.email.toLowerCase(); const confirm = generateToken(); const unsubscribe = generateToken();
  const url = `${loadConfig().appUrl}/newsletter/confirm?token=${encodeURIComponent(confirm.token)}`;
  const subscription = await getPrisma().$transaction(async (tx) => {
    const row = await tx.newsletterSubscription.upsert({ where: { email }, create: { email, status: 'PENDING_CONFIRMATION', confirmTokenHash: confirm.hash, unsubscribeTokenHash: unsubscribe.hash, source: input.source, ipAddress: meta.ipAddress }, update: { status: 'PENDING_CONFIRMATION', confirmTokenHash: confirm.hash, unsubscribeTokenHash: unsubscribe.hash, source: input.source, ipAddress: meta.ipAddress, confirmedAt: null, unsubscribedAt: null } });
    await tx.consentRecord.create({ data: { email, purpose: 'MARKETING_EMAIL', granted: true, policyVersion: input.policyVersion, ipAddress: meta.ipAddress, userAgent: meta.userAgent } });
    await stageEmail(tx, { to: email, template: EMAIL_TEMPLATES.NEWSLETTER_CONFIRMATION, variables: { confirmationUrl: url }, dedupeKey: `newsletter-confirm:${confirm.hash}` });
    return row;
  });
  void subscription;
}

export async function confirmNewsletter(token: string): Promise<void> {
  const hash = hashToken(token); const prisma = getPrisma();
  const subscription = await prisma.newsletterSubscription.findFirst({ where: { confirmTokenHash: hash, status: 'PENDING_CONFIRMATION' } });
  if (!subscription || subscription.updatedAt < new Date(Date.now() - 24 * 60 * 60 * 1000)) throw new UnprocessableError(ErrorCode.TOKEN_INVALID, 'That confirmation link is invalid or expired.');
  const unsubscribe = generateToken();
  const url = `${loadConfig().appUrl}/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribe.token)}`;
  await prisma.$transaction(async (tx) => { await tx.newsletterSubscription.update({ where: { id: subscription.id }, data: { status: 'SUBSCRIBED', confirmedAt: new Date(), confirmTokenHash: null, unsubscribeTokenHash: unsubscribe.hash } }); await emitEvent(tx, { eventKey: EVENT_KEYS.NEWSLETTER_SUBSCRIBED, aggregateType: 'NewsletterSubscription', aggregateId: subscription.id, payload: { subscriptionId: subscription.id } }); await stageEmail(tx, { to: subscription.email, template: EMAIL_TEMPLATES.NEWSLETTER_WELCOME, variables: { unsubscribeUrl: url }, dedupeKey: `newsletter-welcome:${subscription.id}:${unsubscribe.hash}` }); });
}

export async function unsubscribeNewsletter(token: string, meta: RequestMeta): Promise<void> {
  const hash = hashToken(token); const prisma = getPrisma(); const subscription = await prisma.newsletterSubscription.findFirst({ where: { unsubscribeTokenHash: hash } });
  if (!subscription) return;
  await prisma.$transaction(async (tx) => { await tx.newsletterSubscription.update({ where: { id: subscription.id }, data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date(), confirmTokenHash: null, unsubscribeTokenHash: null } }); await tx.consentRecord.create({ data: { email: subscription.email, purpose: 'MARKETING_EMAIL', granted: false, policyVersion: 'unsubscribe-v1', ipAddress: meta.ipAddress, userAgent: meta.userAgent } }); });
}

export function isUniqueViolation(error: unknown): boolean { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'; }

