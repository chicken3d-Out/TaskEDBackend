import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { CalendarService, UpsertCalendarEventDto } from './calendar.service';
import { GoogleCalendarSyncService } from '../google/google-calendar-sync.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('calendar')
export class CalendarController {
  constructor(
    private calendarService: CalendarService,
    private googleSync: GoogleCalendarSyncService,
  ) {}

  @Get()
  findAll() {
    return this.calendarService.findAll();
  }

  // Private to the signed-in person: events read from their own Google Calendar.
  @Get('personal')
  personal(@CurrentUser() user: User) {
    return this.googleSync.personalEvents(user.id);
  }

  // Refreshes both directions for the signed-in person (rate-limited).
  @Post('google/sync')
  async sync(@CurrentUser() user: User, @Body() body: { force?: boolean }) {
    const result = await this.googleSync.syncUser(user, !!body?.force);
    return { ...result, events: await this.googleSync.personalEvents(user.id) };
  }

  @Get('announcements')
  findAnnouncements() {
    return this.calendarService.findAnnouncements();
  }

  @Post()
  create(@CurrentUser() user: User, @Body() dto: UpsertCalendarEventDto) {
    return this.calendarService.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: Partial<UpsertCalendarEventDto>,
  ) {
    return this.calendarService.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.calendarService.remove(user, id);
  }
}
