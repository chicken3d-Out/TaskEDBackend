import { ForumQuestion } from '../forum/forum-question.entity';
import { SchoolDocumentType } from '../school-portal/school-document-type.entity';
import { SchoolFile } from '../school-portal/school-file.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { User } from '../users/user.entity';
import { School } from '../schools/school.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([ForumQuestion, SchoolDocumentType, SchoolFile, Ticket, CalendarEvent, User, School])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
