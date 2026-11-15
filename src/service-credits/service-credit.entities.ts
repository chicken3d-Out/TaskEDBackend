import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

// Which kinds of leave credit a person can have:
//   Teachers:      service_credit, wellness
//   Non-teaching:  vl (earns 10 a year), sl (earns 15 a year), wellness, spl, fl, cto
export type CreditKind = 'service_credit' | 'wellness' | 'vl' | 'sl' | 'spl' | 'fl' | 'cto';
export type CreditLogType = 'initial' | 'special_order' | 'edit' | 'reset' | 'deduction' | 'restore' | 'accrual' | 'expiry';

const num = { to: (v: number | null) => v, from: (v: string | null) => (v == null ? v : parseFloat(v)) };

@Entity('leave_credits')
@Index('UQ_leave_credit_user_kind', ['user', 'kind'], { unique: true })
export class LeaveCredit {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20 }) kind: CreditKind;

  @Column({ type: 'numeric', precision: 7, scale: 2, default: 0, transformer: num }) balance: number;

  // the AO may set the first count freely; after that a change needs the Administrator
  @Column({ name: 'initial_set', default: false }) initialSet: boolean;

  // Wellness Leave: the year this balance belongs to (it goes back to 5 every year)
  @Column({ type: 'int', nullable: true }) year: number | null;

  // Vacation / Sick Leave: the last month ('YYYY-MM') whose monthly earning was added
  @Column({ name: 'accrual_month', type: 'varchar', length: 7, nullable: true }) accrualMonth: string | null;

  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('leave_credit_logs')
export class LeaveCreditLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20 }) kind: CreditKind;
  @Column({ type: 'varchar', length: 20 }) type: CreditLogType;

  @Column({ type: 'numeric', precision: 7, scale: 2, transformer: num }) delta: number;
  @Column({ name: 'balance_after', type: 'numeric', precision: 7, scale: 2, transformer: num }) balanceAfter: number;

  @Column({ type: 'text', nullable: true }) reason: string | null;

  // Special Order that added the credit
  @Column({ name: 'so_number', type: 'varchar', length: 100, nullable: true }) soNumber: string | null;
  @Column({ name: 'file_name', type: 'varchar', length: 200, nullable: true }) fileName: string | null;
  @Column({ name: 'file_url', type: 'varchar', length: 600, nullable: true }) fileUrl: string | null;
  @Column({ name: 'file_public_id', type: 'varchar', length: 300, nullable: true }) filePublicId: string | null;

  // CTO added by a Special Order is good for one year from the date it was approved
  @Column({ name: 'expires_at', type: 'date', nullable: true }) expiresAt: string | null;
  @Column({ type: 'jsonb', nullable: true }) meta: unknown;

  // the leave application that used the credit (release 2)
  @Column({ name: 'leave_id', type: 'uuid', nullable: true }) leaveId: string | null;

  @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('leave_credit_requests')
export class LeaveCreditRequest {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false, eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20 }) kind: CreditKind;

  @Column({ name: 'old_balance', type: 'numeric', precision: 7, scale: 2, transformer: num }) oldBalance: number;
  @Column({ name: 'new_balance', type: 'numeric', precision: 7, scale: 2, transformer: num }) newBalance: number;
  @Column({ type: 'text' }) reason: string;

  @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by_id' })
  requestedBy: User | null;

  @Column({ type: 'varchar', length: 12, default: 'pending' }) status: 'pending' | 'approved' | 'rejected';

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decided_by_id' })
  decidedBy: User | null;

  @Column({ name: 'decided_note', type: 'text', nullable: true }) decidedNote: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

// CTO comes in batches because each Special Order's hours expire a year after approval.
@Entity('leave_credit_batches')
export class LeaveCreditBatch {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 20, default: 'cto' }) kind: CreditKind;
  @Column({ type: 'numeric', precision: 7, scale: 2, transformer: num }) amount: number;
  @Column({ type: 'numeric', precision: 7, scale: 2, transformer: num }) remaining: number;
  @Column({ name: 'expires_at', type: 'date', nullable: true }) expiresAt: string | null;
  @Column({ name: 'so_number', type: 'varchar', length: 100, nullable: true }) soNumber: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
