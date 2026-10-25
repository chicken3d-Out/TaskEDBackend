import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from './user.entity';
import { Role, AccountStatus } from '../common/enums/role.enum';
import { SchoolsService } from '../schools/schools.service';

export interface CompleteRegistrationDto {
  firstName: string;
  middleName?: string;
  lastName: string;
  contactNumber: string;
  designation: string;
  schoolId: string;
  district: string;
  area: string;
}

export interface UpdateProfileDto extends Partial<CompleteRegistrationDto> {
  avatarUrl?: string | null;
}

export interface AssignRoleDto {
  role: Role;
  assignedSchoolIds?: string[]; // required for ADMIN_OFFICER (1+)
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    private schoolsService: SchoolsService,
  ) {}

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { googleId } });
  }

  findByEmail(depedEmail: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { depedEmail } });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  // First-ever sign-in via Google: create a bare shell record.
  // No role/status decision happens here - that's the registration form.
  async createFromGoogle(googleId: string, depedEmail: string, name: string): Promise<User> {
    const user = this.usersRepo.create({
      googleId,
      depedEmail,
      name,
      status: AccountStatus.PENDING,
      role: null,
    });
    return this.usersRepo.save(user);
  }

  async promoteToAdministrator(user: User): Promise<User> {
    user.role = Role.ADMINISTRATOR;
    user.status = AccountStatus.APPROVED;
    if (!user.firstName && user.name) {
      const parts = user.name.trim().split(/\s+/);
      user.firstName = parts[0] ?? null;
      user.lastName = parts.length > 1 ? parts[parts.length - 1] : null;
    }
    user.designation = user.designation || 'System Administrator';
    user.district = user.district || 'Division Office';
    user.approvedAt = new Date();
    return this.usersRepo.save(user);
  }

  private composeName(first?: string | null, middle?: string | null, last?: string | null) {
    return [first, middle, last].map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
  }

  private clean(v?: string | null): string | null {
    const t = (v ?? '').trim();
    return t ? t : null;
  }

  // New users fill in their profile; they never choose a role. The account
  // stays PENDING with role = null until an Administrator assigns a role.
  async completeRegistration(userId: string, dto: CompleteRegistrationDto): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.registrationComplete) {
      throw new BadRequestException('Registration already completed');
    }
    await this.applyProfile(user, dto);
    user.status = user.status === AccountStatus.APPROVED ? user.status : AccountStatus.PENDING;
    return this.usersRepo.save(user);
  }

  private async applyProfile(user: User, dto: UpdateProfileDto) {
    if (dto.firstName !== undefined) user.firstName = this.clean(dto.firstName);
    if (dto.middleName !== undefined) user.middleName = this.clean(dto.middleName);
    if (dto.lastName !== undefined) user.lastName = this.clean(dto.lastName);
    if (dto.contactNumber !== undefined) user.contactNumber = this.clean(dto.contactNumber);
    if (dto.designation !== undefined) user.designation = this.clean(dto.designation) as any;
    if (dto.district !== undefined) user.district = this.clean(dto.district) as any;
    if (dto.area !== undefined) user.area = this.clean(dto.area);
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl || null;

    if (dto.schoolId) {
      const school = await this.schoolsService.findById(dto.schoolId);
      if (!school) throw new BadRequestException('Selected school does not exist');
      user.school = school;
    }

    const composed = this.composeName(user.firstName, user.middleName, user.lastName);
    if (composed) user.name = composed;
  }

  // ---- Administrator tools: every account is reviewed and given a role here ----

  private assertAdmin(user: User) {
    if (user.role !== Role.ADMINISTRATOR) {
      throw new ForbiddenException('Only Administrators can manage accounts');
    }
  }

  // Accounts that finished their profile and still wait for a role.
  async findPendingApprovalsFor(admin: User): Promise<User[]> {
    this.assertAdmin(admin);
    const pending = await this.usersRepo.find({
      where: { status: AccountStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    return pending.filter((u) => u.registrationComplete);
  }

  async findAllUsers(admin: User): Promise<User[]> {
    this.assertAdmin(admin);
    return this.usersRepo.find({ order: { createdAt: 'DESC' } });
  }

  // Sets (or changes) a user's role and approves them in one step.
  async assignRole(admin: User, targetUserId: string, dto: AssignRoleDto): Promise<User> {
    this.assertAdmin(admin);
    if (!Object.values(Role).includes(dto.role)) {
      throw new BadRequestException('Unknown role');
    }
    const target = await this.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');

    if (dto.role === Role.TEACHER) {
      if (!target.school) {
        throw new BadRequestException('This user has no school on their profile yet');
      }
      target.assignedSchools = [];
    } else if (dto.role === Role.ADMIN_OFFICER) {
      const ids = dto.assignedSchoolIds ?? [];
      if (ids.length === 0) {
        throw new BadRequestException('Select at least one school for an Administrative Officer');
      }
      const schools = await this.schoolsService.findByIds(ids);
      if (schools.length !== ids.length) {
        throw new BadRequestException('One or more selected schools do not exist');
      }
      // Business rule: exactly one AO per school.
      for (const school of schools) {
        const existing = await this.findAoForSchool(school.id);
        if (existing && existing.id !== target.id) {
          throw new BadRequestException(
            `${school.name} already has an Administrative Officer (${existing.name})`,
          );
        }
      }
      target.assignedSchools = schools;
    } else {
      target.assignedSchools = [];
    }

    target.role = dto.role;
    target.status = AccountStatus.APPROVED;
    target.approvedBy = admin;
    target.approvedAt = new Date();
    return this.usersRepo.save(target);
  }

  async reject(admin: User, targetUserId: string): Promise<User> {
    this.assertAdmin(admin);
    const target = await this.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');
    if (target.id === admin.id) throw new BadRequestException('You cannot reject yourself');
    target.status = AccountStatus.REJECTED;
    target.approvedBy = admin;
    target.approvedAt = new Date();
    return this.usersRepo.save(target);
  }

  // All teachers at a school need this for the ticket-visibility transparency rule,
  // and tickets need it to resolve "who is the AO for this teacher's school".
  // Since there's exactly one AO per school (enforced at registration),
  // this only ever returns 0 or 1 results in practice.
  findAOsForSchool(schoolId: string): Promise<User[]> {
    return this.usersRepo
      .createQueryBuilder('user')
      .innerJoin('user.assignedSchools', 'school', 'school.id = :schoolId', { schoolId })
      .where('user.role = :role', { role: Role.ADMIN_OFFICER })
      .andWhere('user.status = :status', { status: AccountStatus.APPROVED })
      .getMany();
  }

  // Used at registration time to enforce "one AO per school" - checks
  // PENDING too (not just APPROVED), so two people can't both register
  // as the AO for the same school and only get caught at approval time.
  private findAoForSchool(schoolId: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .innerJoin('user.assignedSchools', 'school', 'school.id = :schoolId', { schoolId })
      .where('user.role = :role', { role: Role.ADMIN_OFFICER })
      .andWhere('user.status IN (:...statuses)', {
        statuses: [AccountStatus.PENDING, AccountStatus.APPROVED],
      })
      .getOne();
  }

  async updateProfile(userId: string, fields: UpdateProfileDto): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    await this.applyProfile(user, fields);
    return this.usersRepo.save(user);
  }

  async savePushToken(userId: string, token: string): Promise<{ ok: true }> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.pushToken = token;
    await this.usersRepo.save(user);
    return { ok: true };
  }
}
