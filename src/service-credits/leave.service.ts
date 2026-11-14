import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { TravelSignatory } from '../travel-authority/travel-signatory.entity';
import { CreditKind } from './service-credit.entities';
import { KIND_LABEL, ServiceCreditsService, kindsFor } from './service-credits.service';
import { LeaveApplication, LeaveData, LeaveSig, LeaveStatus } from './leave-application.entity';

export const LEAVE_TYPES = [
  'Vacation Leave', 'Mandatory/Forced Leave', 'Sick Leave', 'Maternity Leave', 'Paternity Leave', 'Special Privilege Leave', 'Solo Parent Leave', 'Study Leave',
  '10-Day VAWC Leave', 'Rehabilitation Privilege', 'Special Leave Benefits for Women', 'Special Emergency (Calamity) Leave', 'Adoption Leave', 'Others',
];
const MAX_SIG = 300_000;
const LEAVE_ROLES = [Role.TEACHER, Role.NON_TEACHING, Role.DS_SECRETARY, Role.SCHOOL_HEAD, Role.ADMIN_OFFICER, Role.PUBLISHER, Role.DISTRICT_SUPERVISOR];
const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

@Injectable()
export class LeaveService {
  constructor(
    @InjectRepository(LeaveApplication) private apps: Repository<LeaveApplication>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(TravelSignatory) private sigs: Repository<TravelSignatory>,
    private credits: ServiceCreditsService,
    private notifications: NotificationsService,
  ) {}

  // ---------- who is who ----------
  private isAo(u: User) { return u.role === Role.ADMIN_OFFICER || u.role === Role.PUBLISHER; }
  private schoolId(u: User) { return u.school?.id ?? u.assignedSchools?.[0]?.id ?? null; }
  private managedIds(u: User) { return new Set<string>([...(u.assignedSchools ?? []).map((s) => s.id), ...(u.school ? [u.school.id] : [])]); }
  // the AO of the applicant's school (not for an AO's own leave)
  private aoOf(me: User, a: User) {
    if (!this.isAo(me) || me.id === a.id || a.role === Role.ADMIN_OFFICER || a.role === Role.PUBLISHER || a.role === Role.DISTRICT_SUPERVISOR) return false;
    const sid = this.schoolId(a);
    return !!sid && this.managedIds(me).has(sid);
  }
  private needsAo(a: User) { return a.role === Role.TEACHER || a.role === Role.NON_TEACHING || a.role === Role.DS_SECRETARY || a.role === Role.SCHOOL_HEAD; }

  private async named(key: string) {
    const s = await this.sigs.findOne({ where: { key } });
    return { user: s?.user ?? null, name: (s?.name?.trim() || s?.user?.name || '').toUpperCase(), signature: s?.signature ?? null };
  }

  // 7.B: the corresponding signatory
  private async signatory(a: User) {
    if (a.role === Role.DISTRICT_SUPERVISOR) return { ids: new Set<string>(), name: (await this.named('cid_chief')).name, title: 'CID Chief', note: 'The CID Chief is not an account; sign and send it by email.', ds: false };
    if (a.role === Role.SCHOOL_HEAD) {
      const ds = await this.named('district_supervisor');
      const sec = await this.users.find({ where: { role: Role.DS_SECRETARY, status: AccountStatus.APPROVED } });
      return { ids: new Set<string>([...(ds.user ? [ds.user.id] : []), ...sec.map((x) => x.id)]), name: ds.name, title: 'District Supervisor', note: ds.user ? undefined : 'The Administrator has not linked the District Supervisor’s account yet.', ds: true };
    }
    const sid = this.schoolId(a);
    const head = sid ? await this.users.findOne({ where: { role: Role.SCHOOL_HEAD, status: AccountStatus.APPROVED, school: { id: sid } } }) : null;
    return { ids: new Set<string>(head ? [head.id] : []), name: (head?.name ?? '').toUpperCase(), title: 'School Head', note: head ? undefined : 'This school has no School Head account yet.', ds: false };
  }

  private async mySignature(me: User, forDs: boolean) {
    const u = await this.users.findOne({ where: { id: me.id }, select: ['id', 'signature'] });
    let img = u?.signature ?? null;
    if (forDs) { const ds = await this.named('district_supervisor'); img = me.role === Role.DS_SECRETARY ? ds.signature : img ?? ds.signature; }
    return img;
  }

