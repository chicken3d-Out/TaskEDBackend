import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { CreditKind } from './service-credit.entities';

export type LeaveStatus = 'awaiting_applicant' | 'awaiting_ao' | 'ao_approved' | 'awaiting_signatory' | 'approved' | 'disapproved';

export interface LeaveSig { img: string; x: number; y: number; at: string }
export interface LeaveData {
  office: string; lastName: string; firstName: string; middleName: string; filingDate: string; position: string; salary: string;
  leaveType: string; otherLeave: string;
  where: '' | 'ph' | 'abroad'; whereText: string; illness: '' | 'hospital' | 'outpatient'; illnessText: string; womenText: string; study: '' | 'masters' | 'bar'; monetization: '' | 'monetization' | 'terminal';
  days: number; dates: string; commutation: 'not' | 'requested';
}

const num = { to: (v: number | null) => v, from: (v: string | null) => (v == null ? v : parseFloat(v)) };

// A Form 6 (Application for Leave).
@Entity('leave_applications')
export class LeaveApplication {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false, eager: true })
  @JoinColumn({ name: 'applicant_id' })
  applicant: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true, eager: true })
  @JoinColumn({ name: 'filed_by_id' })
  filedBy: User | null;

  @Column({ type: 'varchar', length: 24, default: 'awaiting_applicant' }) status: LeaveStatus;
  @Column({ type: 'jsonb' }) data: LeaveData;
  // which credit is deducted (null: none)
  @Column({ type: 'varchar', length: 20, nullable: true }) kind: CreditKind | null;
  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: num }) days: number;
  @Column({ type: 'jsonb', default: () => "'{}'" }) sigs: { applicant?: LeaveSig; ao?: LeaveSig; signatory?: LeaveSig };
  // 7.A: the credit at the time it was deducted
  @Column({ type: 'jsonb', nullable: true }) credit: { asOf: string; label: string; earned: number; less: number; balance: number } | null;
  @Column({ default: false }) deducted: boolean;
  @Column({ type: 'jsonb', nullable: true }) recommendation: { decision: 'approval' | 'disapproval'; reason: string } | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) note: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
