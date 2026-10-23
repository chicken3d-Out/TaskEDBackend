import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { CalendarEvent } from './calendar-event.entity';
import { User } from '../users/user.entity';
import { Role, AccountStatus } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationType } from '../notifications/notification.entity';

export interface UpsertCalendarEventDto {
  title: string;
  description: string;
  eventDate: string; // ISO date string
  zoomLink?: string;
  isAnnouncement?: boolean;
}

const REMINDER_WINDOW_DAYS = 2;

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarEvent) private repo: Repository<CalendarEvent>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private notificationsService: NotificationsService,
    private realtimeGateway: NotificationsGateway,
  ) {}

  // Per spec: only Administrator and Admin Office (public-post) accounts
  // can create/edit calendar events and announcements.
  private assertCanManage(user: User) {
    if (user.role !== Role.ADMINISTRATOR && user.role !== Role.ADMIN_OFFICE_ACCOUNT) {
      throw new ForbiddenException(
        'Only Administrators and Administrative Office accounts can manage the calendar',
      );
    }
  }

  async create(user: User, dto: UpsertCalendarEventDto): Promise<CalendarEvent> {
    this.assertCanManage(user);
    const event = this.repo.create({
      title: dto.title,
      description: dto.description,
      eventDate: new Date(dto.eventDate),
      zoomLink: dto.zoomLink ?? null,
      isAnnouncement: dto.isAnnouncement ?? true,
      createdBy: user,
    });
    const saved = await this.repo.save(event);
    this.realtimeGateway.broadcast('calendar:changed', {});
    return saved;
  }

  async update(user: User, id: string, dto: Partial<UpsertCalendarEventDto>): Promise<CalendarEvent> {
    this.assertCanManage(user);
    const event = await this.repo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');

    if (dto.title !== undefined) event.title = dto.title;
    if (dto.description !== undefined) event.description = dto.description;
    if (dto.eventDate !== undefined) event.eventDate = new Date(dto.eventDate);
    if (dto.zoomLink !== undefined) event.zoomLink = dto.zoomLink;
    if (dto.isAnnouncement !== undefined) event.isAnnouncement = dto.isAnnouncement;

    const saved = await this.repo.save(event);
    this.realtimeGateway.broadcast('calendar:changed', {});
    return saved;
  }

  async remove(user: User, id: string): Promise<void> {
    this.assertCanManage(user);
    const event = await this.repo.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    await this.repo.remove(event);
    this.realtimeGateway.broadcast('calendar:changed', {});
  }

  // Shared public calendar - every approved user sees everything.
  findAll(): Promise<CalendarEvent[]> {
    return this.repo.find({ order: { eventDate: 'ASC' } });
  }

  findAnnouncements(): Promise<CalendarEvent[]> {
    return this.repo.find({
      where: { isAnnouncement: true, eventDate: MoreThanOrEqual(new Date()) },
      order: { eventDate: 'ASC' },
    });
  }

  // Runs daily; notifies every approved AO about events landing within
  // REMINDER_WINDOW_DAYS, once per event.
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async sendUpcomingReminders() {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const dueEvents = await this.repo.find({
      where: { eventDate: Between(now, windowEnd), reminderSent: false },
    });
    if (dueEvents.length === 0) return;

    const aos = await this.usersRepo.find({
      where: { role: Role.ADMIN_OFFICER, status: AccountStatus.APPROVED },
    });

    for (const event of dueEvents) {
      for (const ao of aos) {
        await this.notificationsService.create(
          ao,
          NotificationType.CALENDAR_REMINDER,
          `Upcoming: "${event.title}" on ${event.eventDate.toDateString()}`,
          event.id,
        );
      }
      event.reminderSent = true;
      await this.repo.save(event);
    }
  }
}
