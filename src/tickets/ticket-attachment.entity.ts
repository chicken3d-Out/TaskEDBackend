import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';
import { User } from '../users/user.entity';

@Entity('ticket_attachments')
export class TicketAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ticket, (ticket) => ticket.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy: User;

  // The upload itself happens client-side to storage (see README); this
  // just records the resulting URL against the ticket.
  @Column({ name: 'file_url' })
  fileUrl: string;

  @Column({ name: 'file_name', type: 'varchar', nullable: true })
  fileName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
