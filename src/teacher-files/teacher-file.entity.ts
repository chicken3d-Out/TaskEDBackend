import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';

// The Administrative Officer's own copy of a teacher's document (PDS, Service
// Record...). The file sits in the AO's Google Drive under
// TaskEd Files / Teachers / <School> / <Teacher>; only its link is kept here.
// It is separate from the teacher's own "My files" and private to the AO.
@Entity('teacher_files')
@Index(['owner', 'teacher'])
export class TeacherFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher: User;

  // PDS, Service Record, Service Credit, SALN, Other ...
  @Column({ length: 60 })
  section: string;

  @Column({ length: 150 })
  label: string;

  @Column({ type: 'varchar', length: 1500 })
  link: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
