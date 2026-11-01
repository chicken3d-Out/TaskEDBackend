import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// A file a Teacher, School Head or Administrative Officer keeps for
// themselves. The file lives in their own Google Drive; only its Drive id,
// label and school year are kept here. Private to the owner.
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

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar' })
  mimeType: string;

  @Column({ type: 'int', default: 0 })
  size: number;

  @Column({ name: 'drive_file_id' })
  driveFileId: string;

  // e.g. "2025-2026" (shown as "S.Y. 2025-2026")
  @Column({ name: 'school_year' })
  schoolYear: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
