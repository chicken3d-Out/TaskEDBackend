import { BadRequestException, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { NotificationsGateway } from './notifications.gateway';

const POKE_TTL_MS = 10 * 60 * 1000;

// "Active users": who is online right now, and a friendly poke.
// Visibility rule (one place to change): Administrators see everyone and
// are visible to everyone; everyone else sees only people who share a
// school with them. Pokes are only allowed on visible, online users.
@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('presence')
export class PresenceController {
  // "fromId>toId" -> time of the poke, used to detect a mutual poke.
  private pokes = new Map<string, number>();

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private gateway: NotificationsGateway,
  ) {}

  private schoolIds(u: User): Set<string> {
    const ids = new Set<string>();
    if (u.school?.id) ids.add(u.school.id);
    for (const s of u.assignedSchools ?? []) ids.add(s.id);
    return ids;
  }

  private canSee(me: User, other: User): boolean {
    if (me.role === Role.ADMINISTRATOR || other.role === Role.ADMINISTRATOR) return true;
    const mine = this.schoolIds(me);
    for (const id of this.schoolIds(other)) if (mine.has(id)) return true;
    return false;
  }

  private async loadOnline(ids: string[]) {
    if (!ids.length) return [];
    return this.users.find({
      where: { id: In(ids) },
      relations: ['school', 'assignedSchools'],
    });
  }

  @Get()
  async list(@CurrentUser() me: User) {
    const meFull = await this.users.findOne({
      where: { id: me.id },
      relations: ['school', 'assignedSchools'],
    });
    if (!meFull) return [];
    const online = await this.loadOnline(this.gateway.onlineUserIds());
    const now = Date.now();
    return online
      .filter((u) => u.id !== me.id && u.status === AccountStatus.APPROVED && this.canSee(meFull, u))
      .map((u) => ({
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        role: u.role,
        school: u.school?.name ?? null,
        pokedYou: (this.pokes.get(`${u.id}>${me.id}`) ?? 0) > now - POKE_TTL_MS,
      }));
  }

  @Post('poke/:userId')
  async poke(@CurrentUser() me: User, @Param('userId') userId: string) {
    if (userId === me.id) throw new BadRequestException('You cannot poke yourself.');
    if (!this.gateway.isOnline(userId)) throw new BadRequestException('That person is no longer online.');
    const [meFull, target] = await Promise.all([
      this.users.findOne({ where: { id: me.id }, relations: ['school', 'assignedSchools'] }),
      this.users.findOne({ where: { id: userId }, relations: ['school', 'assignedSchools'] }),
    ]);
    if (!meFull || !target || !this.canSee(meFull, target)) {
      throw new BadRequestException('That person is not available to poke.');
    }
    const now = Date.now();
    const back = this.pokes.get(`${userId}>${me.id}`) ?? 0;
    const mutual = back > now - POKE_TTL_MS;
    if (mutual) {
      this.pokes.delete(`${userId}>${me.id}`);
    } else {
      this.pokes.set(`${me.id}>${userId}`, now);
    }
    // Forget stale entries.
    for (const [k, t] of this.pokes) if (t < now - POKE_TTL_MS) this.pokes.delete(k);

    this.gateway.pushEvent(userId, 'poke:received', {
      fromId: me.id,
      fromName: me.name,
      mutual,
    });
    return { ok: true, mutual, name: target.name };
  }
}
