import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

export type TaStatus = 'draft' | 'awaiting_requester' | 'awaiting_countersign' | 'awaiting_recommending' | 'awaiting_approving' | 'awaiting_email' | 'approved' | 'emailed';

export interface TaSignature {
  img: string; // PNG data URL, a snapshot of the signer's signature at signing time
  x: number; // centre of the signature, as a fraction of the page width (0-1)
  y: number; // centre of the signature, as a fraction of the page height (0-1)
  at: string; // ISO time it was signed
}

export interface TaFormData {
  name: string; position: string; station: string; purpose: string; host: string;
  dates: string; destination: string; fund: string;
  dateFrom: string; // yyyy-mm-dd, first day of travel (used for the log)
  dateTo: string;
}

// One Travel Authority (DepEd Order 043 s. 2022). The Word file itself lives in the
// owner's own Google Drive; TaskEd keeps only the typed-in fields and the signatures
// so the next signer can open and sign it. Built into the Word file in the browser.
@Entity('travel_authorities')
@Index(['owner'])
@Index(['requester'])
export class TravelAuthority {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // who created it (and whose Drive keeps the soft copy)
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  // the employee who is travelling (signs first)
  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @Column({ type: 'jsonb' })
  data: TaFormData;

  @Column({ default: false })
  outside: boolean; // true = outside the Schools Division of Leyte

  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status: TaStatus;

  // Outside the Division: the School Head countersigns before the District Supervisor.
  @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'countersign_user_id' })
  countersignUser: User | null;

  @Column({ name: 'countersign_name', type: 'varchar', length: 150, default: '' })
  countersignName: string;

  @Column({ name: 'sig_countersign', type: 'jsonb', nullable: true })
  sigCountersign: TaSignature | null;

  // true = the approving authority (Schools Division Superintendent) does not e-sign:
  // the signed form is emailed to the Travel Authority mailbox instead.
  @Column({ name: 'approving_by_email', default: false })
  approvingByEmail: boolean;

  @Column({ name: 'emailed_at', type: 'timestamptz', nullable: true })
  emailedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'recommending_user_id' })
  recommendingUser: User | null;

  @Column({ name: 'recommending_name', type: 'varchar', length: 150, default: '' })
  recommendingName: string;

  @ManyToOne(() => User, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approving_user_id' })
  approvingUser: User | null;

  @Column({ name: 'approving_name', type: 'varchar', length: 150, default: '' })
  approvingName: string;

  @Column({ name: 'sig_requester', type: 'jsonb', nullable: true })
  sigRequester: TaSignature | null;

  @Column({ name: 'sig_recommending', type: 'jsonb', nullable: true })
  sigRecommending: TaSignature | null;

  @Column({ name: 'sig_approving', type: 'jsonb', nullable: true })
  sigApproving: TaSignature | null;

  // Official number printed in the upper-right corner (e.g. E-11-205), added by the DS Secretary once approved
  @Index('UQ_ta_number', { unique: true })
  @Column({ name: 'ta_number', type: 'varchar', length: 30, nullable: true })
  taNumber: string | null;

  @Column({ name: 'ta_numbered_at', type: 'timestamptz', nullable: true })
  taNumberedAt: Date | null;

  // bumps on every change; the owner's Drive copy is rebuilt when drive_rev < rev
  @Column({ default: 1 })
  rev: number;

  @Column({ name: 'drive_rev', default: 0 })
  driveRev: number;

  @Column({ name: 'drive_link', type: 'varchar', length: 1500, nullable: true })
  driveLink: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
