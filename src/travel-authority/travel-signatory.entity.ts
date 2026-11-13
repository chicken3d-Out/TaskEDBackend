import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { User } from '../users/user.entity';

// Set by the Administrator: who the District Supervisor and the Schools Division
// Superintendent are (key 'district_supervisor' | 'sds'), their TaskEd account, and
// the name printed on the form.
@Entity('travel_signatories')
export class TravelSignatory {
  @PrimaryColumn({ type: 'varchar', length: 30 })
  key: string;

  @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 150, default: '' })
  name: string;

  // The District Supervisor's signature (PNG), uploaded by the Administrator, so the DS Secretary can sign for them.
  @Column({ type: 'text', nullable: true })
  signature: string | null;
}
