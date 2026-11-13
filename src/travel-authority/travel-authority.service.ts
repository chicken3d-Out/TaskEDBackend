import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TravelAttachment } from './travel-attachment.entity';
import { MailService } from './mail.service';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { TaFormData, TaSignature, TaStatus, TravelAuthority } from './travel-authority.entity';
import { TravelSignatory } from './travel-signatory.entity';

const FIELDS: (keyof TaFormData)[] = ['name', 'position', 'station', 'purpose', 'host', 'dates', 'destination', 'fund', 'dateFrom', 'dateTo'];
const SIGNERS = [Role.TEACHER, Role.SCHOOL_HEAD, Role.ADMIN_OFFICER, Role.PUBLISHER];
const MAX_SIG = 400_000;

export interface Route {
  countersign: { name: string; userId: string | null; note?: string } | null;
  recommending: { name: string; userId: string | null; note?: string } | null;
  approving: { name: string; userId: string | null; note?: string };
  approvingByEmail: boolean; // the approving authority does not e-sign: the signed form is emailed
}

const MAX_ATTACH = 5;
const MAX_ATTACH_BYTES = 4 * 1024 * 1024;
const MAX_DOCX_BYTES = 6 * 1024 * 1024;

@Injectable()
export class TravelAuthorityService {
  constructor(
    @InjectRepository(TravelAuthority) private repo: Repository<TravelAuthority>,
    @InjectRepository(TravelSignatory) private sigs: Repository<TravelSignatory>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(TravelAttachment) private attachments: Repository<TravelAttachment>,
    private notifications: NotificationsService,
    private mail: MailService,
    private config: ConfigService,
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
    return { user: s?.user ?? null, name: this.signerName(s?.user ?? null, s?.name) };
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
    const school = requester.school;
    const head = requester.role === Role.SCHOOL_HEAD ? null : school ? await this.users.findOne({ where: { role: Role.SCHOOL_HEAD, status: AccountStatus.APPROVED, school: { id: school.id } } }) : null;
    const headPart = { name: this.signerName(head), userId: head?.id ?? null, note: head ? undefined : `${school?.name ?? 'Your school'} has no School Head account yet.` };
    const long = outside || requester.role === Role.SCHOOL_HEAD;
    if (!long) return { countersign: null, recommending: headPart, approving: dsPart, approvingByEmail: false };
    return {
      countersign: outside && requester.role !== Role.SCHOOL_HEAD ? headPart : null,
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
    return null;
  }

  private involved(t: TravelAuthority, me: User) {
    return [t.owner?.id, t.requester?.id, t.countersignUser?.id, t.recommendingUser?.id, t.approvingUser?.id].includes(me.id);
  }

  async mine(me: User) {
    this.canUse(me);
    const rows = await this.repo.find({ where: [{ owner: { id: me.id } }, { requester: { id: me.id } }], order: { createdAt: 'DESC' } });
    return rows.map((t) => this.view(t, me, false));
  }

  async inbox(me: User) {
    this.canUse(me);
    const rows = await this.repo.find({
      where: [
        { status: 'awaiting_requester', requester: { id: me.id } },
        { status: 'awaiting_countersign', countersignUser: { id: me.id } },
        { status: 'awaiting_recommending', recommendingUser: { id: me.id } },
        { status: 'awaiting_approving', approvingUser: { id: me.id } },
      ],
      order: { updatedAt: 'DESC' },
    });
    return rows.map((t) => this.view(t, me, false));
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
    return v;
  }

  private attachmentList(id: string) {
    return this.attachments.find({ where: { travelAuthority: { id } }, order: { createdAt: 'ASC' }, select: ['id', 'name', 'mime', 'size'] });
  }

  // ---------- writing ----------
  private clean(d: Partial<TaFormData> | undefined): TaFormData {
    const o: any = {};
    for (const k of FIELDS) o[k] = String((d as any)?.[k] ?? '').trim().slice(0, k === 'purpose' || k === 'destination' || k === 'station' ? 500 : 200);
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

  async sign(me: User, id: string, dto: { x?: number; y?: number; docx?: string }) {
    this.canUse(me);
    const t = await this.load(id);
    const turn = this.myTurn(t, me);
    if (!turn) throw new ForbiddenException('It is not your turn to sign this');
    const x = Number(dto.x), y = Number(dto.y);
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new BadRequestException('Tap on the form where the signature goes');
    const me2 = await this.users.findOne({ where: { id: me.id }, select: ['id', 'signature'] });
    if (!me2?.signature) throw new BadRequestException('Add your signature in My profile first');
    const sig: TaSignature = { img: me2.signature, x, y, at: new Date().toISOString() };

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
        await this.emailSigned(t, dto.docx); // fails (and nothing is saved) if the email cannot be sent
        t.status = 'emailed';
        t.emailedAt = new Date();
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
    if (t.countersignUser && t.countersignUser.id !== t.requester.id) return 'awaiting_countersign';
    if (t.countersignName && !t.countersignUser) throw new BadRequestException(`${t.countersignName || 'The School Head'} has no TaskEd account yet. Ask the Administrator.`);
    if (!t.recommendingUser) throw new BadRequestException(`${t.recommendingName || 'The recommending authority'} has no TaskEd account yet. Ask the Administrator to link one.`);
    return 'awaiting_recommending';
  }

  // Outside the Division: after the District Supervisor signs, the e-signed form and the
  // attachments are emailed to the Travel Authority mailbox for the Superintendent.
  private async emailSigned(t: TravelAuthority, docxB64?: string) {
    if (!docxB64) throw new BadRequestException('The signed form was not included. Reload and try again.');
    const docx = Buffer.from(docxB64, 'base64');
    if (docx.length < 4 || docx.length > MAX_DOCX_BYTES || docx[0] !== 0x50 || docx[1] !== 0x4b) throw new BadRequestException('The signed form could not be read.');
    const files = await this.attachments.createQueryBuilder('a').addSelect('a.data').where('a.travelAuthority = :id', { id: t.id }).orderBy('a.createdAt', 'ASC').getMany();
    const d = t.data;
    const to = this.config.get<string>('TRAVEL_AUTHORITY_EMAIL') ?? 'travel.authority@deped.gov.ph';
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const text = [
      'Good day.',
      '',
      'Please find the e-signed Travel Authority for the approval of the Schools Division Superintendent.',
      '',
      `Name: ${d.name}`,
      `Position: ${d.position}`,
      `Destination: ${d.destination}`,
      `Inclusive dates: ${d.dates}`,
      `Purpose: ${d.purpose}`,
      `Host of activity: ${d.host}`,
      `Fund source: ${d.fund}`,
      '',
      `E-signed by: ${t.requester.name} (requesting employee)${t.sigCountersign ? `, ${t.countersignName} (School Head, countersigned)` : ''}, ${t.recommendingName} (recommending authority).`,
      `Approving authority: ${t.approvingName}`,
      files.length ? `Attachments: ${files.map((f) => f.name).join(', ')}` : 'No attachments.',
      '',
      'Sent through TaskEd, Schools Division of Leyte.',
    ].join('\n');
    await this.mail.send(to, `Travel Authority - ${safe(d.name)} - ${safe(d.destination)}`, text, [
      { filename: `Travel Authority - ${safe(d.name)}.docx`, content: docx },
      ...files.map((f) => ({ filename: f.name, content: f.data })),
    ]);
  }

  private async afterSign(t: TravelAuthority, signer: User) {
    const who = t.requester?.name ?? 'Someone';
    const next = t.status === 'awaiting_countersign' ? t.countersignUser : t.status === 'awaiting_recommending' ? t.recommendingUser : t.status === 'awaiting_approving' ? t.approvingUser : null;
    if (next) await this.ping(next, `${who} has a Travel Authority waiting for your signature.`, t.id);
    else if (t.status === 'approved' || t.status === 'emailed') {
      const msg = t.status === 'emailed' ? 'Your Travel Authority is signed and was emailed to the Travel Authority mailbox for the Superintendent.' : 'Your Travel Authority is fully signed.';
      await this.ping(t.requester, msg, t.id);
      if (t.owner.id !== t.requester.id) await this.ping(t.owner, `${who}'s Travel Authority is signed.`, t.id);
    }
    void signer;
  }

  private async ping(user: User, message: string, id: string) {
    try { await this.notifications.create(user, NotificationType.TRAVEL_AUTHORITY, message, id); } catch { /* best effort */ }
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
  async addAttachment(me: User, id: string, dto: { name?: string; mime?: string; data?: string }) {
    await this.editable(me, id);
    const name = String(dto.name ?? '').replace(/[\\/]+/g, ' ').trim().slice(0, 200);
    if (!name || !dto.data) throw new BadRequestException('Choose a file');
    const buf = Buffer.from(dto.data, 'base64');
    if (!buf.length || buf.length > MAX_ATTACH_BYTES) throw new BadRequestException('Each attachment must be 4 MB or smaller');
    if ((await this.attachments.count({ where: { travelAuthority: { id } } })) >= MAX_ATTACH) throw new BadRequestException(`At most ${MAX_ATTACH} attachments`);
    await this.attachments.save(this.attachments.create({ travelAuthority: { id } as TravelAuthority, name, mime: String(dto.mime ?? 'application/octet-stream').slice(0, 100), size: buf.length, data: buf }));
    return this.attachmentList(id);
  }
  async removeAttachment(me: User, id: string, aid: string) {
    await this.editable(me, id);
    await this.attachments.delete({ id: aid, travelAuthority: { id } } as any);
    return this.attachmentList(id);
  }
  async getAttachment(me: User, id: string, aid: string) {
    const t = await this.load(id);
    if (!this.involved(t, me)) throw new ForbiddenException('This Travel Authority is not yours');
    const a = await this.attachments.createQueryBuilder('a').addSelect('a.data').where('a.id = :aid AND a.travelAuthority = :id', { aid, id }).getOne();
    if (!a) throw new NotFoundException('Attachment not found');
    return { name: a.name, mime: a.mime, data: a.data.toString('base64') };
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
      return { userId: r?.user?.id ?? null, userName: r?.user?.name ?? '', email: r?.user?.depedEmail ?? '', name: r?.name ?? '' };
    };
    return { districtSupervisor: pick('district_supervisor'), sds: pick('sds') };
  }
  async setSettings(dto: { districtSupervisor?: { userId?: string | null; name?: string }; sds?: { userId?: string | null; name?: string } }) {
    const save = async (key: string, v?: { userId?: string | null; name?: string }) => {
      if (!v) return;
      if (v.userId) {
        const u = await this.users.findOne({ where: { id: v.userId } });
        if (!u || !u.role || !SIGNERS.includes(u.role)) throw new BadRequestException('Choose a Teacher, School Head, AO or Publisher account');
      }
      await this.sigs.save(this.sigs.create({ key, user: v.userId ? ({ id: v.userId } as User) : null, name: String(v.name ?? '').trim().slice(0, 150) }));
    };
    await save('district_supervisor', dto.districtSupervisor);
    await save('sds', dto.sds);
    return this.getSettings();
  }
}
