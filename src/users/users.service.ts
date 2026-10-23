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
  role: Role;
  designation: string;
  district: string;
  schoolId?: string; // required for TEACHER
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
    user.designation = user.designation || 'System Administrator';
    user.district = user.district || 'Division Office';
    user.approvedAt = new Date();
    return this.usersRepo.save(user);
  }

  async completeRegistration(userId: string, dto: CompleteRegistrationDto): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.registrationComplete) {
      throw new BadRequestException('Registration already completed');
    }

    user.role = dto.role;
    user.designation = dto.designation;
    user.district = dto.district;

    if (dto.role === Role.TEACHER) {
      if (!dto.schoolId) {
        throw new BadRequestException('Teachers must select their school');
      }
      const school = await this.schoolsService.findById(dto.schoolId);
      if (!school) throw new BadRequestException('Selected school does not exist');
      user.school = school;
      user.assignedSchools = [];
    } else if (dto.role === Role.ADMIN_OFFICER) {
      if (!dto.assignedSchoolIds || dto.assignedSchoolIds.length === 0) {
        throw new BadRequestException(
          'Administrative Officers must be assigned to at least one school',
        );
      }
      const schools = await this.schoolsService.findByIds(dto.assignedSchoolIds);
      if (schools.length !== dto.assignedSchoolIds.length) {
        throw new BadRequestException('One or more selected schools do not exist');
      }

      // Business rule: exactly one AO per school (an AO can still cover
      // several schools, but each school can only ever have one AO).
      for (const school of schools) {
        const existingAo = await this.findAoForSchool(school.id);
        if (existingAo) {
          throw new BadRequestException(
            `${school.name} already has an Administrative Officer assigned (${existingAo.name})`,
          );
        }
      }

      user.assignedSchools = schools;
      user.school = null;
    } else {
      // ADMIN_OFFICE_ACCOUNT / ADMINISTRATOR: no school binding required
      user.school = null;
      user.assignedSchools = [];
    }

    // Stays PENDING until the correct approver signs off (see approval chain).
    user.status = AccountStatus.PENDING;
    return this.usersRepo.save(user);
  }

  // Returns the pending accounts a given approver is allowed to act on.
  async findPendingApprovalsFor(approver: User): Promise<User[]> {
    if (approver.role === Role.ADMINISTRATOR) {
      return this.usersRepo.find({
        where: {
          status: AccountStatus.PENDING,
          role: In([Role.ADMINISTRATOR, Role.ADMIN_OFFICER, Role.ADMIN_OFFICE_ACCOUNT]),
        },
        order: { createdAt: 'ASC' },
      });
    }

    if (approver.role === Role.ADMIN_OFFICER) {
      const schoolIds = (approver.assignedSchools || []).map((s) => s.id);
      if (schoolIds.length === 0) return [];
      return this.usersRepo
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.school', 'school')
        .where('user.status = :status', { status: AccountStatus.PENDING })
        .andWhere('user.role = :role', { role: Role.TEACHER })
        .andWhere('school.id IN (:...schoolIds)', { schoolIds })
        .getMany();
    }

    throw new ForbiddenException('Your role cannot approve accounts');
  }

  async approve(approver: User, targetUserId: string): Promise<User> {
    const target = await this.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');
    this.assertCanActOnApproval(approver, target);

    target.status = AccountStatus.APPROVED;
    target.approvedBy = approver;
    target.approvedAt = new Date();
    return this.usersRepo.save(target);
  }

  async reject(approver: User, targetUserId: string): Promise<User> {
    const target = await this.findById(targetUserId);
    if (!target) throw new NotFoundException('User not found');
    this.assertCanActOnApproval(approver, target);

    target.status = AccountStatus.REJECTED;
    target.approvedBy = approver;
    target.approvedAt = new Date();
    return this.usersRepo.save(target);
  }

  // Enforces the approval chain from the spec:
  // - Administrator approves Administrator / AO / public-post accounts.
  // - The AO assigned to a school approves Teacher accounts for that school.
  private assertCanActOnApproval(approver: User, target: User) {
    if (!target.registrationComplete) {
      throw new BadRequestException('This account has not finished registration yet');
    }
    if (approver.role === Role.ADMINISTRATOR) {
      const allowedRoles = [Role.ADMINISTRATOR, Role.ADMIN_OFFICER, Role.ADMIN_OFFICE_ACCOUNT];
      if (!allowedRoles.includes(target.role as Role)) {
        throw new ForbiddenException('Administrators cannot approve this account type');
      }
      return;
    }
    if (approver.role === Role.ADMIN_OFFICER) {
      if (target.role !== Role.TEACHER) {
        throw new ForbiddenException('Administrative Officers can only approve Teacher accounts');
      }
      const approverSchoolIds = new Set((approver.assignedSchools || []).map((s) => s.id));
      if (!target.school || !approverSchoolIds.has(target.school.id)) {
        throw new ForbiddenException(
          'You can only approve teachers from your assigned school(s)',
        );
      }
      return;
    }
    throw new ForbiddenException('Your role cannot approve accounts');
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

  async updateProfile(
    userId: string,
    fields: Partial<Pick<User, 'name' | 'district' | 'designation'>> & { schoolId?: string },
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (fields.name !== undefined) user.name = fields.name;
    if (fields.district !== undefined) user.district = fields.district;
    if (fields.designation !== undefined) user.designation = fields.designation;

    // "School Name" is a listed editable profile field, but only makes
    // sense for Teachers (AOs manage assignedSchools via re-registration/
    // an admin action, not this endpoint).
    if (fields.schoolId !== undefined) {
      if (user.role !== Role.TEACHER) {
        throw new BadRequestException('Only teachers can change their school here');
      }
      const school = await this.schoolsService.findById(fields.schoolId);
      if (!school) throw new BadRequestException('Selected school does not exist');
      user.school = school;
    }

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
