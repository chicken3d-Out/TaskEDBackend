import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { PersonalFile } from './personal-file.entity';
import { cleanLink } from '../common/links';
import { schoolYearOf, validSchoolYear } from '../common/school-year';

const ALLOWED_ROLES = [Role.TEACHER, Role.SCHOOL_HEAD, Role.ADMIN_OFFICER];

// "My files": a private, organised list of links to files the person keeps in
// their own Google Drive / OneDrive, grouped by school year and category.
@Injectable()
export class MyFilesService {
  constructor(@InjectRepository(PersonalFile) private repo: Repository<PersonalFile>) {}

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
      link: f.link,
      schoolYear: f.schoolYear,
      createdAt: f.createdAt,
    };
  }

  async list(user: User) {
    this.assertAllowed(user);
    const files = await this.repo.find({ where: { owner: { id: user.id } }, order: { createdAt: 'DESC' } });
    return { currentYear: schoolYearOf(), files: files.map((f) => this.view(f)) };
  }

  async add(user: User, dto: { label?: string; category?: string; link?: string; schoolYear?: string }) {
    this.assertAllowed(user);
    const label = (dto.label ?? '').trim().slice(0, 150);
    if (!label) throw new BadRequestException('A label is required');
    const saved = await this.repo.save(
      this.repo.create({
        owner: { id: user.id } as User,
        label,
        category: (dto.category ?? '').trim().slice(0, 60) || null,
        link: cleanLink(dto.link),
        schoolYear: dto.schoolYear ? validSchoolYear(dto.schoolYear) : schoolYearOf(),
      }),
    );
    return this.view(saved);
  }

  private async own(user: User, id: string): Promise<PersonalFile> {
    this.assertAllowed(user);
    const f = await this.repo.findOne({ where: { id, owner: { id: user.id } } });
    if (!f) throw new NotFoundException('File not found');
    return f;
  }

  async update(user: User, id: string, dto: { label?: string; category?: string; link?: string; schoolYear?: string }) {
    const f = await this.own(user, id);
    if (dto.label !== undefined) {
      if (!dto.label.trim()) throw new BadRequestException('A label is required');
      f.label = dto.label.trim().slice(0, 150);
    }
    if (dto.category !== undefined) f.category = dto.category.trim().slice(0, 60) || null;
    if (dto.link !== undefined) f.link = cleanLink(dto.link);
    if (dto.schoolYear !== undefined) f.schoolYear = validSchoolYear(dto.schoolYear);
    return this.view(await this.repo.save(f));
  }

  // Removes the entry from TaskEd only; the file stays in the person's storage.
  async remove(user: User, id: string) {
    const f = await this.own(user, id);
    await this.repo.remove(f);
    return { ok: true };
  }
}
