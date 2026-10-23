import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { ForumQuestion } from './forum-question.entity';

@Entity('forum_replies')
export class ForumReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ForumQuestion, (question) => question.replies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: ForumQuestion;

  // Null = a top-level reply to the question. Set = a reply-to-a-reply,
  // giving the "threaded mini-discussions" the spec asks for.
  @ManyToOne(() => ForumReply, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_reply_id' })
  parentReply: ForumReply | null;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: 0 })
  upvotes: number;

  @Column({ default: 0 })
  downvotes: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
