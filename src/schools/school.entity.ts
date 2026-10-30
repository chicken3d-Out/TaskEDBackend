import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('schools')
export class School {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  district: string;

  @Column({ type: 'varchar', default: '1' })
  area: string;

  // ---- school profile (edited by the school account or an Administrator) ----
  @Column({ name: 'school_code', type: 'varchar', nullable: true })
  schoolCode: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ name: 'contact_number', type: 'varchar', nullable: true })
  contactNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ name: 'school_head_name', type: 'varchar', nullable: true })
  schoolHeadName: string | null;

  @Column({ name: 'school_head_contact', type: 'varchar', nullable: true })
  schoolHeadContact: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
