import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// An event that comes from one person's own Google Calendar. It is private:
// only that person sees it in TaskEd.
@Entity('personal_events')
@Index(['user', 'googleEventId'], { unique: true })
export class PersonalEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'google_event_id' })
  googleEventId: string;

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
