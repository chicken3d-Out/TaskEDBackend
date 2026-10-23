import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { School } from '../schools/school.entity';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { TicketUpdate } from './ticket-update.entity';
import { TicketAttachment } from './ticket-attachment.entity';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'assigned_ao_id' })
  assignedAo: User;

  @ManyToOne(() => School, { eager: true })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.SUBMITTED,
  })
  status: TicketStatus;

  @OneToMany(() => TicketUpdate, (update) => update.ticket)
  updates: TicketUpdate[];

  @OneToMany(() => TicketAttachment, (attachment) => attachment.ticket)
  attachments: TicketAttachment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
