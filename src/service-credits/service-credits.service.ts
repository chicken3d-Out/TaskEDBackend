import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { StorageService } from '../storage/storage.service';
import { CreditKind, CreditLogType, LeaveCredit, LeaveCreditBatch, LeaveCreditLog, LeaveCreditRequest } from './service-credit.entities';

export const KIND_LABEL: Record<CreditKind, string> = {
  service_credit: 'Service Credit',
  wellness: 'Wellness Leave',
  vl: 'Vacation Leave',
  sl: 'Sick Leave',
  spl: 'Special Privilege Leave (SPL)',
  fl: 'Force Leave (FL)',
  cto: 'Compensatory Time Off (CTO)',
};

const TEACHER_KINDS: CreditKind[] = ['service_credit', 'wellness'];
const STAFF_KINDS: CreditKind[] = ['vl', 'sl', 'wellness', 'spl', 'fl', 'cto'];
// renewed every January
const YEARLY: Partial<Record<CreditKind, number>> = { wellness: 5, fl: 5, spl: 3 };
// earned a little every month, so that a full year adds exactly this many
const EARNS_PER_YEAR: Partial<Record<CreditKind, number>> = { vl: 10, sl: 15 };
const MAX = 9999;

// Teachers keep Service Credit and Wellness Leave. Non-teaching staff (non-teaching, DS Secretary, School Head, AO, Publisher)
// keep Vacation Leave, Sick Leave, Wellness Leave, SPL, FL and CTO.
export function kindsFor(role: Role | null | undefined): CreditKind[] | null {
  if (role === Role.TEACHER) return TEACHER_KINDS;
  if (role === Role.NON_TEACHING || role === Role.DS_SECRETARY || role === Role.SCHOOL_HEAD || role === Role.ADMIN_OFFICER || role === Role.PUBLISHER) return STAFF_KINDS;
  if (role === Role.DISTRICT_SUPERVISOR) return []; // applies for leave, but keeps no credits here
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const todayIso = () => new Date().toISOString().slice(0, 10);
// a credit the person can already use before the AO confirms the count (it has a yearly default)
export const isAuto = (k: CreditKind) => YEARLY[k] !== undefined;

@Injectable()
export class ServiceCreditsService {
  constructor(
    @InjectRepository(LeaveCredit) private credits: Repository<LeaveCredit>,
    @InjectRepository(LeaveCreditLog) private logs: Repository<LeaveCreditLog>,
    @InjectRepository(LeaveCreditRequest) private requests: Repository<LeaveCreditRequest>,
    @InjectRepository(LeaveCreditBatch) private batches: Repository<LeaveCreditBatch>,
    @InjectRepository(User) private users: Repository<User>,
    private notifications: NotificationsService,
    private storage: StorageService,
  ) {}

  // ---------- who may do what ----------
  private isAo(u: User) { return u.role === Role.ADMIN_OFFICER || u.role === Role.PUBLISHER; }

  private managedSchoolIds(u: User): string[] {
    if (!this.isAo(u)) return [];
    const ids = new Set<string>((u.assignedSchools ?? []).map((s) => s.id));
    if (u.school) ids.add(u.school.id);
    return [...ids];
  }

  // The AO (or Publisher AO) of a person's school manages their credits, and their own.
  private canManage(actor: User, target: User): boolean {
    if (actor.role === Role.ADMINISTRATOR) return true;
    if (!this.isAo(actor) || !target.school) return false;
    return this.managedSchoolIds(actor).includes(target.school.id);
  }

  private async loadTarget(id: string): Promise<User> {
    const t = await this.users.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Person not found');
    if (!kindsFor(t.role)) throw new BadRequestException('Service credits are not kept for this account type');
    return t;
  }

  private async viewable(actor: User, id: string): Promise<{ target: User; manage: boolean }> {
    const target = await this.loadTarget(id);
    const manage = this.canManage(actor, target);
    if (target.id !== actor.id && !manage) throw new ForbiddenException('These credits are not yours to see');
    return { target, manage };
  }

  // ---------- credits ----------
  // Makes sure every credit row exists, the yearly credits belong to this year, Vacation/Sick Leave has its
  // monthly earnings, and CTO that passed its year is taken off.
  private async ensure(target: User): Promise<LeaveCredit[]> {
    const kinds = kindsFor(target.role)!;
    const now = new Date();
    const year = now.getFullYear();
    const rows = await this.credits.find({ where: { user: { id: target.id } } });
    const out: LeaveCredit[] = [];
    for (const kind of kinds) {
      let row = rows.find((r) => r.kind === kind);
      const yearly = YEARLY[kind];
      if (!row) {
        row = await this.credits.save(this.credits.create({ user: { id: target.id } as User, kind, balance: yearly ?? 0, initialSet: false, year: yearly !== undefined ? year : null, accrualMonth: null }));
        if (yearly !== undefined) await this.log(target, kind, 'reset', yearly, yearly, `${KIND_LABEL[kind]} for ${year}`, null);
      } else if (yearly !== undefined && row.year == null && row.initialSet) {
        row.year = year; row = await this.credits.save(row); // the AO already confirmed this year's count
      } else if (yearly !== undefined && row.year !== year) {
        const before = row.balance;
        row.balance = yearly; row.year = year;
        row = await this.credits.save(row);
        await this.log(target, kind, 'reset', yearly - before, yearly, `${KIND_LABEL[kind]} renewed to ${yearly} for ${year}`, null);
      }
      // monthly earning of Vacation / Sick Leave
      const per = EARNS_PER_YEAR[kind];
      if (per !== undefined && row.initialSet) {
        if (!row.accrualMonth) { row.accrualMonth = ym(now); row = await this.credits.save(row); }
        let guard = 0;
        while (row.accrualMonth! < ym(now) && guard++ < 36) {
          let [y, m] = row.accrualMonth!.split('-').map(Number);
          m += 1; if (m > 12) { m = 1; y += 1; }
          const add = round2(round2((per * m) / 12) - round2((per * (m - 1)) / 12));
          row.balance = round2(row.balance + add); row.accrualMonth = `${y}-${String(m).padStart(2, '0')}`;
          row = await this.credits.save(row);
          await this.log(target, kind, 'accrual', add, row.balance, `Earned for ${MONTHS[m - 1]} ${y}`, null);
        }
      }
      // CTO that is a year old
      if (kind === 'cto') {
        const old = await this.batches.find({ where: { user: { id: target.id }, kind: 'cto' } });
        for (const b of old.filter((x) => x.remaining > 0 && x.expiresAt && x.expiresAt <= todayIso())) {
          row.balance = round2(Math.max(0, row.balance - b.remaining));
          row = await this.credits.save(row);
          await this.log(target, kind, 'expiry', -b.remaining, row.balance, `CTO expired${b.soNumber ? ` (S.O. ${b.soNumber})` : ''}`, null, { expiresAt: b.expiresAt });
          b.remaining = 0; await this.batches.save(b);
        }
      }
      out.push(row);
    }
    return out;
  }

  // CTO bookkeeping: add hours (optionally with an expiry), or take hours off the ones that expire first.
  private async addBatch(target: User, amount: number, expiresAt: string | null, soNumber: string | null) {
    await this.batches.save(this.batches.create({ user: { id: target.id } as User, kind: 'cto', amount, remaining: amount, expiresAt, soNumber }));
  }
  private async takeBatches(target: User, amount: number) {
    const rows = (await this.batches.find({ where: { user: { id: target.id }, kind: 'cto' } })).filter((b) => b.remaining > 0)
      .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
    let left = amount; const used: { id: string; amount: number }[] = [];
    for (const b of rows) {
      if (left <= 0) break;
      const t = Math.min(b.remaining, left);
      b.remaining = round2(b.remaining - t); left = round2(left - t); used.push({ id: b.id, amount: t });
      await this.batches.save(b);
    }
    return used;
  }

  private async log(target: User, kind: CreditKind, type: CreditLogType, delta: number, after: number, reason: string | null, actor: User | null, extra: Partial<LeaveCreditLog> = {}) {
    await this.logs.save(this.logs.create({ user: { id: target.id } as User, kind, type, delta: round2(delta), balanceAfter: round2(after), reason, actor: actor ? ({ id: actor.id } as User) : null, ...extra }));
  }

  async overview(actor: User, id: string) {
    const { target, manage } = await this.viewable(actor, id);
    const rows = await this.ensure(target);
    const pending = await this.requests.find({ where: { user: { id: target.id }, status: 'pending' } });
    const logs = await this.logs.find({ where: { user: { id: target.id } }, order: { createdAt: 'DESC' }, take: 150 });
    const cto = (await this.batches.find({ where: { user: { id: target.id }, kind: 'cto' } })).filter((b) => b.remaining > 0 && b.expiresAt).sort((a, b) => a.expiresAt!.localeCompare(b.expiresAt!));
    return {
      user: { id: target.id, name: target.name, role: target.role, school: target.school?.name ?? '' },
      type: target.role === Role.TEACHER ? 'teacher' : 'staff',
      direct: target.role === Role.TEACHER, // the AO changes a teacher's credits without the Administrator
      canManage: manage,
      isAdmin: actor.role === Role.ADMINISTRATOR,
      credits: rows.map((r) => ({
        kind: r.kind, label: KIND_LABEL[r.kind], balance: r.balance, initialSet: r.initialSet, usable: r.initialSet || isAuto(r.kind),
        note: r.kind === 'fl' ? 'Renewed to 5 every January' : r.kind === 'spl' ? 'Renewed to 3 every January' : r.kind === 'wellness' ? 'Back to 5 every January' : r.kind === 'vl' ? 'Earns 10 a year, added monthly' : r.kind === 'sl' ? 'Earns 15 a year, added monthly' : null,
        expires: r.kind === 'cto' ? cto.map((b) => ({ amount: b.remaining, on: b.expiresAt })) : [],
        pending: pending.find((p) => p.kind === r.kind) ? { id: pending.find((p) => p.kind === r.kind)!.id, newBalance: pending.find((p) => p.kind === r.kind)!.newBalance, reason: pending.find((p) => p.kind === r.kind)!.reason } : null,
      })),
      logs: logs.map((l) => ({
        id: l.id, kind: l.kind, label: KIND_LABEL[l.kind] ?? l.kind, type: l.type, delta: l.delta, balanceAfter: l.balanceAfter, reason: l.reason, expiresAt: l.expiresAt,
        soNumber: l.soNumber, fileName: l.fileName, fileUrl: l.fileUrl, actor: l.actor?.name ?? null, createdAt: l.createdAt,
      })),
    };
  }

  // The AO's people: teachers, non-teaching staff and the School Head of the school(s) they manage, and themselves.
  async staff(actor: User) {
    if (actor.role !== Role.ADMINISTRATOR && !this.isAo(actor)) throw new ForbiddenException('Only the school’s Administrative Officer manages credits');
    const ids = this.managedSchoolIds(actor);
    if (!ids.length) return [];
    const people = await this.users.find({ where: { school: { id: In(ids) }, status: AccountStatus.APPROVED, role: In([Role.TEACHER, Role.NON_TEACHING, Role.DS_SECRETARY, Role.SCHOOL_HEAD, Role.ADMIN_OFFICER, Role.PUBLISHER]) } });
    if (!people.find((p) => p.id === actor.id)) people.push(actor);
    const out: any[] = [];
    for (const p of people.sort((a, b) => a.name.localeCompare(b.name))) {
      const rows = await this.ensure(p);
      out.push({ id: p.id, name: p.name, role: p.role, school: p.school?.name ?? '', self: p.id === actor.id, credits: rows.map((r) => ({ kind: r.kind, label: KIND_LABEL[r.kind], balance: r.balance, initialSet: r.initialSet })) });
    }
    return out;
  }

  private num(v: unknown, what: string, allowZero = true): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > MAX) throw new BadRequestException(`${what} must be a number from 0 to ${MAX}`);
    if (!allowZero && n === 0) throw new BadRequestException(`${what} must be more than 0`);
    return round2(n);
  }

  private kindOf(target: User, kind: string): CreditKind {
    if (!(kindsFor(target.role) ?? []).includes(kind as CreditKind)) throw new BadRequestException('That credit is not kept for this person');
    return kind as CreditKind;
  }

  private async rowFor(target: User, kind: CreditKind) {
    await this.ensure(target);
    return (await this.credits.findOne({ where: { user: { id: target.id }, kind } }))!;
  }

  // First count for a person: the AO sets it once.
  async setInitial(actor: User, id: string, dto: { kind?: string; balance?: number }) {
    const { target, manage } = await this.viewable(actor, id);
    if (!manage) throw new ForbiddenException('Only the school’s Administrative Officer can set credits');
    const kind = this.kindOf(target, String(dto.kind));
    const balance = this.num(dto.balance, 'The count');
    const row = await this.rowFor(target, kind);
    if (row.initialSet) throw new BadRequestException('The first count is already set. Use “Request change” and give a reason.');
    const before = row.balance;
    row.balance = balance; row.initialSet = true;
    if (EARNS_PER_YEAR[kind] !== undefined) row.accrualMonth = ym(new Date()); // the count already includes this month
    await this.credits.save(row);
    if (kind === 'cto') await this.addBatch(target, balance, null, null);
    await this.log(target, kind, 'initial', balance - before, balance, 'Initial count', actor);
    return this.overview(actor, id);
  }

  // A change after the first count needs the Administrator's approval, with a reason.
  async requestEdit(actor: User, id: string, dto: { kind?: string; balance?: number; reason?: string }) {
    const { target, manage } = await this.viewable(actor, id);
    if (!manage) throw new ForbiddenException('Only the school’s Administrative Officer can request a change');
    const kind = this.kindOf(target, String(dto.kind));
    const balance = this.num(dto.balance, 'The new count');
    const reason = String(dto.reason ?? '').trim() || (target.role === Role.TEACHER ? 'Updated by the Administrative Officer' : '');
    if (reason.length < 5) throw new BadRequestException('Give a reason for the change');
    const row = await this.rowFor(target, kind);
    if (round2(row.balance) === balance && row.initialSet) throw new BadRequestException('That is already the count');

    // The Administrator, and the AO for a teacher, change the count straight away; it is logged either way.
    if (actor.role === Role.ADMINISTRATOR || target.role === Role.TEACHER) {
      const before = row.balance, first = !row.initialSet;
      row.balance = balance; row.initialSet = true; await this.credits.save(row);
      await this.log(target, kind, first ? 'initial' : 'edit', balance - before, balance, reason, actor);
      return this.overview(actor, id);
    }
    if (!row.initialSet) throw new BadRequestException('Set the first count instead');
    if (await this.requests.findOne({ where: { user: { id: target.id }, kind, status: 'pending' } })) throw new BadRequestException('A change for this credit is already waiting for the Administrator');
    await this.requests.save(this.requests.create({ user: { id: target.id } as User, kind, oldBalance: row.balance, newBalance: balance, reason, requestedBy: { id: actor.id } as User, status: 'pending' }));
    const admins = await this.users.find({ where: { role: Role.ADMINISTRATOR } });
    for (const a of admins) await this.notifications.create(a, NotificationType.SERVICE_CREDIT, `${actor.name} asks to change ${target.name}'s ${KIND_LABEL[kind]} from ${row.balance} to ${balance}.`).catch(() => undefined);
    return this.overview(actor, id);
  }

  uploadSignature(actor: User) {
    if (actor.role !== Role.ADMINISTRATOR && !this.isAo(actor)) throw new ForbiddenException('Not allowed');
    return this.storage.signCredit(actor.id);
  }

  // Credits earned through a Special Order: the S.O. number and the S.O. file are required.
  async addSpecialOrder(actor: User, id: string, dto: { kind?: string; amount?: number; soNumber?: string; fileName?: string; url?: string; publicId?: string; approvedOn?: string }) {
    const { target, manage } = await this.viewable(actor, id);
    if (!manage) throw new ForbiddenException('Only the school’s Administrative Officer can add credits');
    const kind = this.kindOf(target, String(dto.kind));
    if (isAuto(kind) || EARNS_PER_YEAR[kind] !== undefined) throw new BadRequestException(`${KIND_LABEL[kind]} is renewed or earned automatically and is not added by Special Order`);
    const amount = this.num(dto.amount, 'The credits to add', false);
    const so = String(dto.soNumber ?? '').trim().slice(0, 100);
    const url = String(dto.url ?? '').trim();
    if (!so) throw new BadRequestException('Enter the Special Order number');
    if (!url) throw new BadRequestException('Upload the Special Order');
    if (!this.storage.ownsUrl(url)) throw new BadRequestException('That file was not uploaded through TaskEd');
    const row = await this.rowFor(target, kind);
    if (!row.initialSet) throw new BadRequestException('Set the first count before adding Special Order credits');
    // CTO from a Special Order is good for one year from the day it was approved
    let expiresAt: string | null = null;
    if (kind === 'cto') {
      const on = new Date(`${String(dto.approvedOn ?? todayIso()).slice(0, 10)}T00:00:00Z`);
      if (isNaN(on.getTime())) throw new BadRequestException('Enter the date the CTO was approved');
      on.setUTCFullYear(on.getUTCFullYear() + 1);
      expiresAt = on.toISOString().slice(0, 10);
      if (expiresAt <= todayIso()) throw new BadRequestException('That CTO is already a year old');
      await this.addBatch(target, amount, expiresAt, so);
    }
    row.balance = round2(row.balance + amount);
    await this.credits.save(row);
    await this.log(target, kind, 'special_order', amount, row.balance, `Special Order ${so}${expiresAt ? ` · good until ${expiresAt}` : ''}`, actor, { expiresAt, soNumber: so, fileUrl: url.slice(0, 600), filePublicId: String(dto.publicId ?? '').slice(0, 300) || null, fileName: String(dto.fileName ?? 'Special Order').slice(0, 200) });
    if (target.id !== actor.id) await this.notifications.create(target, NotificationType.SERVICE_CREDIT, `${amount} ${KIND_LABEL[kind]} was added to your credits (S.O. ${so}).`).catch(() => undefined);
    return this.overview(actor, id);
  }

  // ---------- Administrator ----------
  async pendingRequests(admin: User) {
    if (admin.role !== Role.ADMINISTRATOR) throw new ForbiddenException('Administrators only');
    const rows = await this.requests.find({ order: { createdAt: 'DESC' }, take: 100 });
    const view = (r: LeaveCreditRequest) => ({
      id: r.id, status: r.status, kind: r.kind, label: KIND_LABEL[r.kind], oldBalance: r.oldBalance, newBalance: r.newBalance, reason: r.reason,
      person: r.user.name, school: r.user.school?.name ?? '', requestedBy: r.requestedBy?.name ?? '', decidedNote: r.decidedNote, createdAt: r.createdAt, decidedAt: r.decidedAt,
    });
    return { pending: rows.filter((r) => r.status === 'pending').map(view), recent: rows.filter((r) => r.status !== 'pending').slice(0, 15).map(view) };
  }

  async decide(admin: User, id: string, dto: { approve?: boolean; note?: string }) {
    if (admin.role !== Role.ADMINISTRATOR) throw new ForbiddenException('Administrators only');
    const r = await this.requests.findOne({ where: { id } });
    if (!r || r.status !== 'pending') throw new NotFoundException('That request is no longer waiting');
    const note = String(dto.note ?? '').trim().slice(0, 500) || null;
    r.status = dto.approve ? 'approved' : 'rejected'; r.decidedBy = admin; r.decidedAt = new Date(); r.decidedNote = note;
    if (dto.approve) {
      const row = await this.rowFor(r.user, r.kind);
      const before = row.balance;
      row.balance = r.newBalance; await this.credits.save(row);
      if (r.kind === 'cto') { if (r.newBalance > before) await this.addBatch(r.user, round2(r.newBalance - before), null, null); else await this.takeBatches(r.user, round2(before - r.newBalance)); }
      await this.log(r.user, r.kind, 'edit', r.newBalance - before, r.newBalance, `${r.reason} (approved by ${admin.name})`, r.requestedBy);
    }
    await this.requests.save(r);
    const msg = `The change to ${r.user.name}'s ${KIND_LABEL[r.kind]} (to ${r.newBalance}) was ${dto.approve ? 'approved' : 'declined'}${note ? `: ${note}` : '.'}`;
    if (r.requestedBy) await this.notifications.create(r.requestedBy, NotificationType.SERVICE_CREDIT, msg).catch(() => undefined);
    return this.pendingRequests(admin);
  }

  // ---------- used by leave applications (release 2) ----------
  async balanceOf(target: User, kind: CreditKind) {
    const rows = await this.ensure(target);
    const r = rows.find((x) => x.kind === kind);
    return r ? { balance: r.balance, initialSet: r.initialSet, usable: r.initialSet || isAuto(r.kind) } : null;
  }

  async spend(target: User, kind: CreditKind, days: number, reason: string, actor: User | null, leaveId: string | null) {
    const row = await this.rowFor(target, kind);
    row.balance = round2(row.balance - days);
    await this.credits.save(row);
    const used = kind === 'cto' ? await this.takeBatches(target, days) : null;
    await this.log(target, kind, 'deduction', -days, row.balance, reason, actor, { leaveId, meta: used });
  }
  async refund(target: User, kind: CreditKind, days: number, reason: string, actor: User | null, leaveId: string | null) {
    const row = await this.rowFor(target, kind);
    row.balance = round2(row.balance + days);
    await this.credits.save(row);
    if (kind === 'cto') {
      const last = await this.logs.findOne({ where: { user: { id: target.id }, kind, type: 'deduction', leaveId: leaveId as string }, order: { createdAt: 'DESC' } });
      const used = (last?.meta as { id: string; amount: number }[] | null) ?? [];
      if (used.length) for (const u of used) { const b = await this.batches.findOne({ where: { id: u.id } }); if (b) { b.remaining = round2(b.remaining + u.amount); await this.batches.save(b); } }
      else await this.addBatch(target, days, null, null);
    }
    await this.log(target, kind, 'restore', days, row.balance, reason, actor, { leaveId });
  }
}
