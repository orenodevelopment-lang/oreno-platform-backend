import { createHash, createHmac } from 'node:crypto';
import { loadConfig } from '../../config/index.js';
import type { EmailAdapter, EmailMessage, EmailSendResult } from './email.types.js';

/**
 * Amazon SES v2 adapter.
 *
 * The SES v2 API is SigV4-signed plain HTTPS. Signing it directly with
 * `node:crypto` avoids pulling the whole AWS SDK into the email path, which
 * keeps worker cold-start time down; the S3 driver still uses the SDK because
 * pre-signing multipart uploads by hand is not worth reimplementing.
 */
const SERVICE = 'ses';
const ALGORITHM = 'AWS4-HMAC-SHA256';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function amzDateParts(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function signRequest(input: {
  host: string;
  path: string;
  body: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
  now: Date;
}): SignedRequest {
  const { amzDate, dateStamp } = amzDateParts(input.now);
  const payloadHash = sha256Hex(input.body);

  const canonicalHeadersList = [
    'content-type:application/json',
    `host:${input.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ];
  if (input.sessionToken) {
    canonicalHeadersList.push(`x-amz-security-token:${input.sessionToken}`);
  }
  canonicalHeadersList.sort();

  const signedHeaders = canonicalHeadersList
    .map((header) => header.slice(0, header.indexOf(':')))
    .join(';');
  const canonicalHeaders = `${canonicalHeadersList.join('\n')}\n`;

  const canonicalRequest = [
    'POST',
    input.path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${input.region}/${SERVICE}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, credentialScope, sha256Hex(canonicalRequest)].join(
    '\n',
  );

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), SERVICE),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  const authorization = `${ALGORITHM} Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${input.host}${input.path}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      'X-Amz-Content-Sha256': payloadHash,
      ...(input.sessionToken ? { 'X-Amz-Security-Token': input.sessionToken } : {}),
      Authorization: authorization,
    },
    body: input.body,
  };
}

function formatAddress(email: string, name?: string): string {
  return name?.trim() ? `${name.trim()} <${email}>` : email;
}

interface SesErrorBody {
  message?: string;
  Message?: string;
}

export class SesEmailAdapter implements EmailAdapter {
  readonly name = 'ses';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const config = loadConfig();
    if (!config.storage.accessKeyId || !config.storage.secretAccessKey) {
      throw new Error(
        'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when EMAIL_PROVIDER=ses.',
      );
    }

    const region = config.storage.region;
    const host = `email.${region}.amazonaws.com`;
    const path = '/v2/email/outbound-emails';

    const body = JSON.stringify({
      FromEmailAddress: formatAddress(config.email.fromAddress, config.email.fromName),
      Destination: { ToAddresses: [formatAddress(message.to, message.toName)] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: message.html, Charset: 'UTF-8' },
            Text: { Data: message.text, Charset: 'UTF-8' },
          },
        },
      },
      ...(message.replyTo ? { ReplyToAddresses: [message.replyTo] } : {}),
      ...(message.headers
        ? {
            EmailTags: Object.entries(message.headers).map(([Name, Value]) => ({ Name, Value })),
          }
        : {}),
    });

    const signed = signRequest({
      host,
      path,
      body,
      region,
      accessKeyId: config.storage.accessKeyId,
      secretAccessKey: config.storage.secretAccessKey,
      sessionToken: process.env['AWS_SESSION_TOKEN'],
      now: new Date(),
    });

    const response = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: signed.body,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as SesErrorBody;
      throw new Error(
        `SES rejected the message (${response.status}): ${payload.message ?? payload.Message ?? 'unknown error'}`,
      );
    }

    const payload = (await response.json().catch(() => ({}))) as { MessageId?: string };
    return { providerRef: payload.MessageId };
  }
}