  // ---------- view ----------
  private async view(me: User, a: LeaveApplication) {
    const sg = await this.signatory(a.applicant);
    let myTurn: 'applicant' | 'ao' | 'send' | 'signatory' | null = null;
    if (a.status === 'awaiting_applicant' && a.applicant.id === me.id) myTurn = 'applicant';
    else if (a.status === 'awaiting_ao' && this.aoOf(me, a.applicant)) myTurn = 'ao';
    else if (a.status === 'ao_approved' && this.aoOf(me, a.applicant)) myTurn = 'send';
    else if (a.status === 'awaiting_signatory' && sg.ids.has(me.id)) myTurn = 'signatory';
    let signAs: string | null = null;
    if (myTurn === 'applicant' || myTurn === 'ao' || myTurn === 'signatory') signAs = await this.mySignature(me, myTurn === 'signatory' && sg.ds);
    const hrmo = await this.named('hrmo'), asds = await this.named('asds');
    const kinds = kindsFor(a.applicant.role) ?? [];
    return {
      id: a.id, status: a.status, data: a.data, kind: a.kind, kindLabel: a.kind ? KIND_LABEL[a.kind] : null, days: a.days, credit: a.credit, deducted: a.deducted, recommendation: a.recommendation, note: a.note,
      applicant: { id: a.applicant.id, name: a.applicant.name, role: a.applicant.role, school: a.applicant.school?.name ?? '' },
      filedBy: a.filedBy ? { id: a.filedBy.id, name: a.filedBy.name } : null,
      sigs: a.sigs, myTurn, signAs, kinds: kinds.map((k) => ({ kind: k, label: KIND_LABEL[k] })),
      printed: { hrmo: hrmo.name, asds: asds.name, signatory: sg.name, signatoryTitle: sg.title, signatoryNote: sg.note ?? null },
      createdAt: a.createdAt, updatedAt: a.updatedAt,
    };
  }

  private async load(id: string) {
    const a = await this.apps.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Application not found');
    return a;
  }

  private async canSee(me: User, a: LeaveApplication) {
    if (a.applicant.id === me.id || a.filedBy?.id === me.id || this.aoOf(me, a.applicant)) return true;
    if (['awaiting_signatory', 'approved', 'disapproved'].includes(a.status)) return (await this.signatory(a.applicant)).ids.has(me.id);
    return false;
  }

  async get(me: User, id: string) {
    const a = await this.load(id);
    if (!(await this.canSee(me, a))) throw new ForbiddenException('Not yours to see');
    return this.view(me, a);
  }

  async list(me: User) {
    const rows = await this.apps.find({ order: { createdAt: 'DESC' }, take: 400 });
    const out: any[] = [];
    for (const a of rows) if (await this.canSee(me, a)) out.push(await this.view(me, a));
    return out.slice(0, 150);
  }

  // ---------- create / edit ----------
  private clean(a: User, raw: Partial<LeaveData>, kind: unknown) {
    const d = raw ?? {};
    const days = Number(d.days);
    if (!(days > 0 && days <= 365)) throw new BadRequestException('Enter the number of working days');
    const leaveType = str(d.leaveType, 60);
    if (!LEAVE_TYPES.includes(leaveType)) throw new BadRequestException('Choose the type of leave');
    if (leaveType === 'Others' && !str(d.otherLeave, 80)) throw new BadRequestException('Say what the other leave is');
    if (!str(d.dates, 120)) throw new BadRequestException('Enter the inclusive dates');
    const data: LeaveData = {
      office: str(d.office, 150), lastName: str(d.lastName, 60), firstName: str(d.firstName, 60), middleName: str(d.middleName, 60), filingDate: str(d.filingDate, 20), position: str(d.position, 100), salary: str(d.salary, 30),
      leaveType, otherLeave: str(d.otherLeave, 80),
      where: d.where === 'ph' || d.where === 'abroad' ? d.where : '', whereText: str(d.whereText, 120), illness: d.illness === 'hospital' || d.illness === 'outpatient' ? d.illness : '', illnessText: str(d.illnessText, 120), womenText: str(d.womenText, 120),
      study: d.study === 'masters' || d.study === 'bar' ? d.study : '', monetization: d.monetization === 'monetization' || d.monetization === 'terminal' ? d.monetization : '',
      days: round2(days), dates: str(d.dates, 120), commutation: d.commutation === 'requested' ? 'requested' : 'not',
    };
    if (!data.lastName || !data.firstName) throw new BadRequestException('Enter the applicant’s name');
    let k: CreditKind | null = null;
    if (kind) {
      if (!(kindsFor(a.role) ?? []).includes(kind as CreditKind)) throw new BadRequestException('That credit does not apply to this person');
      k = kind as CreditKind;
    }
    return { data, kind: k };
  }

