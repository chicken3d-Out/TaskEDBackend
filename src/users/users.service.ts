import {
  BadRequestException,
  ConflictException,
  Logger,
  OnApplicationBootstrap,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';
import { Role, AccountStatus } from '../common/enums/role.enum';
import { SchoolsService } from '../schools/schools.service';
import { School } from '../schools/school.entity';

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

export interface CreateUserDto {
  kind: 'staff' | 'admin';
  firstName: string;
  middleName?: string;
  lastName: string;
  contactNumber?: string;
  designation?: string;
  district?: string;
  area?: string;
  schoolId?: string;
  // staff
  depedEmail?: string;
  role?: Role;
  // admin
  username?: string;
  password?: string;
}

export interface AdminUpdateUserDto extends UpdateProfileDto {
  depedEmail?: string;
}

export const MIN_PASSWORD_LENGTH = 10;

export interface AssignRoleDto {
  role: Role;
}

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    private schoolsService: SchoolsService,
  ) {}

  findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { googleId } });
  }

  // Case-insensitive: Google may report a different capitalisation than an
  // Administrator typed when pre-creating the account.
  async findByEmail(depedEmail: string): Promise<User | null> {
    const row = await this.usersRepo
      .createQueryBuilder('u')
      .select('u.id')
      .where('lower(u.deped_email) = lower(:email)', { email: depedEmail })
      .getOne();
    return row ? this.findById(row.id) : null;
  }

  async linkGoogleId(user: User, googleId: string): Promise<User> {
    if (!user.googleId) {
      user.googleId = googleId;
      return this.usersRepo.save(user);
    }
    return user;
  }

  // ---- Administrator (username + password) accounts ----

  async verifyAdminLogin(username: string, password: string): Promise<User | null> {
    const row = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.username) = lower(:username)', { username: (username ?? '').trim() })
      .getOne();
    // Always run a bcrypt compare so response time does not reveal whether
    // the username exists.
    const hash = row?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali';
    const ok = await bcrypt.compare(password ?? '', hash);
    if (!row || !row.passwordHash || !ok) return null;
    if (row.role !== Role.ADMINISTRATOR || row.status !== AccountStatus.APPROVED) return null;
    return this.findById(row.id);
  }

  private assertPasswordStrong(password: string | undefined) {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
  }

  async changeOwnPassword(user: User, currentPassword: string, newPassword: string) {
    if (!user.username) throw new ForbiddenException('This account does not use a password');
    this.assertPasswordStrong(newPassword);
    const row = await this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: user.id })
      .getOne();
    if (!row?.passwordHash || !(await bcrypt.compare(currentPassword ?? '', row.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.usersRepo.update(user.id, { passwordHash: await bcrypt.hash(newPassword, 10) });
    return { ok: true };
  }

  async resetAdminPassword(admin: User, targetId: string, newPassword: string) {
    this.assertAdmin(admin);
    const target = await this.findById(targetId);
    if (!target) throw new NotFoundException('User not found');
    if (!target.username) throw new BadRequestException('Only password accounts can be reset');
    this.assertPasswordStrong(newPassword);
    await this.usersRepo.update(target.id, { passwordHash: await bcrypt.hash(newPassword, 10) });
    return { ok: true };
  }

  // First administrator: set ADMIN_USERNAME + ADMIN_PASSWORD on the host and
  // the account is created at startup if it does not exist. To recover a
  // lost password, also set ADMIN_RESET_PASSWORD=true for one start.
  async onApplicationBootstrap() {
    const username = (process.env.ADMIN_USERNAME ?? '').trim();
    const password = process.env.ADMIN_PASSWORD ?? '';
    if (!username || !password) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.logger.warn(`ADMIN_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters; admin not created`);
      return;
    }
    const existing = await this.usersRepo
      .createQueryBuilder('u')
      .where('lower(u.username) = lower(:username)', { username })
      .getOne();
    if (existing) {
      if (process.env.ADMIN_RESET_PASSWORD === 'true') {
        await this.usersRepo.update(existing.id, {
          passwordHash: await bcrypt.hash(password, 10),
          role: Role.ADMINISTRATOR,
          status: AccountStatus.APPROVED,
        });
        this.logger.log(`Password reset for administrator "${username}"`);
      }
      return;
    }
    const admin = this.usersRepo.create({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      firstName: 'System',
      lastName: 'Administrator',
      name: 'System Administrator',
      designation: 'System Administrator',
      role: Role.ADMINISTRATOR,
      status: AccountStatus.APPROVED,
      approvedAt: new Date(),
    });
    await this.usersRepo.save(admin);
    this.logger.log(`Created administrator account "${username}"`);
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

  async applyProfile(user: User, dto: UpdateProfileDto) {
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
    // An AO's school is always the school on their profile.
    if (user.role === Role.ADMIN_OFFICER && user.school && dto.schoolId) {
      await this.assertAoSchoolFree(user.school, user.id);
      user.assignedSchools = [user.school];
    }
    // District and area always come from the school (Sta. Fe District, Area 1).
    if (user.school) {
      user.district = user.school.district;
      user.area = user.school.area ?? '1';
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

    if (dto.role === Role.ADMINISTRATOR && !target.username) {
      throw new BadRequestException(
        'Administrator accounts use a username and password. Create one with "Add user".',
      );
    }
    if (target.username && dto.role !== Role.ADMINISTRATOR) {
      throw new BadRequestException('A username/password account must stay an Administrator');
    }
    if (target.id === admin.id && dto.role !== Role.ADMINISTRATOR) {
      throw new BadRequestException('You cannot change your own role');
    }

    if (dto.role === Role.TEACHER) {
      if (!target.school) {
        throw new BadRequestException('This user has no school on their profile yet');
      }
      target.assignedSchools = [];
    } else if (dto.role === Role.ADMIN_OFFICER) {
      // An Administrative Officer handles exactly one school: the school on
      // their own profile. One AO per school.
      if (!target.school) {
        throw new BadRequestException('This user has no school on their profile yet');
      }
      await this.assertAoSchoolFree(target.school, target.id);
      target.assignedSchools = [target.school];
    } else if (dto.role === Role.SCHOOL) {
      if (!target.school) {
        throw new BadRequestException('This user has no school on their profile yet');
      }
      await this.assertSchoolAccountFree(target.school.id, target.id);
      target.assignedSchools = [];
    } else {
      target.assignedSchools = [];
    }

    target.role = dto.role;
    target.status = AccountStatus.APPROVED;
    target.approvedBy = admin;
    target.approvedAt = new Date();
    return this.usersRepo.save(target);
  }

  // One Administrative Officer per school.
  async assertAoSchoolFree(school: School, exceptUserId?: string) {
    const existing = await this.findAoForSchool(school.id);
    if (existing && existing.id !== exceptUserId) {
      throw new BadRequestException(
        `${school.name} already has an Administrative Officer (${existing.name})`,
      );
    }
  }

  // One School account per school.
  async assertSchoolAccountFree(schoolId: string, exceptUserId?: string) {
    const existing = await this.usersRepo
      .createQueryBuilder('user')
      .innerJoin('user.school', 'school', 'school.id = :schoolId', { schoolId })
      .where('user.role = :role', { role: Role.SCHOOL })
      .andWhere('user.status != :rejected', { rejected: AccountStatus.REJECTED })
      .getMany();
    const other = existing.find((u) => u.id !== exceptUserId);
    if (other) {
      throw new BadRequestException(`This school already has a School account (${other.name})`);
    }
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

  // ---- Administrator tools: add, edit, suspend ----

  normalizeEmail(email: string | undefined) {
    const e = (email ?? '').trim().toLowerCase();
    const domain = (process.env.ALLOWED_EMAIL_DOMAIN || 'deped.gov.ph').toLowerCase();
    if (!e || !e.endsWith(`@${domain}`)) {
      throw new BadRequestException(`A @${domain} email address is required`);
    }
    return e;
  }

  async createUser(admin: User, dto: CreateUserDto): Promise<User> {
    this.assertAdmin(admin);
    // School accounts are named after the school, so names are optional there.
    if (dto.role !== Role.SCHOOL && (!dto.firstName?.trim() || !dto.lastName?.trim())) {
      throw new BadRequestException('First and last name are required');
    }

    const user = this.usersRepo.create({
      status: AccountStatus.APPROVED,
      approvedBy: admin,
      approvedAt: new Date(),
      assignedSchools: [],
    });

    if (dto.kind === 'admin') {
      const username = (dto.username ?? '').trim();
      if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
        throw new BadRequestException('Username must be 3-40 letters, numbers, dot, dash or underscore');
      }
      this.assertPasswordStrong(dto.password);
      const taken = await this.usersRepo
        .createQueryBuilder('u')
        .where('lower(u.username) = lower(:username)', { username })
        .getOne();
      if (taken) throw new ConflictException('That username is already taken');
      user.username = username;
      user.passwordHash = await bcrypt.hash(dto.password!, 10);
      user.role = Role.ADMINISTRATOR;
      user.depedEmail = dto.depedEmail ? this.normalizeEmail(dto.depedEmail) : null;
    } else {
      const email = this.normalizeEmail(dto.depedEmail);
      if (await this.findByEmail(email)) {
        throw new ConflictException('An account with that email already exists');
      }
      if (!dto.role || dto.role === Role.ADMINISTRATOR || !Object.values(Role).includes(dto.role)) {
        throw new BadRequestException('Choose Teacher, Administrative Officer, School or Publisher');
      }
      user.depedEmail = email;
      user.role = dto.role;
    }

    await this.applyProfile(user, dto);

    if ((user.role === Role.TEACHER || user.role === Role.SCHOOL) && !user.school) {
      throw new BadRequestException('Teachers and School accounts need a school');
    }
    if (user.role === Role.SCHOOL) {
      await this.assertSchoolAccountFree(user.school!.id);
      if (!user.name) user.name = user.school!.name;
    }
    if (user.role === Role.ADMIN_OFFICER) {
      if (!user.school) throw new BadRequestException('Choose the school of this Administrative Officer');
      await this.assertAoSchoolFree(user.school);
      user.assignedSchools = [user.school];
    }
    return this.usersRepo.save(user);
  }

  async adminUpdateUser(admin: User, targetId: string, dto: AdminUpdateUserDto): Promise<User> {
    this.assertAdmin(admin);
    const target = await this.findById(targetId);
    if (!target) throw new NotFoundException('User not found');
    if (dto.depedEmail !== undefined && !target.username) {
      const email = this.normalizeEmail(dto.depedEmail);
      const other = await this.findByEmail(email);
      if (other && other.id !== target.id) {
        throw new ConflictException('Another account already uses that email');
      }
      target.depedEmail = email;
    }
    // Only an Administrator assigns schools. An empty schoolId clears it, so an
    // AO can be set to blank to free the school for another AO.
    if (dto.schoolId === '') {
      if (target.role === Role.ADMINISTRATOR) throw new BadRequestException('Administrators have no school');
      target.school = null;
      target.assignedSchools = [];
      target.district = null as any;
      target.area = null;
      const { schoolId: _drop, ...rest } = dto;
      await this.applyProfile(target, rest);
    } else {
      await this.applyProfile(target, dto);
    }
    return this.usersRepo.save(target);
  }

  async setStatus(admin: User, targetId: string, status: AccountStatus): Promise<User> {
    this.assertAdmin(admin);
    if (status !== AccountStatus.APPROVED && status !== AccountStatus.SUSPENDED) {
      throw new BadRequestException('Status must be approved or suspended');
    }
    const target = await this.findById(targetId);
    if (!target) throw new NotFoundException('User not found');
    if (target.id === admin.id) throw new BadRequestException('You cannot change your own status');
    if (status === AccountStatus.APPROVED && !target.role) {
      throw new BadRequestException('Assign a role first');
    }
    target.status = status;
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
    // Once a school is on the profile, only an Administrator can change it:
    // a school decides whose tasks and data a person can see.
    const { schoolId, ...rest } = fields;
    if (schoolId && user.school && schoolId !== user.school.id) {
      throw new ForbiddenException('Only an Administrator can change your school');
    }
    await this.applyProfile(user, schoolId && !user.school ? fields : rest);
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
