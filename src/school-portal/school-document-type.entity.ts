import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A document every school is expected to upload (for example the Annual
// Implementation Plan). Administrators decide which ones exist.
@Entity('school_document_types')
export class SchoolDocumentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ default: false })
  required: boolean;

  // Inactive types are hidden from schools but their files are kept.
  @Column({ default: true })
  active: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
