import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../users/user.entity';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from '../push/push.service';

// Human-readable titles for the device push banner - the in-app
// notification just uses `message` directly, but a push notification
// needs a short title + body split.
const PUSH_TITLES: Record<NotificationType, string> = {
  [NotificationType.TICKET_UPDATE]: 'Task update',
  [NotificationType.ATTACHMENT_REQUEST]: 'Attachment requested',
  [NotificationType.TICKET_STATUS_CHANGE]: 'Task status changed',
  [NotificationType.ACCOUNT_APPROVED]: 'Account approved',
  [NotificationType.ACCOUNT_REJECTED]: 'Account update',
  [NotificationType.CALENDAR_REMINDER]: 'Upcoming event',
  [NotificationType.FORUM_REVIEW]: 'Forum',
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private repo: Repository<Notification>,
    private gateway: NotificationsGateway,
    private pushService: PushService,
  ) {}

  async create(
    user: User,
    type: NotificationType,
    message: string,
    relatedEntityId?: string,
  ): Promise<Notification> {
    const notification = this.repo.create({
      user,
      type,
      message,
      relatedEntityId: relatedEntityId ?? null,
    });
    const saved = await this.repo.save(notification);
    this.gateway.pushToUser(user.id, saved);

    // Fire-and-forget: device push is a nice-to-have on top of the
    // in-app/realtime notification above, never something that should
    // block or fail the request that triggered it.
    this.pushService
      .sendToUser(user, PUSH_TITLES[type] ?? 'TaskEd', message, {
        type,
        relatedEntityId: relatedEntityId ?? '',
      })
      .catch(() => {});

    return saved;
  }

  findForUser(userId: string): Promise<Notification[]> {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async markRead(userId: string, id: string): Promise<Notification | null> {
    const notification = await this.repo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!notification) return null;
    notification.read = true;
    return this.repo.save(notification);
  }
}
