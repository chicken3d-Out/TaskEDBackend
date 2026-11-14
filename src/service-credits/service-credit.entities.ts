import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

// Which kinds of leave credit a person can have:
//   Teachers:      service_credit, wellness
//   Non-teaching:  vl_sl (Vacation + Sick Leave as one credit), wellness, spl, fl, cto
export type CreditKind = 'service_credit' | 'wellness' | 'vl_sl' | 'spl' | 'fl' | 'cto';
export type CreditLogType = 'initial' | 'special_order' | 'edit' | 'reset' | 'deduction' | 'restore';

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
