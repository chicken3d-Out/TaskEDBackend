import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TravelAuthority } from './travel-authority.entity';

// A supporting document the applicant attached (optional). Kept so the signers can open it
// and so it can be emailed with the signed form.
@Entity('travel_attachments')
export class TravelAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TravelAuthority, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travel_authority_id' })
  travelAuthority: TravelAuthority;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  mime: string;

  @Column({ type: 'int' })
  size: number;

  @Column({ type: 'bytea', select: false })
  data: Buffer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
