import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrProfile } from './hr-profile.entity';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';

export const HR_FIELDS = [
  'schoolIdNo', 'schoolName', 'itemNumber', 'positionTitle', 'salaryGrade', 'step', 'itemFrom', 'employeeNo',
  'nameExtension', 'sex', 'dateOfBirth', 'tin', 'originalAppointment', 'lastPromotion', 'status',
  'employmentStatus', 'eligibility', 'natureOfWork', 'monthlySalary', 'sourceOfFund', 'contractDuration',
] as const;
type HrField = (typeof HR_FIELDS)[number];
const DATE_FIELDS: HrField[] = ['dateOfBirth', 'originalAppointment', 'lastPromotion'];

@Injectable()
export class HrProfileService {
  constructor(
    @InjectRepository(HrProfile) private repo: Repository<HrProfile>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  private async target(id: string): Promise<User> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  // Administrator: anyone. Own profile for every role except Teacher. AO: teachers of the school they are assigned to.
  private canEdit(actor: User, t: User) {
    if (actor.role === Role.ADMINISTRATOR) return true;
    // AO, Publisher, School Head and School keep their own profile; a Teacher's is kept by the school's AO.
    if (actor.id === t.id && actor.role !== Role.TEACHER) return true;
    return (
      actor.role === Role.ADMIN_OFFICER &&
      t.role === Role.TEACHER &&
      !!t.school &&
      (actor.assignedSchools ?? []).some((s) => s.id === t.school!.id)
    );
  }
  private canView(actor: User, t: User) {
    return actor.id === t.id || this.canEdit(actor, t);
  }

  private shape(t: User, hp: HrProfile | null, canEdit: boolean) {
    const v: Record<string, any> = {};
    for (const f of HR_FIELDS) v[f] = (hp as any)?.[f] ?? null;
    if (v['monthlySalary'] != null) v['monthlySalary'] = Number(v['monthlySalary']);
    return {
      userId: t.id,
      canEdit,
      // Shown as defaults when nothing has been entered yet.
      defaults: {
        firstName: t.firstName,
        middleName: t.middleName,
        lastName: t.lastName,
        schoolName: t.school?.name ?? null,
        schoolIdNo: t.school?.schoolCode ?? null,
        positionTitle: t.designation ?? null,
        depedEmail: t.depedEmail,
      },
      ...v,
      updatedAt: hp?.updatedAt ?? null,
    };
  }

  async get(actor: User, userId: string) {
    const t = await this.target(userId);
    if (!this.canView(actor, t)) throw new ForbiddenException('You cannot view this profile');
    const hp = await this.repo.findOne({ where: { user: { id: userId } } });
    return this.shape(t, hp, this.canEdit(actor, t));
  }

  async save(actor: User, userId: string, dto: Record<string, any>) {
    const t = await this.target(userId);
    if (!this.canEdit(actor, t)) throw new ForbiddenException('Only the school\'s Administrative Officer or an Administrator can edit this');
    let hp = await this.repo.findOne({ where: { user: { id: userId } } });
    if (!hp) hp = this.repo.create({ user: { id: userId } as User });
    for (const f of HR_FIELDS) {
      if (dto[f] === undefined) continue;
      let val: any = dto[f] === null ? null : String(dto[f]).trim();
      if (val === '') val = null;
      if (val != null && DATE_FIELDS.includes(f) && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        throw new BadRequestException(`${f} must be a valid date`);
      }
      if (val != null && f === 'monthlySalary') {
        const n = Number(String(val).replace(/,/g, ''));
        if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Monthly salary must be a number');
        val = n.toFixed(2);
      }
      if (val != null && f === 'sex' && !['Male', 'Female'].includes(val)) throw new BadRequestException('Sex must be Male or Female');
      (hp as any)[f] = val;
    }
    await this.repo.save(hp);
    return this.shape(t, hp, true);
  }
}
