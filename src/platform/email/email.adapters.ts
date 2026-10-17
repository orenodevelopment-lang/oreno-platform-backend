import { createTransport, type Transporter } from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../config/index.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import type { EmailAdapter, EmailMessage, EmailSendResult } from './email.types.js';

const log = createModuleLogger('email');

/**
 * Delivery adapters.
 *
 * `log` and `capture` are development drivers: they never contact a provider
 * and are rejected in production by the environment schema. `smtp` uses the
 * standard SMTP protocol (Amazon SES and most transactional providers expose an
 * SMTP endpoint). `resend` and `ses` use their HTTP APIs.
 */
function formatAddress(message: EmailMessage): string {
  const name = message.toName?.trim();
  return name ? `${name} <${message.to}>` : message.to;
}

function fromAddress(): string {
  const config = loadConfig();
  return `${config.email.fromName} <${config.email.fromAddress}>`;
}

class LogEmailAdapter implements EmailAdapter {
  readonly name = 'log';

  send(message: EmailMessage): Promise<EmailSendResult> {
    // Bodies are intentionally excluded: a log stream is not a place for
    // password-reset links or invitation tokens.
    log.info(
      {
        to: message.to,
        subject: message.subject,
        textLength: message.text.length,
        tags: message.tags ?? {},
      },
      'email suppressed (log driver)',
    );
    return Promise.resolve({});
  }
}

class CaptureEmailAdapter implements EmailAdapter {
  readonly name = 'capture';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const config = loadConfig();
    const directory = config.email.captureDir;
    await mkdir(directory, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeRecipient = message.to.replace(/[^a-zA-Z0-9._@-]/g, '_');
    const base = join(directory, `${stamp}__${safeRecipient}`);

    await writeFile(`${base}.html`, message.html, 'utf8');
    await writeFile(
      `${base}.json`,
      JSON.stringify(
        {
          to: message.to,
          toName: message.toName ?? null,
          subject: message.subject,
          text: message.text,
          headers: message.headers ?? {},
          tags: message.tags ?? {},
        },
        null,
        2,
      ),
      'utf8',
    );

    log.info({ to: message.to, subject: message.subject, file: `${base}.html` }, 'email captured');
    return { providerRef: `capture:${base}` };
  }
}

class SmtpEmailAdapter implements EmailAdapter {
  readonly name = 'smtp';
  private transporter: Transporter | undefined;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const smtp = loadConfig().email.smtp;
    if (!smtp) throw new Error('SMTP is not configured.');
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.user && smtp.password ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
      pool: true,
      maxConnections: 5,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    // Nodemailer types `sendMail`'s result as `any`; only `messageId` is used.
    const info = (await this.getTransporter().sendMail({
      from: fromAddress(),
      to: formatAddress(message),
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    })) as { messageId?: string };
    return { providerRef: info.messageId };
  }
}

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

class ResendEmailAdapter implements EmailAdapter {
  readonly name = 'resend';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const config = loadConfig();
    if (!config.email.apiKey) throw new Error('EMAIL_PROVIDER_API_KEY is not configured.');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [formatAddress(message)],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.tags
          ? { tags: Object.entries(message.tags).map(([name, value]) => ({ name, value })) }
          : {}),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as ResendResponse;
    if (!response.ok) {
      throw new Error(
        `Resend rejected the message (${response.status}): ${payload.message ?? payload.name ?? 'unknown error'}`,
      );
    }
    return { providerRef: payload.id };
  }
}

export { LogEmailAdapter, CaptureEmailAdapter, SmtpEmailAdapter, ResendEmailAdapter };
