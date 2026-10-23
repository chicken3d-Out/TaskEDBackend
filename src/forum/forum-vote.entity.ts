import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum ForumVoteTargetType {
  QUESTION = 'question',
  REPLY = 'reply',
}

// Polymorphic on purpose (targetId points at a ForumQuestion or ForumReply
// depending on targetType) so one table + one unique index covers voting
// for both without a join table per entity.
@Entity('forum_votes')
@Index(['user', 'targetType', 'targetId'], { unique: true })
export class ForumVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'target_type', type: 'enum', enum: ForumVoteTargetType })
  targetType: ForumVoteTargetType;

  @Column({ name: 'target_id' })
  targetId: string;

  // +1 (upvote) or -1 (downvote)
  @Column()
  value: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
