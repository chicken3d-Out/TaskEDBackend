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

  // Stored in Cloudinary: where to open it, and its id there (so it can be removed)
  @Column({ type: 'varchar', length: 600, nullable: true })
  url: string | null;

  @Column({ name: 'public_id', type: 'varchar', length: 300, nullable: true })
  publicId: string | null;

  // older attachments (before Cloudinary) kept their bytes here
  @Column({ type: 'bytea', nullable: true, select: false })
  data: Buffer | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
