import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailAttachment { filename: string; content: Buffer }

// Sends email through an HTTPS mail API (Render's free plan blocks normal SMTP ports).
// Set on the server: MAIL_PROVIDER = resend | brevo, MAIL_API_KEY, MAIL_FROM ("TaskEd <no-reply@yourdomain>").
@Injectable()
export class MailService {
  constructor(private config: ConfigService) {}

  async send(to: string, subject: string, text: string, attachments: MailAttachment[]): Promise<void> {
    const provider = (this.config.get<string>('MAIL_PROVIDER') ?? '').toLowerCase();
    const key = this.config.get<string>('MAIL_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    if (!provider || !key || !from) throw new BadRequestException('Email is not set up on the server yet (MAIL_PROVIDER, MAIL_API_KEY and MAIL_FROM). Ask the Administrator.');
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
    const fromName = m ? m[1] : 'TaskEd';
    const fromEmail = m ? m[2] : from.trim();
    let res: Response;
    if (provider === 'resend') {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text, attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) }),
      });
    } else if (provider === 'brevo') {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: fromName, email: fromEmail }, to: [{ email: to }], subject, textContent: text, attachment: attachments.map((a) => ({ name: a.filename, content: a.content.toString('base64') })) }),
      });
    } else throw new BadRequestException('MAIL_PROVIDER must be "resend" or "brevo".');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadRequestException(`The email service refused the message (${res.status}). ${body.slice(0, 160)}`);
    }
  }
}
