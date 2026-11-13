import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TravelAttachment } from './travel-attachment.entity';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { TaFormData, TaSignature, TaStatus, TravelAuthority } from './travel-authority.entity';
import { TravelSignatory } from './travel-signatory.entity';
import { StorageService } from '../storage/storage.service';

const FIELDS: (keyof TaFormData)[] = ['name', 'position', 'station', 'purpose', 'host', 'dates', 'destination', 'fund', 'dateFrom', 'dateTo'];
const APPLICANTS = [Role.TEACHER, Role.SCHOOL_HEAD, Role.ADMIN_OFFICER, Role.PUBLISHER, Role.DS_SECRETARY];
const SIGNERS = [...APPLICANTS, Role.DISTRICT_SUPERVISOR];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SIG = 400_000;

export interface Route {
  countersign: { name: string; userId: string | null; note?: string } | null;
  recommending: { name: string; userId: string | null; note?: string } | null;
  approving: { name: string; userId: string | null; note?: string };
  approvingByEmail: boolean; // the approving authority does not e-sign: the signed form is emailed
}

const MAX_ATTACH = 5;
const MAX_ATTACH_BYTES = 4 * 1024 * 1024;

@Injectable()
export class TravelAuthorityService {
  constructor(
    @InjectRepository(TravelAuthority) private repo: Repository<TravelAuthority>,
    @InjectRepository(TravelSignatory) private sigs: Repository<TravelSignatory>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(TravelAttachment) private attachments: Repository<TravelAttachment>,
    private notifications: NotificationsService,
    private storage: StorageService,
  ) {}

  // ---------- who can do what ----------
  private canUse(u: User) {
    if (!u.role || !SIGNERS.includes(u.role)) throw new ForbiddenException('Travel Authority is not available for this account');
  }

  // The teacher an AO / AO Publisher may apply for (same school only).
  private async teacherFor(actor: User, teacherId: string): Promise<User> {
    if (actor.role !== Role.ADMIN_OFFICER && actor.role !== Role.PUBLISHER) throw new ForbiddenException('Only an Administrative Officer can do this');
    const t = await this.users.findOne({ where: { id: teacherId } });
    if (!t || t.role !== Role.TEACHER || !t.school) throw new NotFoundException('Teacher not found');
    if (!(actor.assignedSchools ?? []).some((s) => s.id === t.school!.id)) throw new ForbiddenException('This teacher is not at your school');
    return t;
  }

  private signerName(u: User | null, printed?: string) {
    return (printed?.trim() || u?.name || '').toUpperCase();
  }

  private async signatory(key: string) {
    const s = await this.sigs.findOne({ where: { key } });
    return { user: s?.user ?? null, name: this.signerName(s?.user ?? null, s?.name), signature: s?.signature ?? null };
  }

  // Who signs, for a requester.
  //  Within the Division (Teacher / AO / Publisher): School Head recommends, District Supervisor approves.
  //  Outside the Division (or a School Head applying): the District Supervisor recommends - after the
  //  School Head has countersigned, if the applicant is not the School Head - and the Schools Division
  //  Superintendent approves by email, not by e-signature.
  async route(requester: User, outside: boolean): Promise<Route> {
    const ds = await this.signatory('district_supervisor');
    const sds = await this.signatory('sds');
    const dsPart = { name: ds.name, userId: ds.user?.id ?? null, note: !ds.name ? 'The Administrator has not set the District Supervisor yet.' : !ds.user ? 'No TaskEd account is linked to the District Supervisor, so they cannot sign here.' : undefined };
    // an AO's school may be recorded as the school they are assigned to
    const school = requester.school ?? requester.assignedSchools?.[0] ?? null;
    const head = requester.role === Role.SCHOOL_HEAD ? null : school ? await this.users.findOne({ where: { role: Role.SCHOOL_HEAD, status: AccountStatus.APPROVED, school: { id: school.id } } }) : null;
    const headPart = { name: this.signerName(head), userId: head?.id ?? null, note: head ? undefined : `${school?.name ?? 'Your school'} has no School Head account yet.` };
    const long = outside || requester.role === Role.SCHOOL_HEAD || requester.role === Role.DS_SECRETARY;
    if (!long) return { countersign: null, recommending: headPart, approving: dsPart, approvingByEmail: false };
    return {
      countersign: outside && requester.role !== Role.SCHOOL_HEAD && requester.role !== Role.DS_SECRETARY ? headPart : null,
      recommending: dsPart,
      approving: { name: sds.name, userId: null, note: sds.name ? undefined : 'The Administrator has not set the Schools Division Superintendent yet.' },
      approvingByEmail: true,
    };
  }

