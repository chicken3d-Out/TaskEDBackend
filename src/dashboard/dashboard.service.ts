import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { User } from '../users/user.entity';
import { School } from '../schools/school.entity';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { ForumQuestion, ForumQuestionStatus } from '../forum/forum-question.entity';
import { SchoolDocumentType } from '../school-portal/school-document-type.entity';
import { SchoolFile } from '../school-portal/school-file.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Ticket) private ticketsRepo: Repository<Ticket>,
    @InjectRepository(CalendarEvent) private eventsRepo: Repository<CalendarEvent>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(School) private schoolsRepo: Repository<School>,
    @InjectRepository(ForumQuestion) private questionsRepo: Repository<ForumQuestion>,
    @InjectRepository(SchoolDocumentType) private typesRepo: Repository<SchoolDocumentType>,
    @InjectRepository(SchoolFile) private filesRepo: Repository<SchoolFile>,
  ) {}

  // Same visibility rules as TicketsService.findAllFor, kept here so the
  // dashboard needs a single request.
  private async visibleTickets(user: User): Promise<Ticket[] | null> {
    if (user.role === Role.ADMINISTRATOR) {
      return this.ticketsRepo.find({ order: { createdAt: 'DESC' } });
    }
    if (user.role === Role.TEACHER) {
      if (!user.school) return [];
      return this.ticketsRepo.find({
        where: { school: { id: user.school.id } },
        order: { createdAt: 'DESC' },
      });
    }
    if (user.role === Role.ADMIN_OFFICER) {
      return this.ticketsRepo.find({
        where: { assignedAo: { id: user.id } },
        order: { createdAt: 'DESC' },
      });
    }
    return null; // Publisher and School accounts are not part of tasking
  }

  async summaryFor(user: User) {
    const tickets = await this.visibleTickets(user);

    let ticketSummary: null | {
      total: number;
      open: number;
      mine: number;
      byStatus: Record<string, number>;
      recent: { id: string; title: string; status: string; createdAt: Date; requesterName: string }[];
    } = null;

    if (tickets) {
      const byStatus: Record<string, number> = {};
      for (const t of tickets) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      ticketSummary = {
        total: tickets.length,
        open: tickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed').length,
        mine: tickets.filter((t) => t.requester?.id === user.id).length,
        byStatus,
        recent: tickets.slice(0, 5).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
          requesterName: t.requester?.name ?? '',
        })),
      };
    }

    const upcoming = await this.eventsRepo.find({
      where: { eventDate: MoreThanOrEqual(new Date()) },
      order: { eventDate: 'ASC' },
      take: 5,
    });

    let admin: null | {
      pendingUsers: number;
      totalUsers: number;
      schools: number;
      pendingQuestions: number;
      byRole: Record<string, number>;
    } = null;
    if (user.role === Role.ADMINISTRATOR) {
      const users = await this.usersRepo.find();
      const byRole: Record<string, number> = {};
      for (const u of users) {
        const key = u.role ?? 'unassigned';
        byRole[key] = (byRole[key] ?? 0) + 1;
      }
      admin = {
        pendingUsers: users.filter(
          (u) => u.status === AccountStatus.PENDING && u.registrationComplete,
        ).length,
        totalUsers: users.length,
        schools: await this.schoolsRepo.count(),
        pendingQuestions: await this.questionsRepo.count({
          where: { status: ForumQuestionStatus.PENDING },
        }),
        byRole,
      };
    }

    // School account / AO: personnel counts and document progress per school.
    let schoolsInfo: null | {
      id: string;
      name: string;
      teachers: number;
      pendingTeachers: number;
      documentsUploaded: number;
      documentsTotal: number;
    }[] = null;
    if (user.role === Role.SCHOOL || user.role === Role.ADMIN_OFFICER) {
      const mine = user.role === Role.SCHOOL ? (user.school ? [user.school] : []) : (user.assignedSchools ?? []);
      const types = await this.typesRepo.find({ where: { active: true } });
      schoolsInfo = [];
      for (const s of mine) {
        const atSchool = await this.usersRepo.find({ where: { school: { id: s.id } } });
        const files = await this.filesRepo.find({ where: { school: { id: s.id } } });
        const done = new Set(files.filter((f) => types.some((t) => t.id === f.documentType.id)).map((f) => f.documentType.id));
        schoolsInfo.push({
          id: s.id,
          name: s.name,
          teachers: atSchool.filter((u) => u.role === Role.TEACHER && u.status === AccountStatus.APPROVED).length,
          pendingTeachers: atSchool.filter(
            (u) => !u.role && u.status === AccountStatus.PENDING && u.registrationComplete,
          ).length,
          documentsUploaded: done.size,
          documentsTotal: types.length,
        });
      }
    }

    return {
      tickets: ticketSummary,
      upcomingEvents: upcoming.map((e) => ({
        id: e.id,
        title: e.title,
        eventDate: e.eventDate,
        isAnnouncement: e.isAnnouncement,
        zoomLink: e.zoomLink,
      })),
      admin,
      schools: schoolsInfo,
    };
  }
}
