import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { ForumReply } from './forum-reply.entity';

export enum ForumQuestionStatus {
  PENDING = 'pending', // waiting for an Administrator
  APPROVED = 'approved', // visible to all AOs
  REJECTED = 'rejected',
}

// AO-only: only Administrative Officers post, reply, or vote. A new question
// is hidden until an Administrator approves it; replies need no approval.
// Enforced in ForumService, not here.
@Entity('forum_questions')
export class ForumQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: ForumQuestionStatus, default: ForumQuestionStatus.PENDING })
  status: ForumQuestionStatus;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reject_reason', type: 'varchar', nullable: true })
  rejectReason: string | null;

  @Column({ default: 0 })
  upvotes: number;

  @Column({ default: 0 })
  downvotes: number;

  @OneToMany(() => ForumReply, (reply) => reply.question)
  replies: ForumReply[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
