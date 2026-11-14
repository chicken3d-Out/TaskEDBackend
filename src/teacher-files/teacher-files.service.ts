import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { cleanLink } from '../common/links';
import { TeacherFile } from './teacher-file.entity';

export const TEACHER_SECTIONS = ['PDS', 'Service Record', 'Service Credit', 'SALN', 'Other'];

@Injectable()
export class TeacherFilesService {
  constructor(
    @InjectRepository(TeacherFile) private repo: Repository<TeacherFile>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  // Only the Administrative Officer assigned to the teacher's school.
  private async teacherOf(actor: User, teacherId: string): Promise<User> {
    if (actor.role !== Role.ADMIN_OFFICER) throw new ForbiddenException('Only an Administrative Officer can manage teacher files');
    const t = await this.users.findOne({ where: { id: teacherId } });
    if (!t || !t.role || ![Role.TEACHER, Role.NON_TEACHING, Role.DS_SECRETARY].includes(t.role) || !t.school) throw new NotFoundException('Teacher not found');
    if (!(actor.assignedSchools ?? []).some((s) => s.id === t.school!.id)) {
      throw new ForbiddenException('This teacher is not at your school');
    }
    return t;
  }

  private view(f: TeacherFile) {
    return { id: f.id, section: f.section, label: f.label, link: f.link, createdAt: f.createdAt };
  }

  async list(actor: User, teacherId: string) {
    const t = await this.teacherOf(actor, teacherId);
    const files = await this.repo.find({
      where: { owner: { id: actor.id }, teacher: { id: t.id } },
      order: { createdAt: 'DESC' },
    });
    return {
      sections: TEACHER_SECTIONS,
      schoolName: t.school?.name ?? '',
      teacherName: t.name ?? '',
      files: files.map((f) => this.view(f)),
    };
  }

  async add(actor: User, teacherId: string, dto: { section?: string; label?: string; link?: string }) {
    const t = await this.teacherOf(actor, teacherId);
    const label = (dto.label ?? '').trim().slice(0, 150);
    if (!label) throw new BadRequestException('A label is required');
    const section = TEACHER_SECTIONS.includes(dto.section ?? '') ? dto.section! : 'Other';
    const saved = await this.repo.save(
      this.repo.create({ owner: { id: actor.id } as User, teacher: { id: t.id } as User, section, label, link: cleanLink(dto.link) }),
    );
    return this.view(saved);
  }

  async remove(actor: User, id: string) {
    if (actor.role !== Role.ADMIN_OFFICER) throw new ForbiddenException('Only an Administrative Officer can do this');
    const f = await this.repo.findOne({ where: { id, owner: { id: actor.id } } });
    if (!f) throw new NotFoundException('File not found');
    await this.repo.remove(f); // removes the entry from TaskEd only; the file stays in the AO's Drive
    return { ok: true };
  }
}
