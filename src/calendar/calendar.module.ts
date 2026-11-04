import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarEvent } from './calendar-event.entity';
import { PersonalEvent } from './personal-event.entity';
import { IcalSyncService } from './ical-sync.service';
import { HolidaysService } from './holidays.service';
import { User } from '../users/user.entity';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([CalendarEvent, PersonalEvent, User]), NotificationsModule],
  controllers: [CalendarController],
  providers: [CalendarService, IcalSyncService, HolidaysService],
  exports: [CalendarService, IcalSyncService],
})
export class CalendarModule {}
