import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { decryptToken, encryptToken } from './google-crypto';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export class GoogleNotConnectedError extends BadRequestException {
  constructor(what = 'Google') {
    super(
      `${what} is not connected. Sign out and sign in again with your DepEd Google account, and allow access when Google asks.`,
    );
  }
}

export interface DriveFileInfo {
  id: string;
  name: string;
  size?: string;
  mimeType?: string;
  webViewLink?: string;
}

// Thin wrapper over Google's REST APIs (Drive and Calendar) using each
// person's own refresh token. Plain fetch, no heavy SDK.
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private accessCache = new Map<string, { token: string; exp: number }>();

  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    private config: ConfigService,
  ) {}

  // ---- tokens ----

  async saveTokens(userId: string, refreshToken: string | undefined, scopes: string | undefined) {
    const patch: Partial<User> = {};
    if (refreshToken) patch.googleRefreshToken = encryptToken(refreshToken);
    if (scopes !== undefined) patch.googleScopes = scopes;
    if (Object.keys(patch).length) {
      await this.usersRepo.update(userId, patch as any);
      this.accessCache.delete(userId);
    }
  }

  // Which scopes did Google actually grant for this sign-in?
  async grantedScopes(accessToken: string): Promise<string> {
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!res.ok) return '';
      const body: any = await res.json();
      return body.scope ?? '';
    } catch {
      return '';
    }
  }

  async hasScope(userId: string, scope: string): Promise<boolean> {
    const u = await this.usersRepo.findOne({ where: { id: userId } });
    return !!u?.googleScopes?.includes(scope) && (await this.hasRefreshToken(userId));
  }

  private async hasRefreshToken(userId: string): Promise<boolean> {
    const row = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.googleRefreshToken')
      .where('u.id = :id', { id: userId })
      .getOne();
    return !!row?.googleRefreshToken;
  }

  private async accessToken(userId: string, what: string): Promise<string> {
    const cached = this.accessCache.get(userId);
    if (cached && cached.exp > Date.now() + 30_000) return cached.token;

    const row = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.googleRefreshToken')
      .where('u.id = :id', { id: userId })
      .getOne();
    const refresh = row?.googleRefreshToken ? decryptToken(row.googleRefreshToken) : null;
    if (!refresh) throw new GoogleNotConnectedError(what);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.get<string>('GOOGLE_CLIENT_ID') ?? '',
        client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
        refresh_token: refresh,
        grant_type: 'refresh_token',
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      if (body?.error === 'invalid_grant') {
        // Access was revoked or expired: forget the token so the UI asks to reconnect.
        await this.usersRepo.update(userId, { googleRefreshToken: null, googleScopes: null } as any);
        this.accessCache.delete(userId);
        throw new GoogleNotConnectedError(what);
      }
      this.logger.warn(`Token refresh failed (${res.status}): ${body?.error ?? ''}`);
      throw new BadRequestException('Could not reach Google right now. Please try again.');
    }
    this.accessCache.set(userId, { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 });
    return body.access_token;
  }

  private async call(userId: string, what: string, url: string, init: RequestInit = {}): Promise<Response> {
    const doFetch = async () => {
      const token = await this.accessToken(userId, what);
      return fetch(url, { ...init, headers: { ...(init.headers as any), Authorization: `Bearer ${token}` } });
    };
    let res = await doFetch();
    if (res.status === 401) {
      this.accessCache.delete(userId);
      res = await doFetch();
    }
    return res;
  }

  private async json<T = any>(res: Response, action: string): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`${action} failed (${res.status}): ${text.slice(0, 300)}`);
      if (res.status === 403 && /insufficient|scope|accessNotConfigured|disabled/i.test(text)) {
        throw new BadRequestException(
          'Google denied access. Reconnect your Google account and allow all requested permissions, and make sure the Drive and Calendar APIs are enabled.',
        );
      }
      if (res.status === 404) throw new BadRequestException('Not found on Google');
      throw new BadRequestException(`Google ${action} failed (${res.status})`);
    }
    return (await res.json()) as T;
  }

  // ---- Drive ----

  private esc(name: string) {
    return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  // Finds or creates one folder under `parentId` (or the Drive root).
  private async ensureFolder(userId: string, name: string, parentId?: string): Promise<string> {
    const q = [
      `name='${this.esc(name)}'`,
      `mimeType='application/vnd.google-apps.folder'`,
      'trashed=false',
      parentId ? `'${parentId}' in parents` : `'root' in parents`,
    ].join(' and ');
    const found = await this.json<{ files: { id: string }[] }>(
      await this.call(userId, 'Google Drive', `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&spaces=drive`),
      'folder lookup',
    );
    if (found.files?.length) return found.files[0].id;
    const created = await this.json<{ id: string }>(
      await this.call(userId, 'Google Drive', 'https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parentId ? { parents: [parentId] } : {}),
        }),
      }),
      'folder create',
    );
    return created.id;
  }

  async ensureFolderPath(userId: string, parts: string[]): Promise<string> {
    let parent: string | undefined;
    for (const part of parts) parent = await this.ensureFolder(userId, part.replace(/[\\/]/g, '-').slice(0, 120), parent);
    return parent!;
  }

  async uploadFile(userId: string, folderId: string, name: string, mimeType: string, data: Buffer): Promise<DriveFileInfo> {
    const boundary = `tasked-${Date.now().toString(16)}`;
    const meta = JSON.stringify({ name, parents: [folderId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await this.call(
      userId,
      'Google Drive',
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,webViewLink',
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    );
    return this.json<DriveFileInfo>(res, 'upload');
  }

  // Returns Google's response so the caller can stream the body to the browser.
  async downloadFile(userId: string, fileId: string): Promise<Response> {
    const res = await this.call(userId, 'Google Drive', `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!res.ok) {
      this.logger.warn(`Drive download failed (${res.status})`);
      throw new BadRequestException(
        res.status === 404
          ? 'The file is no longer in the owner’s Google Drive.'
          : 'Could not download the file from Google Drive.',
      );
    }
    return res;
  }

  async deleteFile(userId: string, fileId: string): Promise<void> {
    try {
      const res = await this.call(userId, 'Google Drive', `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) this.logger.warn(`Drive delete failed (${res.status})`);
    } catch (e: any) {
      this.logger.warn(`Drive delete skipped: ${e?.message ?? e}`);
    }
  }

  // ---- Calendar (primary calendar of the person) ----

  private cal = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  async listEvents(userId: string, timeMin: Date, timeMax: Date): Promise<any[]> {
    const items: any[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 6; page++) {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        showDeleted: 'false',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const body = await this.json<any>(await this.call(userId, 'Google Calendar', `${this.cal}?${params}`), 'calendar list');
      items.push(...(body.items ?? []));
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return items;
  }

  async insertEvent(userId: string, event: any): Promise<string> {
    const body = await this.json<{ id: string }>(
      await this.call(userId, 'Google Calendar', this.cal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }),
      'calendar insert',
    );
    return body.id;
  }

  // Returns false when the event no longer exists on Google.
  async patchEvent(userId: string, googleEventId: string, event: any): Promise<boolean> {
    const res = await this.call(userId, 'Google Calendar', `${this.cal}/${encodeURIComponent(googleEventId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (res.status === 404 || res.status === 410) return false;
    await this.json(res, 'calendar update');
    return true;
  }

  async deleteEvent(userId: string, googleEventId: string): Promise<void> {
    const res = await this.call(userId, 'Google Calendar', `${this.cal}/${encodeURIComponent(googleEventId)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      this.logger.warn(`Calendar delete failed (${res.status})`);
    }
  }
}