  async create(me: User, dto: { applicantId?: string; data: Partial<LeaveData>; kind?: string | null }) {
    const a = dto.applicantId && dto.applicantId !== me.id ? await this.users.findOne({ where: { id: dto.applicantId } }) : me;
    if (!a) throw new NotFoundException('Person not found');
    if (!a.role || !LEAVE_ROLES.includes(a.role)) throw new ForbiddenException('Leave applications are not available for this account type');
    if (a.id !== me.id && !this.aoOf(me, a)) throw new ForbiddenException('Only the school’s Administrative Officer can file for someone else');
    const { data, kind } = this.clean(a, dto.data, dto.kind);
    const rec = await this.apps.save(this.apps.create({ applicant: { id: a.id } as User, filedBy: { id: me.id } as User, status: 'awaiting_applicant', data, kind, days: data.days, sigs: {} }));
    if (a.id !== me.id) await this.ping(a, `${me.name} prepared a leave application (Form 6) for you to sign.`);
    return this.view(me, await this.load(rec.id));
  }

  async update(me: User, id: string, dto: { data: Partial<LeaveData>; kind?: string | null }) {
    const a = await this.load(id);
    if (a.status !== 'awaiting_applicant' || (a.applicant.id !== me.id && a.filedBy?.id !== me.id)) throw new ForbiddenException('This application can no longer be edited');
    const { data, kind } = this.clean(a.applicant, dto.data, dto.kind);
    Object.assign(a, { data, kind, days: data.days });
    await this.apps.save(a);
    return this.view(me, await this.load(id));
  }

  async remove(me: User, id: string) {
    const a = await this.load(id);
    if (a.status !== 'awaiting_applicant' || (a.applicant.id !== me.id && a.filedBy?.id !== me.id)) throw new ForbiddenException('Only an application that is not signed yet can be deleted');
    await this.apps.delete({ id });
    return { ok: true };
  }

