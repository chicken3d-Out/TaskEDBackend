import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { School } from '../schools/school.entity';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { UsersService, UpdateProfileDto } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { SCHOOL_FILE_FORMATS, assertAllowedFile, mimeFor } from '../common/file-types';
import { schoolYearLabel, schoolYearOf } from '../common/school-year';
import { DRIVE_SCOPE, GoogleService } from '../google/google.service';
import { SchoolDocumentType } from './school-document-type.entity';
import { SchoolFile, SchoolFileKind } from './school-file.entity';

export interface SchoolProfileDto {
  name?: string; // administrators only
  schoolCode?: string;
  address?: string;
  contactNumber?: string;
  email?: string;
  schoolHeadName?: string;
  schoolHeadContact?: string;
}

export interface TeacherDto {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  contactNumber?: string;
  designation?: string;
  depedEmail?: string;
}

const clean = (v?: string | null) => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

@Injectable()
export class SchoolPortalService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(School) private schoolsRepo: Repository<School>,
    @InjectRepository(SchoolDocumentType) private typesRepo: Repository<SchoolDocumentType>,
    @InjectRepository(SchoolFile) private filesRepo: Repository<SchoolFile>,
    private usersService: UsersService,
    private notifications: NotificationsService,
    private google: GoogleService,
  ) {}

  // ---- access rules ----
  // View: Administrator, the school's own School account, an AO assigned to it.
  // Manage teachers: the same three.
  // Edit profile / upload files: Administrator or the school's own School account.
  private canView(user: User, schoolId: string) {
    if (user.role === Role.ADMINISTRATOR) return true;
    if (user.role === Role.SCHOOL || user.role === Role.SCHOOL_HEAD) return user.school?.id === schoolId;
    if (user.role === Role.ADMIN_OFFICER) return (user.assignedSchools ?? []).some((s) => s.id === schoolId);
    return false;
  }
  private assertView(user: User, schoolId: string) {
    if (!this.canView(user, schoolId)) throw new ForbiddenException('You do not have access to this school');
  }
  private canEdit(user: User, schoolId: string) {
    return (
      user.role === Role.ADMINISTRATOR ||
      ((user.role === Role.SCHOOL || user.role === Role.SCHOOL_HEAD) && user.school?.id === schoolId)
    );
  }
  private assertEdit(user: User, schoolId: string) {
    if (!this.canEdit(user, schoolId)) {
      throw new ForbiddenException('Only the School account, the School Head or an Administrator can do this');
    }
  }
  private async getSchool(id: string): Promise<School> {
    const school = await this.schoolsRepo.findOne({ where: { id } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }

  // ---- schools ----
  async mySchools(user: User): Promise<School[]> {
    if (user.role === Role.ADMINISTRATOR) {
      return this.schoolsRepo.find({ order: { name: 'ASC' } });
    }
    if (user.role === Role.SCHOOL || user.role === Role.SCHOOL_HEAD) return user.school ? [user.school] : [];
    if (user.role === Role.ADMIN_OFFICER) return user.assignedSchools ?? [];
    return [];
  }

  async schoolsSummary(admin: User) {
    if (admin.role !== Role.ADMINISTRATOR) throw new ForbiddenException('Administrators only');
    const schools = await this.schoolsRepo.find({ order: { name: 'ASC' } });
    const users = await this.usersRepo.find();
    const activeTypes = await this.typesRepo.count({ where: { active: true } });
    const files = await this.filesRepo.find({ where: { schoolYear: schoolYearOf() }, relations: ['school'] });
    return schools.map((s) => {
      const atSchool = users.filter((u) => u.school?.id === s.id);
      const ao = users.find(
        (u) => u.role === Role.ADMIN_OFFICER && u.status === AccountStatus.APPROVED && (u.assignedSchools ?? []).some((x) => x.id === s.id),
      );
      const types = new Set(
        files.filter((f) => f.school?.id === s.id && f.documentType?.active).map((f) => f.documentType.id),
      );
      return {
        id: s.id,
        name: s.name,
        district: s.district,
        area: s.area,
        teachers: atSchool.filter((u) => u.role === Role.TEACHER && u.status === AccountStatus.APPROVED).length,
        pendingTeachers: atSchool.filter((u) => !u.role && u.status === AccountStatus.PENDING && u.registrationComplete).length,
        schoolAccount: atSchool.find((u) => u.role === Role.SCHOOL && u.status !== AccountStatus.REJECTED)?.name ?? null,
        schoolHead: atSchool.find((u) => u.role === Role.SCHOOL_HEAD && u.status === AccountStatus.APPROVED)?.name ?? s.schoolHeadName ?? null,
        ao: ao?.name ?? null,
        documentsUploaded: types.size,
        documentsTotal: activeTypes,
      };
    });
  }

  private mini(u: User) {
    return {
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      designation: u.designation,
      contactNumber: u.contactNumber,
      depedEmail: u.depedEmail,
      status: u.status,
    };
  }

  async overview(user: User, schoolId: string) {
    this.assertView(user, schoolId);
    const school = await this.getSchool(schoolId);
    const atSchool = await this.usersRepo.find({ where: { school: { id: schoolId } } });
    const aos = await this.usersService.findAOsForSchool(schoolId);
    const account = atSchool.find((u) => u.role === Role.SCHOOL && u.status !== AccountStatus.REJECTED);
    const head = atSchool.find((u) => u.role === Role.SCHOOL_HEAD && u.status === AccountStatus.APPROVED);
    return {
      school,
      canEdit: this.canEdit(user, schoolId),
      personnel: {
        // The School Head account of this school; falls back to the name typed
        // in the school profile when nobody holds that role yet.
        schoolHead: head
          ? this.mini(head)
          : school.schoolHeadName
            ? { id: null, name: school.schoolHeadName, avatarUrl: null, designation: 'School Head', contactNumber: school.schoolHeadContact, depedEmail: null, status: null }
            : null,
        schoolAccount: account ? this.mini(account) : null,
        administrativeOfficers: aos.map((u) => this.mini(u)),
        teachers: atSchool
          .filter((u) => u.role === Role.TEACHER && u.status === AccountStatus.APPROVED)
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
          .map((u) => this.mini(u)),
      },
    };
  }

  async updateSchool(user: User, schoolId: string, dto: SchoolProfileDto) {
    this.assertEdit(user, schoolId);
    const school = await this.getSchool(schoolId);
    if (dto.schoolCode !== undefined) school.schoolCode = clean(dto.schoolCode);
    if (dto.address !== undefined) school.address = clean(dto.address);
    if (dto.contactNumber !== undefined) school.contactNumber = clean(dto.contactNumber);
    if (dto.email !== undefined) school.email = clean(dto.email);
    if (dto.schoolHeadName !== undefined) school.schoolHeadName = clean(dto.schoolHeadName);
    if (dto.schoolHeadContact !== undefined) school.schoolHeadContact = clean(dto.schoolHeadContact);
    if (dto.name !== undefined && user.role === Role.ADMINISTRATOR && clean(dto.name)) {
      school.name = clean(dto.name)!;
    }
    return this.schoolsRepo.save(school);
  }

  // ---- teachers ----
  // Teachers of the school, plus people who chose this school in their
  // profile and are still waiting for a role.
  async listTeachers(user: User, schoolId: string) {
    this.assertView(user, schoolId);
    const atSchool = await this.usersRepo.find({
      where: { school: { id: schoolId } },
      order: { name: 'ASC' },
    });
    return atSchool.filter(
      (u) =>
        u.role === Role.TEACHER ||
        (!u.role && u.status === AccountStatus.PENDING && u.registrationComplete),
    );
  }

  private async getManagedTeacher(user: User, schoolId: string, userId: string): Promise<User> {
    this.assertView(user, schoolId);
    const target = await this.usersService.findById(userId);
    const isCandidate =
      target && target.school?.id === schoolId && (target.role === Role.TEACHER || !target.role);
    if (!target || !isCandidate) throw new NotFoundException('Teacher not found at this school');
    return target;
  }

  async addTeacher(user: User, schoolId: string, dto: TeacherDto) {
    this.assertView(user, schoolId);
    if (!dto.firstName?.trim() || !dto.lastName?.trim()) {
      throw new BadRequestException('First and last name are required');
    }
    const email = this.usersService.normalizeEmail(dto.depedEmail);
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('An account with that email already exists');
    }
    const teacher = this.usersRepo.create({
      depedEmail: email,
      role: Role.TEACHER,
      status: AccountStatus.APPROVED,
      approvedBy: user,
      approvedAt: new Date(),
      assignedSchools: [],
    });
    await this.usersService.applyProfile(teacher, { ...dto, schoolId } as UpdateProfileDto);
    const saved = await this.usersRepo.save(teacher);
    return this.usersService.findById(saved.id);
  }

  async updateTeacher(user: User, schoolId: string, userId: string, dto: TeacherDto) {
    const target = await this.getManagedTeacher(user, schoolId, userId);
    if (dto.depedEmail !== undefined && !target.googleId) {
      const email = this.usersService.normalizeEmail(dto.depedEmail);
      const other = await this.usersService.findByEmail(email);
      if (other && other.id !== target.id) throw new ConflictException('Another account uses that email');
      target.depedEmail = email;
    }
    await this.usersService.applyProfile(target, {
      firstName: dto.firstName,
      middleName: dto.middleName,
      lastName: dto.lastName,
      contactNumber: dto.contactNumber,
      designation: dto.designation,
    });
    await this.usersRepo.save(target);
    return this.usersService.findById(target.id);
  }

  async setTeacherStatus(user: User, schoolId: string, userId: string, status: AccountStatus) {
    if (status !== AccountStatus.APPROVED && status !== AccountStatus.SUSPENDED) {
      throw new BadRequestException('Status must be approved or suspended');
    }
    const target = await this.getManagedTeacher(user, schoolId, userId);
    if (target.role !== Role.TEACHER) throw new BadRequestException('Approve this person as a teacher first');
    target.status = status;
    await this.usersRepo.save(target);
    return this.usersService.findById(target.id);
  }

  async approveTeacher(user: User, schoolId: string, userId: string) {
    const target = await this.getManagedTeacher(user, schoolId, userId);
    if (target.role || target.status !== AccountStatus.PENDING) {
      throw new BadRequestException('This account is not waiting for approval');
    }
    target.role = Role.TEACHER;
    target.status = AccountStatus.APPROVED;
    target.assignedSchools = [];
    target.approvedBy = user;
    target.approvedAt = new Date();
    const saved = await this.usersRepo.save(target);
    await this.notifications
      .create(saved, NotificationType.ACCOUNT_APPROVED, 'Your account was approved. Welcome to TaskEd!')
      .catch(() => {});
    return this.usersService.findById(saved.id);
  }

  async rejectTeacher(user: User, schoolId: string, userId: string) {
    const target = await this.getManagedTeacher(user, schoolId, userId);
    if (target.role || target.status !== AccountStatus.PENDING) {
      throw new BadRequestException('This account is not waiting for approval');
    }
    target.status = AccountStatus.REJECTED;
    target.approvedBy = user;
    target.approvedAt = new Date();
    await this.usersRepo.save(target);
    return this.usersService.findById(target.id);
  }

  // ---- document types (Administrator decides what schools must upload) ----
  private assertAdmin(user: User) {
    if (user.role !== Role.ADMINISTRATOR) throw new ForbiddenException('Administrators only');
  }

  listTypes(user: User, includeInactive = false) {
    const where = includeInactive && user.role === Role.ADMINISTRATOR ? {} : { active: true };
    return this.typesRepo.find({ where, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async createType(admin: User, dto: { name: string; description?: string; required?: boolean }) {
    this.assertAdmin(admin);
    if (!dto.name?.trim()) throw new BadRequestException('A document name is required');
    const count = await this.typesRepo.count();
    return this.typesRepo.save(
      this.typesRepo.create({
        name: dto.name.trim(),
        description: clean(dto.description),
        required: !!dto.required,
        sortOrder: count,
      }),
    );
  }

  async updateType(
    admin: User,
    id: string,
    dto: { name?: string; description?: string; required?: boolean; active?: boolean },
  ) {
    this.assertAdmin(admin);
    const type = await this.typesRepo.findOne({ where: { id } });
    if (!type) throw new NotFoundException('Document type not found');
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('A document name is required');
      type.name = dto.name.trim();
    }
    if (dto.description !== undefined) type.description = clean(dto.description);
    if (dto.required !== undefined) type.required = !!dto.required;
    if (dto.active !== undefined) type.active = !!dto.active;
    return this.typesRepo.save(type);
  }

  async deleteType(admin: User, id: string) {
    this.assertAdmin(admin);
    const type = await this.typesRepo.findOne({ where: { id } });
    if (!type) throw new NotFoundException('Document type not found');
    const files = await this.filesRepo.count({ where: { documentType: { id } } });
    if (files > 0) {
      throw new BadRequestException(
        `${files} file(s) were already uploaded for this document. Hide it instead of deleting it.`,
      );
    }
    await this.typesRepo.delete(id);
    return { ok: true };
  }

  // ---- school files ----
  // Files are kept in the uploader's own Google Drive, in
  // TaskEd / School Files / <school> / S.Y. xxxx-xxxx / <document>.
  // Access is decided here, not in Drive: the downloads below stream through
  // TaskEd after checking who is asking.
  private canUploadFiles(user: User, schoolId: string) {
    return (user.role === Role.SCHOOL || user.role === Role.SCHOOL_HEAD) && user.school?.id === schoolId;
  }

  async listFiles(user: User, schoolId: string) {
    this.assertView(user, schoolId);
    const types = await this.listTypes(user);
    const all = await this.filesRepo.find({
      where: { school: { id: schoolId } },
      relations: ['uploadedBy'],
      order: { createdAt: 'DESC' },
    });
    const current = schoolYearOf();
    const view = (f?: SchoolFile) =>
      f
        ? {
            id: f.id,
            fileName: f.fileName,
            uploadedBy: f.uploadedBy?.name ?? null,
            createdAt: f.createdAt,
          }
        : null;
    const now = all.filter((f) => f.schoolYear === current);
    const old = all.filter((f) => f.schoolYear !== current);
    const years = [...new Set(old.map((f) => f.schoolYear))].sort().reverse();
    return {
      canUpload: this.canUploadFiles(user, schoolId),
      driveConnected: await this.google.hasScope(user.id, DRIVE_SCOPE),
      currentYear: current,
      documents: types.map((t) => ({
        type: t,
        soft: view(now.find((f) => f.documentType.id === t.id && f.kind === 'soft')),
        scanned: view(now.find((f) => f.documentType.id === t.id && f.kind === 'scanned')),
      })),
      // Earlier school years, newest first (shown collapsed).
      archive: years.map((sy) => ({
        schoolYear: sy,
        files: old
          .filter((f) => f.schoolYear === sy)
          .map((f) => ({ ...view(f)!, document: f.documentType?.name ?? '', kind: f.kind })),
      })),
    };
  }

  private assertKind(kind: string): asserts kind is SchoolFileKind {
    if (kind !== 'soft' && kind !== 'scanned') throw new BadRequestException('Kind must be soft or scanned');
  }

  async uploadFile(
    user: User,
    schoolId: string,
    documentTypeId: string,
    kind: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!this.canUploadFiles(user, schoolId)) {
      throw new ForbiddenException('Only the School account or the School Head of this school can upload files');
    }
    this.assertKind(kind);
    const info = assertAllowedFile(file, SCHOOL_FILE_FORMATS[kind]);
    if (!(await this.google.hasScope(user.id, DRIVE_SCOPE))) {
      throw new BadRequestException(
        'Google Drive is not connected. Use "Connect Google Drive" and allow access, then try again.',
      );
    }
    const school = await this.getSchool(schoolId);
    const type = await this.typesRepo.findOne({ where: { id: documentTypeId, active: true } });
    if (!type) throw new NotFoundException('Document type not found');
    const sy = schoolYearOf();

    const folder = await this.google.ensureFolderPath(user.id, [
      'TaskEd',
      'School Files',
      school.name,
      schoolYearLabel(sy),
      type.name,
    ]);
    const stored = await this.google.uploadFile(
      user.id,
      folder,
      `${kind === 'soft' ? 'Soft copy' : 'Scanned copy'} - ${info.name}`,
      info.mime,
      file!.buffer,
    );

    const existing = await this.filesRepo.findOne({
      where: { school: { id: schoolId }, documentType: { id: type.id }, kind, schoolYear: sy },
      relations: ['uploadedBy'],
    });
    const previous = existing ? { driveFileId: existing.driveFileId, owner: existing.uploadedBy?.id } : null;
    const row = existing ?? this.filesRepo.create({ school, documentType: type, kind, schoolYear: sy });
    row.fileName = info.name;
    row.fileUrl = null;
    row.driveFileId = stored.id;
    row.mimeType = info.mime;
    row.uploadedBy = user;
    try {
      await this.filesRepo.save(row);
    } catch (e) {
      await this.google.deleteFile(user.id, stored.id);
      throw e;
    }
    // The replaced copy is removed from its owner's Drive.
    if (previous?.driveFileId && previous.owner) await this.google.deleteFile(previous.owner, previous.driveFileId);
    return { ok: true };
  }

  async deleteFile(user: User, schoolId: string, fileId: string) {
    this.assertEdit(user, schoolId);
    const file = await this.filesRepo.findOne({
      where: { id: fileId, school: { id: schoolId } },
      relations: ['uploadedBy'],
    });
    if (!file) throw new NotFoundException('File not found');
    if (file.driveFileId && file.uploadedBy) await this.google.deleteFile(file.uploadedBy.id, file.driveFileId);
    await this.filesRepo.remove(file);
    return { ok: true };
  }

  // Checks who is asking, then streams the file from the owner's Drive.
  async downloadFile(user: User, schoolId: string, fileId: string) {
    this.assertView(user, schoolId);
    const file = await this.filesRepo.findOne({
      where: { id: fileId, school: { id: schoolId } },
      relations: ['uploadedBy'],
    });
    if (!file) throw new NotFoundException('File not found');
    const mime = file.mimeType ?? mimeFor(file.fileName);
    if (file.driveFileId && file.uploadedBy) {
      return { res: await this.google.downloadFile(file.uploadedBy.id, file.driveFileId), name: file.fileName, mime };
    }
    if (file.fileUrl) {
      // Older files stored on Cloudinary.
      const res = await fetch(file.fileUrl);
      if (!res.ok) throw new BadRequestException('Could not open the file');
      return { res, name: file.fileName, mime };
    }
    throw new NotFoundException('File not found');
  }

  // Used by the dashboard.
  async fileProgress(schoolId: string) {
    const types = await this.typesRepo.find({ where: { active: true } });
    const files = await this.filesRepo.find({
      where: { school: { id: schoolId }, schoolYear: schoolYearOf(), documentType: { id: In(types.map((t) => t.id)) } },
    });
    const done = new Set(files.map((f) => f.documentType.id));
    return { uploaded: done.size, total: types.length };
  }
}
