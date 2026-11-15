import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../users/user.entity';

// A problem reported by any signed-in user; only the Administrator reads them.
@Entity('bug_reports')
export class BugReport {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User | null;
  @Column({ type: 'varchar', length: 140 }) title: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) page: string | null; // where in the app they were
  @Column({ type: 'varchar', length: 300, nullable: true, name: 'user_agent' }) userAgent: string | null;
  @Column({ type: 'varchar', length: 12, default: 'open' }) status: 'open' | 'resolved';
  @Column({ type: 'text', nullable: true, name: 'admin_note' }) adminNote: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
