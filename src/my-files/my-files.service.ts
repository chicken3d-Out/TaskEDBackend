import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { GoogleService, DRIVE_SCOPE } from '../google/google.service';
import { PersonalFile } from './personal-file.entity';
import { PERSONAL_FILE_FORMATS, assertAllowedFile } from '../common/file-types';
import { schoolYearLabel, schoolYearOf } from '../common/school-year';

const ALLOWED_ROLES = [Role.TEACHER, Role.SCHOOL_HEAD, Role.ADMIN_OFFICER];

@Injectable()
export class MyFilesService {
  constructor(
    @InjectRepository(PersonalFile) private repo: Repository<PersonalFile>,
    private google: GoogleService,
  ) {}

  private assertAllowed(user: User) {
    if (!ALLOWED_ROLES.includes(user.role as Role)) {
      throw new ForbiddenException('My files is for Teachers, School Heads and Administrative Officers');
    }
  }

  private view(f: PersonalFile) {
    return {
      id: f.id,
      label: f.label,
      category: f.category,
      fileName: f.fileName,
      mimeType: f.mimeType,
      size: f.size,
      schoolYear: f.schoolYear,
      createdAt: f.createdAt,
    };
  }

  async list(user: User) {
    this.assertAllowed(user);
    const files = await this.repo.find({ where: { owner: { id: user.id } }, order: { createdAt: 'DESC' } });
    return {
      currentYear: schoolYearOf(),
      driveConnected: await this.google.hasScope(user.id, DRIVE_SCOPE),
      files: files.map((f) => this.view(f)),
    };
  }

  async upload(user: User, file: Express.Multer.File | undefined, label?: string, category?: string) {
    this.assertAllowed(user);
    const info = assertAllowedFile(file, PERSONAL_FILE_FORMATS);
    if (!(await this.google.hasScope(user.id, DRIVE_SCOPE))) {
      throw new BadRequestException(
        'Google Drive is not connected. Use "Connect Google Drive" and allow access, then try again.',
      );
    }
    const sy = schoolYearOf();
    const cleanLabel = (label ?? '').trim().slice(0, 150) || info.name.replace(/\.[^.]+$/, '');
    const cleanCategory = (category ?? '').trim().slice(0, 60) || null;

    const folder = await this.google.ensureFolderPath(user.id, [
      'TaskEd',
      'My Files',
      schoolYearLabel(sy),
      ...(cleanCategory ? [cleanCategory] : []),
    ]);
    const stored = await this.google.uploadFile(user.id, folder, `${cleanLabel} - ${info.name}`, info.mime, file!.buffer);
    try {
      const saved = await this.repo.save(
        this.repo.create({
          owner: { id: user.id } as User,
          label: cleanLabel,
          category: cleanCategory,
          fileName: info.name,
          mimeType: info.mime,
          size: file!.size,
          driveFileId: stored.id,
          schoolYear: sy,
        }),
      );
      return this.view(saved);
    } catch (e) {
      await this.google.deleteFile(user.id, stored.id);
      throw e;
    }
  }

  private async own(user: User, id: string): Promise<PersonalFile> {
    this.assertAllowed(user);
    const f = await this.repo.findOne({ where: { id, owner: { id: user.id } } });
    if (!f) throw new NotFoundException('File not found');
    return f;
  }

  async remove(user: User, id: string) {
    const f = await this.own(user, id);
    await this.google.deleteFile(user.id, f.driveFileId);
    await this.repo.remove(f);
    return { ok: true };
  }

  async download(user: User, id: string) {
    const f = await this.own(user, id);
    const res = await this.google.downloadFile(user.id, f.driveFileId);
    return { res, name: f.fileName, mime: f.mimeType };
  }

  async rename(user: User, id: string, label: string, category?: string) {
    const f = await this.own(user, id);
    if (!label?.trim()) throw new BadRequestException('A label is required');
    f.label = label.trim().slice(0, 150);
    if (category !== undefined) f.category = category.trim().slice(0, 60) || null;
    return this.view(await this.repo.save(f));
  }
}
