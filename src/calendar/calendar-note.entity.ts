import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// A private note a person puts on a day of the TaskEd calendar.
// Only its owner can see, change or delete it.
@Entity('calendar_notes')
@Index(['owner', 'noteDate'])
export class CalendarNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  // calendar day, "YYYY-MM-DD"
  @Column({ name: 'note_date', type: 'varchar', length: 10 })
  noteDate: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
