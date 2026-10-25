import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { User } from '../users/user.entity';
import { School } from '../schools/school.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, CalendarEvent, User, School])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
