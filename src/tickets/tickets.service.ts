import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './ticket.entity';
import { TicketUpdate } from './ticket-update.entity';
import { TicketAttachment } from './ticket-attachment.entity';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { TicketStatus, VALID_TRANSITIONS } from '../common/enums/ticket-status.enum';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { NotificationType } from '../notifications/notification.entity';

export interface CreateTicketDto {
  title: string;
  description: string;
}

export interface PostUpdateDto {
  message: string;
  imageUrl?: string;
  attachmentRequest?: boolean; // AO-only
  newStatus?: TicketStatus; // AO-only
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private ticketsRepo: Repository<Ticket>,
    @InjectRepository(TicketUpdate) private updatesRepo: Repository<TicketUpdate>,
    @InjectRepository(TicketAttachment) private attachmentsRepo: Repository<TicketAttachment>,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
    private realtimeGateway: NotificationsGateway,
  ) {}

  async create(teacher: User, dto: CreateTicketDto): Promise<Ticket> {
    if (teacher.role !== Role.TEACHER) {
      throw new ForbiddenException('Only teachers can file tasks');
    }
    if (!teacher.school) {
      throw new BadRequestException('Your account has no school on file');
    }

    // Exactly one AO per school is enforced at registration, so this is
    // always 0 or 1 results - no disambiguation needed.
    const aos = await this.usersService.findAOsForSchool(teacher.school.id);
    if (aos.length === 0) {
      throw new BadRequestException(
        'No Administrative Officer is assigned to your school yet - contact your division office',
      );
    }
    const assignedAo = aos[0];

    const ticket = this.ticketsRepo.create({
      requester: teacher,
      assignedAo,
      school: teacher.school,
      title: dto.title,
      description: dto.description,
      status: TicketStatus.SUBMITTED,
    });
    const saved = await this.ticketsRepo.save(ticket);

    await this.notificationsService.create(
      assignedAo,
      NotificationType.TICKET_UPDATE,
      `New task from ${teacher.name}: "${dto.title}"`,
      saved.id,
    );
    this.realtimeGateway.broadcast('tickets:changed', { ticketId: saved.id });

    return saved;
  }

  // Role-aware listing:
  // - Teacher: own tickets + all tickets from their school (read-only transparency)
  // - AO: only tickets assigned to them
  // - Administrator: everything (oversight)
  // - Admin Office (public-post) account: not part of ticketing
  async findAllFor(user: User): Promise<Ticket[]> {
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
    throw new ForbiddenException('Your role does not have access to tasks');
  }

  async findOneFor(user: User, ticketId: string): Promise<Ticket> {
    const ticket = await this.ticketsRepo.findOne({
      where: { id: ticketId },
      relations: ['updates', 'updates.author', 'attachments', 'attachments.uploadedBy'],
    });
    if (!ticket) throw new NotFoundException('Task not found');
    this.assertCanView(user, ticket);
    return ticket;
  }

  private assertCanView(user: User, ticket: Ticket) {
    if (user.role === Role.ADMINISTRATOR) return;
    if (user.role === Role.TEACHER && user.school?.id === ticket.school.id) return;
    if (user.role === Role.ADMIN_OFFICER && user.id === ticket.assignedAo.id) return;
    throw new ForbiddenException('You do not have access to this task');
  }

  // Only the requesting teacher or the assigned AO may act on (not just view) a ticket.
  private assertCanAct(user: User, ticket: Ticket) {
    const isOwner = user.role === Role.TEACHER && user.id === ticket.requester.id;
    const isAssignedAo = user.role === Role.ADMIN_OFFICER && user.id === ticket.assignedAo.id;
    if (!isOwner && !isAssignedAo) {
      throw new ForbiddenException(
        'Only the requesting teacher and the assigned Administrative Officer can act on this ticket',
      );
    }
  }

  async postUpdate(user: User, ticketId: string, dto: PostUpdateDto): Promise<TicketUpdate> {
    const ticket = await this.ticketsRepo.findOne({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Task not found');
    this.assertCanAct(user, ticket);

    const isAssignedAo = user.role === Role.ADMIN_OFFICER && user.id === ticket.assignedAo.id;

    if ((dto.attachmentRequest || dto.newStatus) && !isAssignedAo) {
      throw new ForbiddenException(
        'Only the assigned Administrative Officer can request attachments or change status',
      );
    }

    if (dto.newStatus) {
      const allowed = VALID_TRANSITIONS[ticket.status] ?? [];
      if (!allowed.includes(dto.newStatus)) {
        throw new BadRequestException(
          `Cannot move ticket from ${ticket.status} to ${dto.newStatus}`,
        );
      }
      ticket.status = dto.newStatus;
      await this.ticketsRepo.save(ticket);
    } else if (dto.attachmentRequest) {
      // Requesting an attachment implicitly marks the ticket as such,
      // unless the AO already moved it further along.
      if (ticket.status === TicketStatus.SUBMITTED || ticket.status === TicketStatus.ACKNOWLEDGED) {
        ticket.status = TicketStatus.NEEDS_ATTACHMENT;
        await this.ticketsRepo.save(ticket);
      }
    }

    const update = this.updatesRepo.create({
      ticket,
      author: user,
      message: dto.message,
      imageUrl: dto.imageUrl ?? null,
      attachmentRequest: !!dto.attachmentRequest && isAssignedAo,
    });
    const saved = await this.updatesRepo.save(update);

    // Notify the other party in the conversation.
    const notifyTarget = isAssignedAo ? ticket.requester : ticket.assignedAo;
    const notifType = dto.attachmentRequest
      ? NotificationType.ATTACHMENT_REQUEST
      : dto.newStatus
        ? NotificationType.TICKET_STATUS_CHANGE
        : NotificationType.TICKET_UPDATE;
    const notifMessage = dto.attachmentRequest
      ? `Attachment requested on "${ticket.title}"`
      : dto.newStatus
        ? `"${ticket.title}" status changed to ${dto.newStatus}`
        : `New update on "${ticket.title}"`;

    await this.notificationsService.create(notifyTarget, notifType, notifMessage, ticket.id);
    this.realtimeGateway.broadcast('tickets:changed', { ticketId: ticket.id });

    return saved;
  }

  async addAttachment(
    user: User,
    ticketId: string,
    fileUrl: string,
    fileName?: string,
  ): Promise<TicketAttachment> {
    const ticket = await this.ticketsRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Task not found');

    // Spec: the requesting teacher uploads requested attachments.
    if (user.role !== Role.TEACHER || user.id !== ticket.requester.id) {
      throw new ForbiddenException('Only the requesting teacher can upload attachments here');
    }

    const attachment = this.attachmentsRepo.create({
      ticket,
      uploadedBy: user,
      fileUrl,
      fileName: fileName ?? null,
    });
    const saved = await this.attachmentsRepo.save(attachment);

    await this.notificationsService.create(
      ticket.assignedAo,
      NotificationType.TICKET_UPDATE,
      `${user.name} uploaded an attachment on "${ticket.title}"`,
      ticket.id,
    );
    this.realtimeGateway.broadcast('tickets:changed', { ticketId: ticket.id });

    return saved;
  }
}
