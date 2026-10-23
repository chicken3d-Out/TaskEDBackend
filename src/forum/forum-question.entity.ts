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

// AO-only end to end: only Administrative Officers post, reply, or vote.
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
