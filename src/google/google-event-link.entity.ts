import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';

// Remembers which Google Calendar event is the copy of a TaskEd event in a
// given person's calendar, so edits and deletions can follow.
@Entity('google_event_links')
@Index(['user', 'event'], { unique: true })
export class GoogleEventLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => CalendarEvent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: CalendarEvent;

  @Column({ name: 'google_event_id' })
  googleEventId: string;
}
