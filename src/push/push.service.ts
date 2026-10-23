import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { User } from '../users/user.entity';

// Every method here degrades gracefully to a no-op if Firebase hasn't
// been configured yet (no FIREBASE_SERVICE_ACCOUNT_JSON in .env) - the
// rest of the app, including in-app/Socket.IO notifications, keeps
// working fine without it. This only ever adds a device push on top.
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app: admin.app.App | null = null;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const rawJson = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!rawJson) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not set - device push notifications are disabled ' +
          '(in-app/realtime notifications still work fine). See the backend README for setup.',
      );
      return;
    }

    try {
      // Accepts either the raw JSON or a base64-encoded copy of it (base64
      // is friendlier for pasting a multi-line secret into a single .env
      // line or a hosting provider's env-var UI).
      const jsonText = rawJson.trim().startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(jsonText);

      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.logger.log('Firebase Admin initialized - device push notifications are enabled');
    } catch (err) {
      this.logger.error(
        `Could not parse FIREBASE_SERVICE_ACCOUNT_JSON - device push stays disabled (${err})`,
      );
    }
  }

  async sendToUser(user: User, title: string, body: string, data?: Record<string, string>) {
    if (!this.app || !user.pushToken) return;

    try {
      await admin.messaging(this.app).send({
        token: user.pushToken,
        notification: { title, body },
        data,
      });
    } catch (err) {
      // A stale/invalid token is common (app reinstalled, permissions
      // revoked, etc.) - log and move on rather than failing the request
      // that triggered this notification in the first place.
      this.logger.warn(`Push send failed for user ${user.id}: ${err}`);
    }
  }
}