  // ---------- signing ----------
  private sigFrom(img: string | null, x: number, y: number): LeaveSig {
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new BadRequestException('Tap on the form where the signature goes');
    if (!img) throw new BadRequestException('Add your signature in My profile first');
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img) || img.length > MAX_SIG) throw new BadRequestException('Your signature image is not valid');
    return { img, x, y, at: new Date().toISOString() };
  }

  private async ping(u: User, msg: string) { await this.notifications.create(u, NotificationType.SERVICE_CREDIT, msg).catch(() => undefined); }

  private async deduct(a: LeaveApplication, actor: User) {
    if (!a.kind) return;
    const cur = await this.credits.balanceOf(a.applicant, a.kind);
    if (!cur || !cur.initialSet) throw new BadRequestException(`${KIND_LABEL[a.kind]} has no starting count yet. Set it in Service Credits first.`);
    if (cur.balance < a.days) throw new BadRequestException(`${a.applicant.name} has only ${cur.balance} day(s) of ${KIND_LABEL[a.kind]}, but ${a.days} are applied for.`);
    await this.credits.spend(a.applicant, a.kind, a.days, `${a.data.leaveType}, ${a.data.dates}`, actor, a.id);
    a.deducted = true;
    a.credit = { asOf: new Date().toISOString().slice(0, 10), label: KIND_LABEL[a.kind], earned: cur.balance, less: a.days, balance: round2(cur.balance - a.days) };
  }

  async sign(me: User, id: string, dto: { x: number; y: number; kind?: string | null; decision?: string; reason?: string }) {
    const a = await this.load(id);
    const v = await this.view(me, a);
    if (!v.myTurn || v.myTurn === 'send') throw new ForbiddenException('It is not your turn to sign this');
    const sig = this.sigFrom(v.signAs, Number(dto.x), Number(dto.y));

    if (v.myTurn === 'applicant') {
      a.sigs = { ...a.sigs, applicant: sig };
      if (a.applicant.role === Role.DISTRICT_SUPERVISOR) a.status = 'approved';
      else if (this.needsAo(a.applicant)) a.status = 'awaiting_ao';
      else a.status = 'awaiting_signatory';
      await this.apps.save(a);
      if (a.status === 'awaiting_ao') for (const ao of await this.aosFor(a.applicant)) await this.ping(ao, `${a.applicant.name} signed a leave application (Form 6) for your approval.`);
      if (a.status === 'awaiting_signatory') await this.pingSignatories(a);
      return this.view(me, await this.load(id));
    }

    if (v.myTurn === 'ao') {
      if (dto.kind !== undefined) a.kind = dto.kind ? (this.clean(a.applicant, { ...a.data }, dto.kind).kind) : null;
      await this.deduct(a, me);
      a.sigs = { ...a.sigs, ao: sig }; a.status = 'ao_approved';
      await this.apps.save(a);
      await this.ping(a.applicant, `Your leave application (Form 6) was approved by ${me.name}${a.deducted ? ` and ${a.days} day(s) were deducted` : ''}.`);
      return this.view(me, await this.load(id));
    }

    // the corresponding signatory (7.B)
    const decision = dto.decision === 'disapproval' ? 'disapproval' : 'approval';
    const reason = str(dto.reason, 300);
    if (decision === 'disapproval' && !reason) throw new BadRequestException('Give the reason for disapproval');
    if (decision === 'approval' && !a.deducted) await this.deduct(a, me); // an AO's own leave is deducted when the School Head approves
    if (decision === 'disapproval' && a.deducted && a.kind) {
      await this.credits.refund(a.applicant, a.kind, a.days, `Leave disapproved: ${reason}`, me, a.id);
      a.deducted = false;
    }
    a.sigs = { ...a.sigs, signatory: sig }; a.recommendation = { decision, reason: decision === 'disapproval' ? reason : '' };
    a.status = decision === 'approval' ? 'approved' : 'disapproved'; a.note = decision === 'disapproval' ? reason : null;
    await this.apps.save(a);
    await this.ping(a.applicant, `Your leave application (Form 6) was ${decision === 'approval' ? 'recommended for approval' : 'disapproved'} by ${me.name}.`);
    return this.view(me, await this.load(id));
  }

  // the AO turns a leave down before it is deducted
  async disapprove(me: User, id: string, reason: string) {
    const a = await this.load(id);
    if (a.status !== 'awaiting_ao' || !this.aoOf(me, a.applicant)) throw new ForbiddenException('It is not yours to decide');
    const r = str(reason, 300);
    if (!r) throw new BadRequestException('Give the reason');
    a.status = 'disapproved'; a.note = r; a.recommendation = { decision: 'disapproval', reason: r };
    await this.apps.save(a);
    await this.ping(a.applicant, `Your leave application (Form 6) was disapproved by ${me.name}: ${r}`);
    return this.view(me, await this.load(id));
  }

  // after the AO's approval: send it on to the School Head (or the District Supervisor for a School Head)
  async send(me: User, id: string) {
    const a = await this.load(id);
    if (a.status !== 'ao_approved' || !this.aoOf(me, a.applicant)) throw new ForbiddenException('Nothing to send');
    const sg = await this.signatory(a.applicant);
    if (!sg.ids.size) throw new BadRequestException(sg.note ?? 'No signatory account yet');
    a.status = 'awaiting_signatory';
    await this.apps.save(a);
    await this.pingSignatories(a);
    return this.view(me, await this.load(id));
  }

  private async aosFor(a: User) {
    const sid = this.schoolId(a);
    if (!sid) return [];
    const aos = await this.users.find({ where: { role: In([Role.ADMIN_OFFICER, Role.PUBLISHER]), status: AccountStatus.APPROVED } });
    return aos.filter((u) => this.managedIds(u).has(sid));
  }

  private async pingSignatories(a: LeaveApplication) {
    const sg = await this.signatory(a.applicant);
    const us = sg.ids.size ? await this.users.find({ where: { id: In([...sg.ids]) } }) : [];
    for (const u of us) await this.ping(u, `${a.applicant.name} has a leave application (Form 6) waiting for your signature.`);
  }

  // ---------- admin: the names printed on the form ----------
  async getSettings() { return { hrmo: (await this.sigs.findOne({ where: { key: 'hrmo' } }))?.name ?? '', asds: (await this.sigs.findOne({ where: { key: 'asds' } }))?.name ?? '' }; }
  async setSettings(dto: { hrmo?: string; asds?: string }) {
    for (const [key, v] of [['hrmo', dto.hrmo], ['asds', dto.asds]] as const) {
      if (v === undefined) continue;
      const row = (await this.sigs.findOne({ where: { key } })) ?? this.sigs.create({ key, signature: null, user: null });
      row.name = str(v, 150);
      await this.sigs.save(row);
    }
    return this.getSettings();
  }
}
