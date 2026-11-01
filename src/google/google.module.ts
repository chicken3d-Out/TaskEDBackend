import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { GoogleService } from './google.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { GoogleEventLink } from './google-event-link.entity';
import { PersonalEvent } from './personal-event.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User, CalendarEvent, GoogleEventLink, PersonalEvent])],
  providers: [GoogleService, GoogleCalendarSyncService],
  exports: [GoogleService, GoogleCalendarSyncService],
})
export class GoogleModule {}