  async routeFor(me: User, outside: boolean, requesterId?: string) {
    this.canUse(me);
    const requester = requesterId && requesterId !== me.id ? await this.teacherFor(me, requesterId) : me;
    return this.route(requester, outside);
  }

  // ---------- views ----------
  private view(t: TravelAuthority, me: User, withSigs: boolean) {
    const mine = (id?: string | null) => !!id && id === me.id;
    return {
      id: t.id,
      status: t.status,
      outside: t.outside,
      data: t.data,
      ownerId: t.owner?.id,
      ownerName: t.owner?.name,
      requesterId: t.requester?.id,
      requesterName: t.requester?.name,
      countersignName: t.countersignName,
      approvingByEmail: t.approvingByEmail,
      emailedAt: t.emailedAt,
      recommendingName: t.recommendingName,
      approvingName: t.approvingName,
      taNumber: t.taNumber,
      driveLink: mine(t.owner?.id) ? t.driveLink : null,
      rev: t.rev,
      driveRev: t.driveRev,
      needsDriveSync: mine(t.owner?.id) && t.driveRev < t.rev,
      myTurn: this.myTurn(t, me),
      isOwner: mine(t.owner?.id),
      signed: { requester: !!t.sigRequester, countersign: !!t.sigCountersign, recommending: !!t.sigRecommending, approving: !!t.sigApproving },
      sigs: withSigs ? { requester: t.sigRequester, countersign: t.sigCountersign, recommending: t.sigRecommending, approving: t.sigApproving } : undefined,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private myTurn(t: TravelAuthority, me: User): 'requester' | 'countersign' | 'recommending' | 'approving' | null {
    if (t.status === 'draft' && t.owner?.id === me.id && t.requester?.id === me.id) return 'requester';
    if (t.status === 'awaiting_requester' && t.requester?.id === me.id) return 'requester';
    if (t.status === 'awaiting_countersign' && t.countersignUser?.id === me.id) return 'countersign';
    if (t.status === 'awaiting_recommending' && t.recommendingUser?.id === me.id) return 'recommending';
    if (t.status === 'awaiting_approving' && t.approvingUser?.id === me.id) return 'approving';
    // the DS Secretary signs for the District Supervisor
    if (me.role === Role.DS_SECRETARY) {
      if (t.status === 'awaiting_recommending' && t.approvingByEmail) return 'recommending';
      if (t.status === 'awaiting_approving' && !t.approvingByEmail) return 'approving';
    }
    return null;
  }

  private involved(t: TravelAuthority, me: User) {
    if (me.role === Role.DS_SECRETARY && !['draft', 'awaiting_requester', 'awaiting_countersign'].includes(t.status)) return true;
    return [t.owner?.id, t.requester?.id, t.countersignUser?.id, t.recommendingUser?.id, t.approvingUser?.id].includes(me.id);
  }

  async mine(me: User) {
    this.canUse(me);
    const rows = await this.repo.find({ where: [{ owner: { id: me.id } }, { requester: { id: me.id } }], order: { createdAt: 'DESC' } });
    return this.withAttachments(rows.map((t) => this.view(t, me, false)));
  }

  // the log shows each card's attachments so they can be opened without leaving the page
  private async withAttachments(views: any[]) {
    if (!views.length) return views;
    const rows = await this.attachments.find({ where: { travelAuthority: { id: In(views.map((v) => v.id)) } }, order: { createdAt: 'ASC' }, select: ['id', 'name', 'mime', 'size', 'url'], relations: ['travelAuthority'] });
    for (const v of views) v.attachments = rows.filter((a) => a.travelAuthority?.id === v.id).map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, url: a.url }));
    return views;
  }

  async inbox(me: User) {
    this.canUse(me);
    const rows = await this.repo.find({
      where: [
        { status: 'awaiting_requester', requester: { id: me.id } },
        { status: 'awaiting_countersign', countersignUser: { id: me.id } },
        { status: 'awaiting_recommending', recommendingUser: { id: me.id } },
        { status: 'awaiting_approving', approvingUser: { id: me.id } },
        { status: 'awaiting_email', owner: { id: me.id } },
      ],
      order: { updatedAt: 'DESC' },
    });
    if (me.role === Role.DS_SECRETARY) {
      const have = new Set(rows.map((r) => r.id));
      const ds = await this.repo.find({ where: [{ status: 'awaiting_recommending', approvingByEmail: true }, { status: 'awaiting_approving', approvingByEmail: false }], order: { updatedAt: 'DESC' } });
      for (const t of ds) if (!have.has(t.id)) rows.push(t);
    }
    return this.withAttachments(rows.map((t) => this.view(t, me, false)));
  }

  private async load(id: string): Promise<TravelAuthority> {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Travel Authority not found');
    return t;
  }

  async get(me: User, id: string) {
    const t = await this.load(id);
    if (!this.involved(t, me)) throw new ForbiddenException('This Travel Authority is not yours');
    const v: any = this.view(t, me, true);
    v.attachments = await this.attachmentList(id);
    // the DS Secretary signs with the District Supervisor's signature (set by the Administrator)
    if (me.role === Role.DS_SECRETARY && (v.myTurn === 'recommending' || v.myTurn === 'approving')) v.signAs = (await this.signatory('district_supervisor')).signature;
    return v;
  }

  private attachmentList(id: string) {
    return this.attachments.find({ where: { travelAuthority: { id } }, order: { createdAt: 'ASC' }, select: ['id', 'name', 'mime', 'size', 'url'] });
  }

  // ---------- writing ----------
  private clean(d: Partial<TaFormData> | undefined): TaFormData {
    const o: any = {};
    for (const k of FIELDS) o[k] = String((d as any)?.[k] ?? '').trim().slice(0, k === 'purpose' || k === 'destination' || k === 'station' ? 500 : 200);
    if (o.dateFrom && !ISO.test(o.dateFrom)) throw new BadRequestException('Check the start date');
    if (o.dateTo && !ISO.test(o.dateTo)) throw new BadRequestException('Check the end date');
    if (o.dateFrom && o.dateTo && o.dateTo < o.dateFrom) throw new BadRequestException('The end date cannot be before the start date');
    return o as TaFormData;
  }

  private async applyRoute(t: TravelAuthority) {
    const r = await this.route(t.requester, t.outside);
    t.countersignUser = r.countersign?.userId ? ({ id: r.countersign.userId } as User) : null;
    t.countersignName = r.countersign?.name ?? '';
    t.approvingByEmail = r.approvingByEmail;
    t.recommendingUser = r.recommending?.userId ? ({ id: r.recommending.userId } as User) : null;
    t.recommendingName = r.recommending?.name ?? '';
    t.approvingUser = r.approving.userId ? ({ id: r.approving.userId } as User) : null;
    t.approvingName = r.approving.name;
  }

  async create(me: User, dto: { data?: Partial<TaFormData>; outside?: boolean; forTeacherId?: string }) {
    this.canUse(me);
    if (!APPLICANTS.includes(me.role!)) throw new ForbiddenException('This account only signs Travel Authorities');
    const requester = dto.forTeacherId ? await this.teacherFor(me, dto.forTeacherId) : me;
    const t = this.repo.create({
      owner: { id: me.id } as User,
      requester: { id: requester.id } as User,
      data: this.clean(dto.data),
      outside: !!dto.outside,
      status: 'draft',
      rev: 1,
      driveRev: 0,
    });
    t.requester = requester;
    await this.applyRoute(t);
    const saved = await this.repo.save(t);
    return this.view(await this.load(saved.id), me, true);
  }

  async update(me: User, id: string, dto: { data?: Partial<TaFormData>; outside?: boolean }) {
    const t = await this.load(id);
    if (t.owner?.id !== me.id) throw new ForbiddenException('Only the person who made it can edit it');
    if (t.status !== 'draft' && t.status !== 'awaiting_requester') throw new BadRequestException('It has already been signed. Delete it and apply again to change it.');
    if (dto.data) t.data = this.clean(dto.data);
    if (dto.outside !== undefined) t.outside = !!dto.outside;
    await this.applyRoute(t);
    t.rev += 1;
    await this.repo.save(t);
    return this.view(await this.load(id), me, true);
  }

  // The owner hands an on-behalf draft to the teacher to sign.
  async sendToRequester(me: User, id: string) {
    const t = await this.load(id);
    if (t.owner?.id !== me.id) throw new ForbiddenException('Only the person who made it can send it');
    if (t.requester.id === me.id) throw new BadRequestException('Sign it yourself instead');
    if (t.status !== 'draft') throw new BadRequestException('Already sent');
    t.status = 'awaiting_requester';
    t.rev += 1;
    await this.repo.save(t);
    await this.ping(t.requester, `${me.name} prepared a Travel Authority for you to sign.`, t.id);
    return this.view(await this.load(id), me, true);
  }

  async sign(me: User, id: string, dto: { x?: number; y?: number }) {
    this.canUse(me);
    const t = await this.load(id);
    const turn = this.myTurn(t, me);
    if (!turn) throw new ForbiddenException('It is not your turn to sign this');
    const x = Number(dto.x), y = Number(dto.y);
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new BadRequestException('Tap on the form where the signature goes');
    const me2 = await this.users.findOne({ where: { id: me.id }, select: ['id', 'signature'] });
    let img = me2?.signature ?? null;
    // the District Supervisor's step: the Secretary (and the DS, if none of their own) uses the signature the Administrator uploaded
    const dsStep = (turn === 'recommending' && t.approvingByEmail) || (turn === 'approving' && !t.approvingByEmail);
    if (dsStep && (me.role === Role.DS_SECRETARY || !img)) {
      const ds = await this.signatory('district_supervisor');
      if (me.role === Role.DS_SECRETARY) img = ds.signature;
      else img = img ?? ds.signature;
      if (!img) throw new BadRequestException('The District Supervisor’s signature has not been uploaded yet. Ask the Administrator (Users › Travel Authority signatories).');
    }
    if (!img) throw new BadRequestException('Add your signature in My profile first');
    const sig: TaSignature = { img, x, y, at: new Date().toISOString() };

    if (turn === 'requester') {
      if (!t.data.name || !t.data.purpose || !t.data.destination) throw new BadRequestException('Fill in the name, purpose and destination first');
      await this.applyRoute(t); // names may have changed since the draft
      t.sigRequester = sig;
      t.status = this.nextAfterRequester(t);
    } else if (turn === 'countersign') {
      t.sigCountersign = sig;
      t.status = 'awaiting_recommending';
    } else if (turn === 'recommending') {
      t.sigRecommending = sig;
      if (t.approvingByEmail) {
        // the District Supervisor was the last e-signature: now the applicant emails it for the Superintendent
        t.status = 'awaiting_email';
      } else t.status = 'awaiting_approving';
    } else {
      t.sigApproving = sig;
      t.status = 'approved';
    }
    t.rev += 1;
    await this.repo.save(t);
    await this.afterSign(t, me);
    return this.view(await this.load(id), me, true);
  }

  private nextAfterRequester(t: TravelAuthority): TaStatus {
    const dsIsNext = t.approvingByEmail && !(t.countersignUser && t.countersignUser.id !== t.requester.id);
    if (dsIsNext) {
      if (!t.recommendingName) throw new BadRequestException('The Administrator has not set the District Supervisor yet.');
      return 'awaiting_recommending'; // the DS, or the DS Secretary on their behalf, signs
    }
    if (t.countersignUser && t.countersignUser.id !== t.requester.id) return 'awaiting_countersign';
    if (t.countersignName && !t.countersignUser) throw new BadRequestException(`${t.countersignName || 'The School Head'} has no TaskEd account yet. Ask the Administrator.`);
    if (!t.recommendingUser) throw new BadRequestException(`${t.recommendingName || 'The recommending authority'} has no TaskEd account yet. Ask the Administrator to link one.`);
    return 'awaiting_recommending';
  }

  private async afterSign(t: TravelAuthority, signer: User) {
    const who = t.requester?.name ?? 'Someone';
    const next = t.status === 'awaiting_countersign' ? t.countersignUser : t.status === 'awaiting_recommending' ? t.recommendingUser : t.status === 'awaiting_approving' ? t.approvingUser : null;
    const dsNow = (t.status === 'awaiting_recommending' && t.approvingByEmail) || (t.status === 'awaiting_approving' && !t.approvingByEmail);
    if (dsNow) {
      const secs = await this.users.find({ where: { role: Role.DS_SECRETARY, status: AccountStatus.APPROVED } });
      const to = new Map<string, User>();
      if (next) to.set(next.id, next);
      for (const u of secs) to.set(u.id, u);
      for (const u of to.values()) await this.ping(u, `${who} has a Travel Authority waiting for the District Supervisor’s signature.`, t.id);
    } else if (next) await this.ping(next, `${who} has a Travel Authority waiting for your signature.`, t.id);
    else if (t.status === 'awaiting_email') {
      await this.ping(t.owner, `${who}'s Travel Authority is signed. Open it and press “Send to Travel Authority” to email it for the Superintendent.`, t.id);
      if (t.requester.id !== t.owner.id) await this.ping(t.requester, 'Your Travel Authority is signed. It will be emailed for the Superintendent.', t.id);
    } else if (t.status === 'approved') {
      await this.ping(t.requester, 'Your Travel Authority is fully signed.', t.id);
      if (t.owner.id !== t.requester.id) await this.ping(t.owner, `${who}'s Travel Authority is fully signed.`, t.id);
    }
    void signer;
  }

  private async ping(user: User, message: string, id: string) {
    try { await this.notifications.create(user, NotificationType.TRAVEL_AUTHORITY, message, id); } catch { /* best effort */ }
  }

  // The applicant (the one who made it) emailed the signed form from their own DepEd mailbox.
  async markEmailed(me: User, id: string) {
    const t = await this.load(id);
    if (t.owner?.id !== me.id) throw new ForbiddenException('Only the person who applied can send it');
    if (t.status !== 'awaiting_email') throw new BadRequestException('It is not ready to be emailed');
    t.status = 'emailed';
    t.emailedAt = new Date();
    t.rev += 1;
    await this.repo.save(t);
    if (t.requester.id !== me.id) await this.ping(t.requester, 'Your Travel Authority was emailed to the Travel Authority mailbox.', t.id);
    return this.view(await this.load(id), me, true);
  }

  async setDrive(me: User, id: string, dto: { link?: string; rev?: number }) {
    const t = await this.load(id);
    if (t.owner?.id !== me.id) throw new ForbiddenException('Only the owner keeps the Drive copy');
    const link = String(dto.link ?? '').trim().slice(0, 1500);
    if (link) t.driveLink = link;
    t.driveRev = Math.min(Number(dto.rev) || t.rev, t.rev);
    await this.repo.save(t);
    return { ok: true };
  }

  async remove(me: User, id: string) {
    const t = await this.load(id);
    if (t.owner?.id !== me.id) throw new ForbiddenException('Only the person who made it can delete it');
    await this.repo.remove(t);
    return { ok: true };
  }

  // ---------- attachments (optional) ----------
  private async editable(me: User, id: string) {
    const t = await this.load(id);
    if (t.owner?.id !== me.id) throw new ForbiddenException('Only the person who made it can change the attachments');
    if (t.status !== 'draft' && t.status !== 'awaiting_requester') throw new BadRequestException('It has already been signed.');
    return t;
  }
  signUpload(me: User) {
    this.canUse(me);
    return this.storage.signTravel(me.id);
  }

  // The browser has already sent the file straight to Cloudinary; we keep its address.
  async addAttachment(me: User, id: string, dto: { name?: string; mime?: string; size?: number; url?: string; publicId?: string }) {
    await this.editable(me, id);
    const name = String(dto.name ?? '').replace(/[\\/]+/g, ' ').trim().slice(0, 200);
    const url = String(dto.url ?? '').trim();
    if (!name || !url) throw new BadRequestException('Choose a file');
    if (!this.storage.ownsUrl(url)) throw new BadRequestException('That file was not uploaded through TaskEd');
    const size = Math.max(0, Math.min(Number(dto.size) || 0, MAX_ATTACH_BYTES));
    if ((Number(dto.size) || 0) > MAX_ATTACH_BYTES) throw new BadRequestException('Each attachment must be 4 MB or smaller');
    if ((await this.attachments.count({ where: { travelAuthority: { id } } })) >= MAX_ATTACH) throw new BadRequestException(`At most ${MAX_ATTACH} attachments`);
    await this.attachments.save(this.attachments.create({
      travelAuthority: { id } as TravelAuthority, name, mime: String(dto.mime ?? 'application/octet-stream').slice(0, 100), size,
      url: url.slice(0, 600), publicId: String(dto.publicId ?? '').slice(0, 300) || null,
    }));
    return this.attachmentList(id);
  }
  async removeAttachment(me: User, id: string, aid: string) {
    await this.editable(me, id);
    const a = await this.attachments.findOne({ where: { id: aid, travelAuthority: { id } } as any });
    if (a) {
      if (a.publicId) void this.storage.destroy(a.publicId, a.url);
      await this.attachments.delete({ id: aid });
    }
    return this.attachmentList(id);
  }
  // older attachments (saved before Cloudinary) still come back as base64
  async getAttachment(me: User, id: string, aid: string) {
    const t = await this.load(id);
    if (!this.involved(t, me)) throw new ForbiddenException('This Travel Authority is not yours');
    const a = await this.attachments.createQueryBuilder('a').addSelect('a.data').where('a.id = :aid AND a.travelAuthority = :id', { aid, id }).getOne();
    if (!a) throw new NotFoundException('Attachment not found');
    return { name: a.name, mime: a.mime, url: a.url, data: a.data ? a.data.toString('base64') : null };
  }

  // ---------- TA number (DS Secretary) ----------
  async numbering() {
    const rows = await this.repo.find({ where: { status: 'approved' }, order: { updatedAt: 'DESC' } });
    return rows.map((t) => ({
      id: t.id, name: t.data?.name ?? '', destination: t.data?.destination ?? '', dates: t.data?.dates ?? '',
      requesterName: t.requester?.name ?? '', taNumber: t.taNumber, taNumberedAt: t.taNumberedAt, approvedAt: t.sigApproving?.at ?? t.updatedAt,
    }));
  }

  // level E (Elementary) or S (Secondary), the month, and the running number: E-11-205
  async setNumber(me: User, id: string, dto: { level?: string; month?: number; seq?: number | string }) {
    const t = await this.load(id);
    if (t.status !== 'approved') throw new BadRequestException('Only a fully signed Travel Authority can be numbered');
    const level = String(dto.level ?? '').toUpperCase();
    const month = Math.trunc(Number(dto.month));
    const seq = String(dto.seq ?? '').trim();
    if (level !== 'E' && level !== 'S') throw new BadRequestException('Choose E (Elementary) or S (Secondary)');
    if (!(month >= 1 && month <= 12)) throw new BadRequestException('The month must be 1 to 12');
    if (!/^\d{1,6}$/.test(seq)) throw new BadRequestException('The last number must be digits only');
    const number = `${level}-${month}-${Number(seq)}`;
    const clash = await this.repo.findOne({ where: { taNumber: number } });
    if (clash && clash.id !== t.id) throw new BadRequestException(`${number} is already used by ${clash.data?.name ?? 'another Travel Authority'}`);
    t.taNumber = number;
    t.taNumberedAt = new Date();
    t.rev += 1; // the owner's Drive copy is rebuilt with the number
    await this.repo.save(t);
    await this.ping(t.requester, `Your Travel Authority is now numbered ${number}.`, t.id);
    if (t.owner.id !== t.requester.id) await this.ping(t.owner, `${t.requester.name}'s Travel Authority is now numbered ${number}.`, t.id);
    void me;
    return { id: t.id, taNumber: number };
  }

  // ---------- signature (profile) ----------
  async getSignature(me: User) {
    this.canUse(me);
    const u = await this.users.findOne({ where: { id: me.id }, select: ['id', 'signature'] });
    return { signature: u?.signature ?? null };
  }
  async setSignature(me: User, signature: string | null) {
    this.canUse(me);
    if (signature !== null) {
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > MAX_SIG) throw new BadRequestException('The signature must be a PNG image under 300 KB');
    }
    await this.users.update({ id: me.id }, { signature });
    return { signature };
  }

  // ---------- admin settings ----------
  async getSettings() {
    const rows = await this.sigs.find();
    const pick = (key: string) => {
      const r = rows.find((x) => x.key === key);
      return { userId: r?.user?.id ?? null, userName: r?.user?.name ?? '', email: r?.user?.depedEmail ?? '', name: r?.name ?? '', signature: r?.signature ?? null };
    };
    return { districtSupervisor: pick('district_supervisor'), sds: { ...pick('sds'), signature: null } };
  }
  async setSettings(dto: { districtSupervisor?: { userId?: string | null; name?: string; signature?: string | null }; sds?: { userId?: string | null; name?: string } }) {
    const save = async (key: string, v?: { userId?: string | null; name?: string; signature?: string | null }) => {
      if (!v) return;
      if (v.userId) {
        const u = await this.users.findOne({ where: { id: v.userId } });
        if (!u || !u.role || !SIGNERS.includes(u.role)) throw new BadRequestException('Choose a Teacher, School Head, AO, Publisher, District Supervisor or DS Secretary account');
      }
      const row = (await this.sigs.findOne({ where: { key } })) ?? this.sigs.create({ key, signature: null });
      row.user = v.userId ? ({ id: v.userId } as User) : null;
      row.name = String(v.name ?? '').trim().slice(0, 150);
      if (key === 'district_supervisor' && v.signature !== undefined) {
        if (v.signature !== null && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.signature) || v.signature.length > MAX_SIG)) throw new BadRequestException('The signature must be a PNG image under 300 KB');
        row.signature = v.signature;
      }
      await this.sigs.save(row);
    };
    await save('district_supervisor', dto.districtSupervisor);
    await save('sds', dto.sds);
    return this.getSettings();
  }
}
