import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum NotificationType {
  TICKET_UPDATE = 'ticket_update',
  ATTACHMENT_REQUEST = 'attachment_request',
  TICKET_STATUS_CHANGE = 'ticket_status_change',
  ACCOUNT_APPROVED = 'account_approved',
  ACCOUNT_REJECTED = 'account_rejected',
  CALENDAR_REMINDER = 'calendar_reminder',
  FORUM_REVIEW = 'forum_review',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column()
  message: string;

  // Loosely typed on purpose - points at a ticket id, user id, etc.
  // depending on `type`. The frontend knows how to route based on type.
  @Column({ name: 'related_entity_id', type: 'varchar', nullable: true })
  relatedEntityId: string | null;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
