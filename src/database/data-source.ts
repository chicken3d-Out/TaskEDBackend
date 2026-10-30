import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { School } from '../schools/school.entity';
import { Ticket } from '../tickets/ticket.entity';
import { TicketUpdate } from '../tickets/ticket-update.entity';
import { TicketAttachment } from '../tickets/ticket-attachment.entity';
import { Notification } from '../notifications/notification.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { ForumQuestion } from '../forum/forum-question.entity';
import { ForumReply } from '../forum/forum-reply.entity';
import { ForumVote } from '../forum/forum-vote.entity';
import { SchoolDocumentType } from '../school-portal/school-document-type.entity';
import { SchoolFile } from '../school-portal/school-file.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'tasked',
  password: process.env.DB_PASSWORD || 'change_me',
  database: process.env.DB_DATABASE || 'tasked',
  // Set DB_SSL=true when connecting to Render's External database URL.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [
    User,
    School,
    Ticket,
    TicketUpdate,
    TicketAttachment,
    Notification,
    CalendarEvent,
    ForumQuestion,
    ForumReply,
    ForumVote,
    SchoolDocumentType,
    SchoolFile,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
