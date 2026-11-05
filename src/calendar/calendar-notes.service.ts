import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { CalendarNote } from './calendar-note.entity';

export interface NoteDto {
  noteDate?: string;
  title?: string;
  body?: string;
}

function cleanDate(v: string | undefined): string {
  const s = (v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) {
    throw new BadRequestException('Pick a valid day');
  }
  return s;
}

@Injectable()
export class CalendarNotesService {
  constructor(@InjectRepository(CalendarNote) private repo: Repository<CalendarNote>) {}

  private view(n: CalendarNote) {
    return { id: n.id, noteDate: n.noteDate, title: n.title, body: n.body ?? '', createdAt: n.createdAt };
  }

  async list(user: User) {
    const rows = await this.repo.find({ where: { owner: { id: user.id } }, order: { noteDate: 'ASC', createdAt: 'ASC' } });
    return rows.map((n) => this.view(n));
  }

  async add(user: User, dto: NoteDto) {
    const title = (dto.title ?? '').trim();
    if (!title) throw new BadRequestException('Write a title for your note');
    if (title.length > 200) throw new BadRequestException('Title is too long');
    const body = (dto.body ?? '').trim().slice(0, 4000) || null;
    const n = await this.repo.save(this.repo.create({ owner: { id: user.id } as User, noteDate: cleanDate(dto.noteDate), title, body }));
    return this.view(n);
  }

  private async mine(user: User, id: string) {
    const n = await this.repo.findOne({ where: { id, owner: { id: user.id } } });
    if (!n) throw new NotFoundException('Note not found');
    return n;
  }

  async update(user: User, id: string, dto: NoteDto) {
    const n = await this.mine(user, id);
    if (dto.title !== undefined) {
      const t = dto.title.trim();
      if (!t) throw new BadRequestException('Write a title for your note');
      n.title = t.slice(0, 200);
    }
    if (dto.body !== undefined) n.body = dto.body.trim().slice(0, 4000) || null;
    if (dto.noteDate !== undefined) n.noteDate = cleanDate(dto.noteDate);
    return this.view(await this.repo.save(n));
  }

  async remove(user: User, id: string) {
    const n = await this.mine(user, id);
    await this.repo.remove(n);
    return { ok: true };
  }
}
