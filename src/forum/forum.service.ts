import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ForumQuestion, ForumQuestionStatus } from './forum-question.entity';
import { ForumReply } from './forum-reply.entity';
import { ForumVote, ForumVoteTargetType } from './forum-vote.entity';
import { User } from '../users/user.entity';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';

export type ForumSort = 'top' | 'recent';

// Only what a "mini profile" card needs - never the email, tokens, etc.
export interface PublicProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  designation: string | null;
  school: string | null;
  district: string | null;
  area: string | null;
}

@Injectable()
export class ForumService {
  constructor(
    @InjectRepository(ForumQuestion) private questionsRepo: Repository<ForumQuestion>,
    @InjectRepository(ForumReply) private repliesRepo: Repository<ForumReply>,
    @InjectRepository(ForumVote) private votesRepo: Repository<ForumVote>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private dataSource: DataSource,
    private realtimeGateway: NotificationsGateway,
    private notifications: NotificationsService,
  ) {}

  // The forum is for Administrative Officers. Administrators can read
  // everything and moderate, but do not post, reply or vote.
  private assertIsAo(user: User) {
    if (user.role !== Role.ADMIN_OFFICER) {
      throw new ForbiddenException('Only Administrative Officers can post, reply or vote in the forum');
    }
  }
  private assertIsAdmin(user: User) {
    if (user.role !== Role.ADMINISTRATOR) {
      throw new ForbiddenException('Only Administrators can do this');
    }
  }

