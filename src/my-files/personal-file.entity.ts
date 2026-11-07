import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// A file a Teacher, School Head or Administrative Officer keeps for
// themselves. The file stays in their own Google Drive / OneDrive; only its
// share link, label, category and school year are kept here. Private to the owner.
@Entity('personal_files')
@Index(['owner', 'schoolYear'])
export class PersonalFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column()
  label: string;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 1500 })
  link: string;

  // 'storage' = File Storage (by school year); 'working' = Working Directory Files (PDS, Service Record...)
  @Column({ type: 'varchar', length: 20, default: 'storage' })
  section: string;

  // e.g. "2025-2026" (shown as "S.Y. 2025-2026")
  @Column({ name: 'school_year' })
  schoolYear: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
