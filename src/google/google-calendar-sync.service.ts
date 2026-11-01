import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AccountStatus } from '../common/enums/role.enum';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { CALENDAR_SCOPE, GoogleNotConnectedError, GoogleService } from './google.service';
import { GoogleEventLink } from './google-event-link.entity';
import { PersonalEvent } from './personal-event.entity';

const HOUR = 60 * 60 * 1000;
const PULL_PAST_DAYS = 30;
const PULL_FUTURE_DAYS = 365;
const MIN_SYNC_GAP_MS = 60 * 1000;

// Two-way sync with each person's own Google Calendar:
//  - TaskEd -> Google: every shared event/announcement is copied into the
//    primary calendar of every connected person, and edits/deletes follow.
//  - Google -> TaskEd: the person's own Google events are read into private
//    "personal events", shown only to that person.
@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);
  private lastSync = new Map<string, number>();

  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(CalendarEvent) private eventsRepo: Repository<CalendarEvent>,
    @InjectRepository(GoogleEventLink) private linksRepo: Repository<GoogleEventLink>,
    @InjectRepository(PersonalEvent) private personalRepo: Repository<PersonalEvent>,
    private google: GoogleService,
  ) {}

  // ---- who is connected ----

  private async connectedUsers(): Promise<User[]> {
    const users = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.googleRefreshToken')
      .where('u.googleRefreshToken IS NOT NULL')
      .andWhere('u.status = :s', { s: AccountStatus.APPROVED })
      .getMany();
    return users.filter((u) => u.googleScopes?.includes(CALENDAR_SCOPE));
  }

  async isConnected(userId: string): Promise<boolean> {
    return this.google.hasScope(userId, CALENDAR_SCOPE);
  }

  // ---- TaskEd -> Google ----

  private toGoogle(e: CalendarEvent) {
    const start = new Date(e.eventDate);
    const parts = [e.description, e.zoomLink ? `Zoom: ${e.zoomLink}` : '', 'Added by TaskEd'].filter(Boolean);
    return {
      summary: e.title,
      description: parts.join('\n\n'),
      start: { dateTime: start.toISOString() },
      end: { dateTime: new Date(start.getTime() + HOUR).toISOString() },
      extendedProperties: { private: { taskedEventId: e.id } },
    };
  }

  private async pushToUser(userId: string, e: CalendarEvent): Promise<void> {
    const link = await this.linksRepo.findOne({ where: { user: { id: userId }, event: { id: e.id } } });
    const body = this.toGoogle(e);
    if (link) {
      const ok = await this.google.patchEvent(userId, link.googleEventId, body);
      if (ok) return;
      await this.linksRepo.delete(link.id); // deleted by the person in Google: recreate below
    }
    const googleEventId = await this.google.insertEvent(userId, body);
    await this.linksRepo.save(this.linksRepo.create({ user: { id: userId } as User, event: { id: e.id } as CalendarEvent, googleEventId }));
  }

  // Runs in the background after a shared event is created or edited.
  pushEventToEveryone(e: CalendarEvent): void {
    void (async () => {
      const users = await this.connectedUsers();
      for (const u of users) {
        try {
          await this.pushToUser(u.id, e);
        } catch (err: any) {
          this.logger.warn(`Push to ${u.id} failed: ${err?.message ?? err}`);
        }
      }
    })().catch((err) => this.logger.warn(`Push failed: ${err?.message ?? err}`));
  }

  // Call BEFORE deleting the TaskEd event, while the links still exist.
  async removeEventFromEveryone(eventId: string): Promise<void> {
    const links = await this.linksRepo.find({ where: { event: { id: eventId } }, relations: ['user'] });
    void (async () => {
      for (const l of links) {
        try {
          await this.google.deleteEvent(l.user.id, l.googleEventId);
        } catch (err: any) {
          this.logger.warn(`Delete on Google failed: ${err?.message ?? err}`);
        }
      }
    })();
  }

  // ---- Google -> TaskEd (one person) ----

  private async pull(user: User): Promise<number> {
    const now = Date.now();
    const timeMin = new Date(now - PULL_PAST_DAYS * 24 * HOUR);
    const timeMax = new Date(now + PULL_FUTURE_DAYS * 24 * HOUR);
    const items = await this.google.listEvents(user.id, timeMin, timeMax);

    const seen = new Set<string>();
    for (const it of items) {
      if (it.status === 'cancelled') continue;
      if (it.extendedProperties?.private?.taskedEventId) continue; // our own copy
      const allDay = !!it.start?.date && !it.start?.dateTime;
      const startsAt = new Date(it.start?.dateTime ?? `${it.start?.date}T00:00:00`);
      if (isNaN(startsAt.getTime())) continue;
      const endRaw = it.end?.dateTime ?? (it.end?.date ? `${it.end.date}T00:00:00` : null);
      const endsAt = endRaw ? new Date(endRaw) : null;
      seen.add(it.id);
      const existing = await this.personalRepo.findOne({ where: { user: { id: user.id }, googleEventId: it.id } });
      const row = existing ?? this.personalRepo.create({ user: { id: user.id } as User, googleEventId: it.id });
      row.title = (it.summary ?? '(No title)').slice(0, 250);
      row.description = it.description ? String(it.description).slice(0, 4000) : null;
      row.startsAt = startsAt;
      row.endsAt = endsAt && !isNaN(endsAt.getTime()) ? endsAt : null;
      row.allDay = allDay;
      row.location = it.location ? String(it.location).slice(0, 250) : null;
      row.htmlLink = it.htmlLink ?? null;
      await this.personalRepo.save(row);
    }

    // Events deleted in Google inside the window disappear here too.
    const inWindow = await this.personalRepo
      .createQueryBuilder('p')
      .where('p.user_id = :id', { id: user.id })
      .andWhere('p.starts_at >= :min AND p.starts_at <= :max', { min: timeMin, max: timeMax })
      .getMany();
    const stale = inWindow.filter((p) => !seen.has(p.googleEventId)).map((p) => p.id);
    if (stale.length) await this.personalRepo.delete(stale);
    return seen.size;
  }

  // Copies upcoming shared events this person does not have yet.
  private async backfill(user: User): Promise<number> {
    const upcoming = await this.eventsRepo.find({
      where: { eventDate: MoreThanOrEqual(new Date(Date.now() - 24 * HOUR)) },
    });
    if (!upcoming.length) return 0;
    const links = await this.linksRepo.find({ where: { user: { id: user.id }, event: { id: In(upcoming.map((e) => e.id)) } }, relations: ['event'] });
    const have = new Set(links.map((l) => l.event.id));
    let added = 0;
    for (const e of upcoming) {
      if (have.has(e.id)) continue;
      await this.pushToUser(user.id, e);
      added++;
    }
    return added;
  }

  async syncUser(user: User, force = false): Promise<{ connected: boolean; pulled: number; pushed: number }> {
    if (!(await this.isConnected(user.id))) return { connected: false, pulled: 0, pushed: 0 };
    const last = this.lastSync.get(user.id) ?? 0;
    if (!force && Date.now() - last < MIN_SYNC_GAP_MS) return { connected: true, pulled: -1, pushed: -1 };
    this.lastSync.set(user.id, Date.now());
    try {
      const pulled = await this.pull(user);
      const pushed = await this.backfill(user);
      return { connected: true, pulled, pushed };
    } catch (e) {
      if (e instanceof GoogleNotConnectedError) return { connected: false, pulled: 0, pushed: 0 };
      throw e;
    }
  }

  // After sign-in grants access: bring the calendars together in the background.
  syncAfterConnect(user: User): void {
    this.syncUser(user, true).catch((e) => this.logger.warn(`Initial sync failed: ${e?.message ?? e}`));
  }

  personalEvents(userId: string): Promise<PersonalEvent[]> {
    return this.personalRepo.find({
      where: { user: { id: userId } },
      order: { startsAt: 'ASC' },
    });
  }
}