  private profile(u: User | null | undefined): PublicProfile | null {
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl ?? null,
      designation: u.designation ?? null,
      // The school on the person's own profile; blank when not set.
      school: u.school?.name ?? null,
      district: u.district ?? null,
      area: u.area ?? null,
    };
  }

  private async myVotes(userId: string, ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const votes = await this.votesRepo.find({
      where: { user: { id: userId }, targetId: In(ids) },
    });
    return new Map(votes.map((v) => [v.targetId, v.value]));
  }

  private questionView(q: ForumQuestion, myVote: number, replyCount?: number) {
    return {
      id: q.id,
      title: q.title,
      body: q.body,
      status: q.status,
      rejectReason: q.rejectReason,
      upvotes: q.upvotes,
      downvotes: q.downvotes,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      author: this.profile(q.author),
      myVote,
      replyCount,
    };
  }

  // Can this person see this question at all?
  private canSee(user: User, q: ForumQuestion) {
    if (user.role === Role.ADMINISTRATOR) return true;
    if (q.status === ForumQuestionStatus.APPROVED) return true;
    return q.author?.id === user.id; // authors always see their own pending/rejected
  }

  async createQuestion(user: User, title: string, body: string) {
    this.assertIsAo(user);
    if (!title?.trim() || !body?.trim()) {
      throw new BadRequestException('A title and the question text are required');
    }
    const saved = await this.questionsRepo.save(
      this.questionsRepo.create({
        author: user,
        title: title.trim(),
        body: body.trim(),
        status: ForumQuestionStatus.PENDING,
      }),
    );

    const admins = await this.usersRepo.find({
      where: { role: Role.ADMINISTRATOR, status: AccountStatus.APPROVED },
    });
    for (const admin of admins) {
      await this.notifications
        .create(admin, NotificationType.FORUM_REVIEW, `${user.name} asked a forum question that needs approval: "${saved.title}"`, saved.id)
        .catch(() => {});
    }
    this.realtimeGateway.broadcast('forum:changed', {});
    return this.questionView(saved, 0, 0);
  }

  async listQuestions(user: User, sort: ForumSort = 'recent', status?: ForumQuestionStatus) {
    const qb = this.questionsRepo.createQueryBuilder('q')
      .leftJoinAndSelect('q.author', 'author')
      .leftJoinAndSelect('author.school', 'authorSchool')
      .leftJoinAndSelect('author.assignedSchools', 'authorSchools');
    if (user.role === Role.ADMINISTRATOR) {
      if (status) qb.where('q.status = :status', { status });
    } else {
      qb.where('(q.status = :approved OR author.id = :me)', {
        approved: ForumQuestionStatus.APPROVED,
        me: user.id,
      });
    }
    if (sort === 'top') {
      qb.orderBy('(q.upvotes - q.downvotes)', 'DESC').addOrderBy('q.createdAt', 'DESC');
    } else {
      qb.orderBy('q.createdAt', 'DESC');
    }
    const questions = await qb.getMany();

    const ids = questions.map((q) => q.id);
    const counts = ids.length
      ? await this.repliesRepo
          .createQueryBuilder('r')
          .select('r.question_id', 'qid')
          .addSelect('COUNT(*)', 'n')
          .where('r.question_id IN (:...ids)', { ids })
          .groupBy('r.question_id')
          .getRawMany<{ qid: string; n: string }>()
      : [];
    const countMap = new Map(counts.map((c) => [c.qid, parseInt(c.n, 10)]));
    const mine = await this.myVotes(user.id, ids);
    return questions.map((q) => this.questionView(q, mine.get(q.id) ?? 0, countMap.get(q.id) ?? 0));
  }

  async pendingCount(): Promise<number> {
    return this.questionsRepo.count({ where: { status: ForumQuestionStatus.PENDING } });
  }

  async getQuestion(user: User, id: string) {
    const question = await this.questionsRepo.findOne({ where: { id } });
    if (!question || !this.canSee(user, question)) throw new NotFoundException('Question not found');
    const replies = await this.repliesRepo.find({
      where: { question: { id } },
      relations: ['parentReply'],
      order: { createdAt: 'ASC' },
    });
    const mine = await this.myVotes(user.id, [question.id, ...replies.map((r) => r.id)]);
    return {
      question: this.questionView(question, mine.get(question.id) ?? 0, replies.length),
      replies: replies.map((r) => ({
        id: r.id,
        body: r.body,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        createdAt: r.createdAt,
        parentReply: r.parentReply ? { id: r.parentReply.id } : null,
        author: this.profile(r.author),
        myVote: mine.get(r.id) ?? 0,
      })),
    };
  }

  // Replies need no approval, but only on questions that are already approved.
  async createReply(user: User, questionId: string, body: string, parentReplyId?: string) {
    this.assertIsAo(user);
    if (!body?.trim()) throw new BadRequestException('Reply text is required');
    const question = await this.questionsRepo.findOne({ where: { id: questionId } });
    if (!question || question.status !== ForumQuestionStatus.APPROVED) {
      throw new NotFoundException('Question not found');
    }
    let parentReply: ForumReply | null = null;
    if (parentReplyId) {
      parentReply = await this.repliesRepo.findOne({
        where: { id: parentReplyId, question: { id: questionId } },
      });
      if (!parentReply) throw new NotFoundException('Parent reply not found');
    }
    const saved = await this.repliesRepo.save(
      this.repliesRepo.create({ question, author: user, body: body.trim(), parentReply }),
    );
    this.realtimeGateway.broadcast('forum:changed', { questionId });
    return {
      id: saved.id,
      body: saved.body,
      upvotes: 0,
      downvotes: 0,
      createdAt: saved.createdAt,
      parentReply: parentReply ? { id: parentReply.id } : null,
      author: this.profile(user),
      myVote: 0,
    };
  }

  // ---- Administrator moderation ----

  async approve(admin: User, id: string) {
    this.assertIsAdmin(admin);
    const q = await this.questionsRepo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    q.status = ForumQuestionStatus.APPROVED;
    q.reviewedBy = admin;
    q.reviewedAt = new Date();
    q.rejectReason = null;
    await this.questionsRepo.save(q);
    await this.notifications
      .create(q.author, NotificationType.FORUM_REVIEW, `Your forum question was approved: "${q.title}"`, q.id)
      .catch(() => {});
    this.realtimeGateway.broadcast('forum:changed', { questionId: q.id });
    return this.questionView(q, 0);
  }

  async reject(admin: User, id: string, reason?: string) {
    this.assertIsAdmin(admin);
    const q = await this.questionsRepo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    q.status = ForumQuestionStatus.REJECTED;
    q.reviewedBy = admin;
    q.reviewedAt = new Date();
    q.rejectReason = reason?.trim() || null;
    await this.questionsRepo.save(q);
    await this.notifications
      .create(
        q.author,
        NotificationType.FORUM_REVIEW,
        `Your forum question was not approved: "${q.title}"${q.rejectReason ? ` (${q.rejectReason})` : ''}`,
        q.id,
      )
      .catch(() => {});
    this.realtimeGateway.broadcast('forum:changed', { questionId: q.id });
    return this.questionView(q, 0);
  }

  async remove(admin: User, id: string) {
    this.assertIsAdmin(admin);
    const q = await this.questionsRepo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    const replyIds = (await this.repliesRepo.find({ where: { question: { id } } })).map((r) => r.id);
    await this.dataSource.transaction(async (m) => {
      const ids = [id, ...replyIds];
      await m.getRepository(ForumVote).delete({ targetId: In(ids) });
      await m.getRepository(ForumQuestion).delete({ id }); // replies cascade
    });
    this.realtimeGateway.broadcast('forum:changed', { questionId: id });
    return { ok: true };
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
  ): Promise<{ upvotes: number; downvotes: number; myVote: number }> {
    this.assertIsAo(user);
    if (value !== 1 && value !== -1) throw new BadRequestException('Vote must be 1 or -1');

    return this.dataSource.transaction(async (manager) => {
      const targetRepo =
        targetType === ForumVoteTargetType.QUESTION
          ? manager.getRepository(ForumQuestion)
          : manager.getRepository(ForumReply);
      const votesRepo = manager.getRepository(ForumVote);

      const target = await targetRepo.findOne({
        where: { id: targetId },
        relations: targetType === ForumVoteTargetType.REPLY ? ['question'] : [],
      });
      if (!target) throw new NotFoundException('Vote target not found');
      const parentQuestion =
        targetType === ForumVoteTargetType.QUESTION ? (target as ForumQuestion) : (target as ForumReply).question;
      if (parentQuestion.status !== ForumQuestionStatus.APPROVED) {
        throw new NotFoundException('Vote target not found');
      }

      const existing = await votesRepo.findOne({
        where: { user: { id: user.id }, targetType, targetId },
      });

      let myVote: number = value;
      if (!existing) {
        await votesRepo.save(votesRepo.create({ user, targetType, targetId, value }));
        if (value === 1) target.upvotes += 1;
        else target.downvotes += 1;
      } else if (existing.value === value) {
        await votesRepo.remove(existing);
        myVote = 0;
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
      this.realtimeGateway.broadcast('forum:changed', { questionId: parentQuestion.id });
      return { upvotes: target.upvotes, downvotes: target.downvotes, myVote };
    });
  }
}
