import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { School } from '../schools/school.entity';
import { User } from '../users/user.entity';
import { SchoolDocumentType } from './school-document-type.entity';

export type SchoolFileKind = 'soft' | 'scanned';

// One slot per school + document type + kind + school year; uploading again
// replaces it. New files live in the uploader's own Google Drive (driveFileId);
// older ones were stored on Cloudinary (fileUrl).
@Entity('school_files')
@Index(['school', 'documentType', 'kind', 'schoolYear'], { unique: true })
export class SchoolFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @ManyToOne(() => SchoolDocumentType, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'document_type_id' })
  documentType: SchoolDocumentType;

  @Column({ type: 'varchar' })
  kind: SchoolFileKind;

  @Column({ name: 'file_name', type: 'varchar' })
  fileName: string;

  @Column({ name: 'file_url', type: 'varchar', nullable: true })
  fileUrl: string | null;

  @Column({ name: 'drive_file_id', type: 'varchar', nullable: true })
  driveFileId: string | null;

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType: string | null;

  // e.g. "2025-2026" (shown as "S.Y. 2025-2026")
  @Column({ name: 'school_year' })
  schoolYear: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
