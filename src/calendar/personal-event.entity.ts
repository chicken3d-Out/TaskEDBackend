import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// An event read from one person's own Google Calendar (through the private
// iCal link they paste in). It is private: only that person sees it in TaskEd.
@Entity('personal_events')
@Index(['user', 'uid'], { unique: true })
export class PersonalEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // calendar UID plus start time, so each repeat of a recurring event is its own row
  @Column()
  uid: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ name: 'all_day', default: false })
  allDay: boolean;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ name: 'html_link', type: 'varchar', nullable: true })
  htmlLink: string | null;
}
