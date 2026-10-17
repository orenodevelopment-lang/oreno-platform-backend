import { z } from 'zod';
import { countryCodeSchema, emailSchema, safeTextSchema } from '../../common/validation/common-schemas.js';
import { strictObject } from '../../common/validation/validate.js';
export const demoRequestSchema = strictObject({ fullName: z.string().trim().min(2).max(200), email: emailSchema, companyName: z.string().trim().min(2).max(200), companySize: z.string().trim().max(40).optional(), phone: z.string().trim().max(32).optional(), countryCode: countryCodeSchema.optional(), message: safeTextSchema(4000).optional(), source: z.string().trim().max(80).optional() });
export const contactRequestSchema = strictObject({ fullName: z.string().trim().min(2).max(200), email: emailSchema, subject: z.string().trim().max(240).optional(), message: safeTextSchema(4000).pipe(z.string().min(10)), source: z.string().trim().max(80).optional() });
export const newsletterSubscribeSchema = strictObject({ email: emailSchema, consent: z.literal(true), policyVersion: z.string().trim().min(1).max(40), source: z.string().trim().max(80).optional() });
export const newsletterTokenSchema = strictObject({ token: z.string().trim().min(32).max(200) });

