import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ForumQuestion } from './forum-question.entity';
import { ForumReply } from './forum-reply.entity';
import { ForumVote, ForumVoteTargetType } from './forum-vote.entity';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { NotificationsGateway } from '../notifications/notifications.gateway';

export type ForumSort = 'top' | 'recent';

@Injectable()
export class ForumService {
  constructor(
    @InjectRepository(ForumQuestion) private questionsRepo: Repository<ForumQuestion>,
    @InjectRepository(ForumReply) private repliesRepo: Repository<ForumReply>,
    @InjectRepository(ForumVote) private votesRepo: Repository<ForumVote>,
    private dataSource: DataSource,
    private realtimeGateway: NotificationsGateway,
  ) {}

  // Spec decision: the forum is AO-only, end to end - posting, replying,
  // and voting are all restricted to Administrative Officers.
  private assertIsAo(user: User) {
    if (user.role !== Role.ADMIN_OFFICER) {
      throw new ForbiddenException('The Ask-a-Question forum is only open to Administrative Officers');
    }
  }

  async createQuestion(user: User, title: string, body: string): Promise<ForumQuestion> {
    this.assertIsAo(user);
    const question = this.questionsRepo.create({ author: user, title, body });
    const saved = await this.questionsRepo.save(question);
    this.realtimeGateway.broadcast('forum:changed', {});
    return saved;
  }

  listQuestions(sort: ForumSort = 'recent'): Promise<ForumQuestion[]> {
    if (sort === 'top') {
      return this.questionsRepo
        .createQueryBuilder('q')
        .orderBy('q.upvotes - q.downvotes', 'DESC')
        .addOrderBy('q.createdAt', 'DESC')
        .getMany();
    }
    return this.questionsRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getQuestion(id: string): Promise<{ question: ForumQuestion; replies: ForumReply[] }> {
    const question = await this.questionsRepo.findOne({ where: { id } });
    if (!question) throw new NotFoundException('Question not found');
    const replies = await this.repliesRepo.find({
      where: { question: { id } },
      relations: ['parentReply'],
      order: { createdAt: 'ASC' },
    });
    return { question, replies };
  }

  async createReply(
    user: User,
    questionId: string,
    body: string,
    parentReplyId?: string,
  ): Promise<ForumReply> {
    this.assertIsAo(user);
    const question = await this.questionsRepo.findOne({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');

    let parentReply: ForumReply | null = null;
    if (parentReplyId) {
      parentReply = await this.repliesRepo.findOne({ where: { id: parentReplyId } });
      if (!parentReply) throw new NotFoundException('Parent reply not found');
    }

    const reply = this.repliesRepo.create({ question, author: user, body, parentReply });
    const saved = await this.repliesRepo.save(reply);
    this.realtimeGateway.broadcast('forum:changed', { questionId });
    return saved;
  }

  // Toggle-able voting: casting the same value again removes the vote;
  // casting the opposite value flips it; casting a fresh value records it.
  // Runs in a transaction since it touches both the vote row and the
  // denormalized upvotes/downvotes counters on the target.
  async vote(
    user: User,
    targetType: ForumVoteTargetType,
    targetId: string,
    value: 1 | -1,
  ): Promise<{ upvotes: number; downvotes: number }> {
    this.assertIsAo(user);

    return this.dataSource.transaction(async (manager) => {
      const targetRepo =
        targetType === ForumVoteTargetType.QUESTION
          ? manager.getRepository(ForumQuestion)
          : manager.getRepository(ForumReply);
      const votesRepo = manager.getRepository(ForumVote);

      const target = await targetRepo.findOne({
        where: { id: targetId },
        // Only replies need the parent question loaded - to know which
        // question view to nudge into refreshing after the vote.
        relations: targetType === ForumVoteTargetType.REPLY ? ['question'] : [],
      });
      if (!target) throw new NotFoundException('Vote target not found');

      const existing = await votesRepo.findOne({
        where: { user: { id: user.id }, targetType, targetId },
      });

      if (!existing) {
        await votesRepo.save(votesRepo.create({ user, targetType, targetId, value }));
        if (value === 1) target.upvotes += 1;
        else target.downvotes += 1;
      } else if (existing.value === value) {
        await votesRepo.remove(existing);
        if (value === 1) target.upvotes = Math.max(0, target.upvotes - 1);
        else target.downvotes = Math.max(0, target.downvotes - 1);
      } else {
        existing.value = value;
        await votesRepo.save(existing);
        if (value === 1) {
          target.upvotes += 1;
          target.downvotes = Math.max(0, target.downvotes - 1);
        } else {
          target.downvotes += 1;
          target.upvotes = Math.max(0, target.upvotes - 1);
        }
      }

      await manager.save(target);
      const questionId =
        targetType === ForumVoteTargetType.QUESTION ? targetId : (target as ForumReply).question?.id;
      this.realtimeGateway.broadcast('forum:changed', { questionId });
      return { upvotes: target.upvotes, downvotes: target.downvotes };
    });
  }
}
