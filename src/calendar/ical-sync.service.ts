import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ical from 'node-ical';
import { User } from '../users/user.entity';
import { PersonalEvent } from './personal-event.entity';
import { decryptToken, encryptToken } from '../common/token-crypto';

const DAY = 24 * 60 * 60 * 1000;
const PULL_PAST_DAYS = 30;
const PULL_FUTURE_DAYS = 365;
const MIN_SYNC_GAP_MS = 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_EVENTS = 3000;

// One-way: a person's own Google Calendar -> their private view in TaskEd.
// TaskEd asks Google for nothing. The person copies the "Secret address in
// iCal format" from their Google Calendar settings and pastes it in; TaskEd
// reads that address like a subscribed calendar. Nothing is ever written to
// Google.
@Injectable()
export class IcalSyncService {
  private readonly logger = new Logger(IcalSyncService.name);
  private lastSync = new Map<string, number>();

  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(PersonalEvent) private eventsRepo: Repository<PersonalEvent>,
  ) {}

  // Only Google Calendar's own iCal addresses are accepted (this also stops
  // the server being pointed at other websites).
  static validateUrl(raw: string | undefined): string {
    let u: URL;
    try {
      u = new URL((raw ?? '').trim());
    } catch {
      throw new BadRequestException('That is not a valid link.');
    }
    if (u.protocol !== 'https:' || u.hostname !== 'calendar.google.com' || !u.pathname.startsWith('/calendar/ical/') || !u.pathname.endsWith('.ics')) {
      throw new BadRequestException(
        'Paste the "Secret address in iCal format" from your Google Calendar settings. It starts with https://calendar.google.com/calendar/ical/ and ends with .ics',
      );
    }
    return u.toString();
  }

  private async fetchIcs(url: string): Promise<string> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'manual', headers: { Accept: 'text/calendar' } });
      if (res.status >= 300 && res.status < 400) throw new BadRequestException('Google did not accept that calendar link. Copy it again.');
      if (!res.ok) throw new BadRequestException('Could not read that calendar. Check the link and try again.');
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > MAX_BYTES) throw new BadRequestException('That calendar is too large to read.');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new BadRequestException('That calendar is too large to read.');
      const text = buf.toString('utf8');
      if (!text.includes('BEGIN:VCALENDAR')) throw new BadRequestException('That link is not a calendar.');
      return text;
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`iCal fetch failed: ${e?.message ?? e}`);
      throw new BadRequestException('Could not reach Google Calendar. Try again in a moment.');
    } finally {
      clearTimeout(timer);
    }
  }

  private toRows(text: string, userId: string): Partial<PersonalEvent>[] {
    const from = new Date(Date.now() - PULL_PAST_DAYS * DAY);
    const to = new Date(Date.now() + PULL_FUTURE_DAYS * DAY);
    const parsed = ical.parseICS(text);
    const rows = new Map<string, Partial<PersonalEvent>>();
    for (const item of Object.values(parsed)) {
      if (!item || item.type !== 'VEVENT') continue;
      const ev: any = item;
      if (String(ev.status ?? '').toUpperCase() === 'CANCELLED') continue;
      let instances: any[];
      try {
        instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: true }) as any[];
      } catch {
        continue;
      }
      for (const inst of instances) {
        const start: Date | undefined = inst.start;
        if (!start || isNaN(start.getTime())) continue;
        const allDay = !!(inst.isFullDay ?? ev.datetype === 'date');
        let startsAt = start;
        let endsAt: Date | null = inst.end && !isNaN(inst.end.getTime()) ? inst.end : null;
        if (allDay) {
          // keep the calendar day, independent of the server's time zone
          const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 4);
          startsAt = new Date(day(start));
          endsAt = endsAt ? new Date(day(endsAt)) : null;
        }
        const uid = `${String(ev.uid ?? inst.uid ?? '').slice(0, 180)}#${startsAt.getTime()}`;
        const text = (v: any) => (typeof v === 'string' ? v : v?.val ? String(v.val) : v ? String(v) : '');
        rows.set(uid, {
          user: { id: userId } as User,
          uid,
          title: (text(inst.summary ?? ev.summary) || '(No title)').slice(0, 250),
          description: text(inst.description ?? ev.description).slice(0, 4000) || null,
          startsAt,
          endsAt,
          allDay,
          location: text(inst.location ?? ev.location).slice(0, 250) || null,
          htmlLink: null,
        });
        if (rows.size >= MAX_EVENTS) return [...rows.values()];
      }
    }
    return [...rows.values()];
  }

  private async storedUrl(userId: string): Promise<string | null> {
    const row = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.calendarIcalUrl')
      .where('u.id = :id', { id: userId })
      .getOne();
    return row?.calendarIcalUrl ? decryptToken(row.calendarIcalUrl) : null;
  }

  async isLinked(userId: string): Promise<boolean> {
    const u = await this.usersRepo.findOne({ where: { id: userId } });
    return !!u?.calendarLinked;
  }

  // Saves the link (after proving it works) and reads the calendar once.
  async link(user: User, rawUrl: string) {
    const url = IcalSyncService.validateUrl(rawUrl);
    await this.fetchIcs(url); // fails with a clear message if it is wrong
    await this.usersRepo.update(user.id, { calendarIcalUrl: encryptToken(url), calendarLinked: true } as any);
    return this.sync(user, true);
  }

  async unlink(user: User) {
    await this.usersRepo.update(user.id, { calendarIcalUrl: null, calendarLinked: false } as any);
    await this.eventsRepo.delete({ user: { id: user.id } });
    this.lastSync.delete(user.id);
    return { ok: true };
  }

  async sync(user: User, force = false): Promise<{ linked: boolean; count: number; events: PersonalEvent[] }> {
    const url = await this.storedUrl(user.id);
    if (!url) return { linked: false, count: 0, events: [] };
    const last = this.lastSync.get(user.id) ?? 0;
    if (!force && Date.now() - last < MIN_SYNC_GAP_MS) {
      const events = await this.personalEvents(user.id);
      return { linked: true, count: events.length, events };
    }
    this.lastSync.set(user.id, Date.now());
    const text = await this.fetchIcs(url);
    const rows = this.toRows(text, user.id);
    await this.eventsRepo.manager.transaction(async (m) => {
      await m.delete(PersonalEvent, { user: { id: user.id } });
      for (let i = 0; i < rows.length; i += 200) await m.insert(PersonalEvent, rows.slice(i, i + 200) as any);
    });
    const events = await this.personalEvents(user.id);
    return { linked: true, count: events.length, events };
  }

  personalEvents(userId: string): Promise<PersonalEvent[]> {
    return this.eventsRepo.find({ where: { user: { id: userId } }, order: { startsAt: 'ASC' } });
  }
}
