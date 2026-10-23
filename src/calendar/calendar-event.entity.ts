import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

// One entity backs both the shared calendar and the Announcements section -
// per the spec, "every announcement with a date should also appear as a
// calendar event, and vice versa". `isAnnouncement` just decides whether it
// also surfaces in the dedicated Announcements list.
@Entity('calendar_events')
export class CalendarEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'event_date', type: 'timestamptz' })
  eventDate: Date;

  @Column({ name: 'zoom_link', type: 'varchar', nullable: true })
  zoomLink: string | null;

  @Column({ name: 'is_announcement', default: true })
  isAnnouncement: boolean;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  // Flipped once the T-2-day AO reminder has fired, so the cron job
  // doesn't spam the same reminder every run.
  @Column({ name: 'reminder_sent', default: false })
  reminderSent: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
