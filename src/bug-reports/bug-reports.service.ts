import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { BugReport } from './bug-report.entity';
import { Role, AccountStatus } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

@Injectable()
export class BugReportsService {
  constructor(
    @InjectRepository(BugReport) private repo: Repository<BugReport>,
    @InjectRepository(User) private users: Repository<User>,
    private notifications: NotificationsService,
  ) {}

  private view(b: BugReport) {
    return {
      id: b.id, title: b.title, description: b.description, page: b.page, userAgent: b.userAgent, status: b.status, adminNote: b.adminNote,
      reporter: b.reporter ? { id: b.reporter.id, name: b.reporter.name, role: b.reporter.role, email: b.reporter.depedEmail ?? b.reporter.username ?? null } : null,
      createdAt: b.createdAt, updatedAt: b.updatedAt,
    };
  }

  async create(me: User, dto: { title?: string; description?: string; page?: string; userAgent?: string }) {
    const title = clip(dto.title, 140), description = clip(dto.description, 4000);
    if (title.length < 3) throw new BadRequestException('Give the problem a short title');
    if (description.length < 10) throw new BadRequestException('Describe what happened (at least a sentence)');
    const rec = await this.repo.save(this.repo.create({ reporter: { id: me.id } as User, title, description, page: clip(dto.page, 300) || null, userAgent: clip(dto.userAgent, 300) || null, status: 'open', adminNote: null }));
    try {
      const admins = await this.users.find({ where: { role: Role.ADMINISTRATOR, status: AccountStatus.APPROVED } });
      await this.notifications.createMany(admins.filter((a) => a.id !== me.id), NotificationType.TICKET_UPDATE, `${me.name || 'A user'} reported a bug: "${title}"`, `bug:${rec.id}`, 'Bug report');
    } catch { /* best effort */ }
    return { id: rec.id, ok: true };
  }

  async list() {
    const rows = await this.repo.find({ order: { createdAt: 'DESC' }, take: 500 });
    return rows.map((r) => this.view(r));
  }

  async openCount() { return { count: await this.repo.count({ where: { status: 'open' } }) }; }

  async setStatus(id: string, dto: { status?: string; note?: string }) {
    const b = await this.repo.findOne({ where: { id } });
    if (!b) throw new NotFoundException('Report not found');
    const before = b.status, noteBefore = b.adminNote;
    if (dto.status === 'open' || dto.status === 'resolved') b.status = dto.status;
    if (dto.note !== undefined) b.adminNote = clip(dto.note, 1000) || null;
    await this.repo.save(b);
    if (b.reporter && (b.status !== before || (b.adminNote && b.adminNote !== noteBefore))) {
      const msg = b.status !== before
        ? `Your bug report "${b.title}" was marked ${b.status === 'resolved' ? 'resolved' : 'open again'}.${b.adminNote ? ' Note: ' + b.adminNote : ''}`
        : `The Administrator replied to your bug report "${b.title}": ${b.adminNote}`;
      await this.notifications.create(b.reporter, NotificationType.TICKET_UPDATE, msg, `bug:${b.id}`, 'Bug report').catch(() => {});
    }
    return this.view((await this.repo.findOne({ where: { id } }))!);
  }

  async remove(id: string) { await this.repo.delete({ id }); return { ok: true }; }
}
