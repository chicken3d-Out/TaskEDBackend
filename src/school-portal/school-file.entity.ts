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

// One slot per school + document type + kind + school year; saving a new
// link replaces it. The file itself stays in the uploader's own cloud storage
// (Google Drive or OneDrive); only its share link is kept here (older files
// were uploaded to Cloudinary and keep their URL in the same column).
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

  @Column({ name: 'file_url', type: 'varchar' })
  fileUrl: string;

  // e.g. "2025-2026" (shown as "S.Y. 2025-2026")
  @Column({ name: 'school_year' })
  schoolYear: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
