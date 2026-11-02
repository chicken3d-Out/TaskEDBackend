import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { CalendarService, UpsertCalendarEventDto } from './calendar.service';
import { IcalSyncService } from './ical-sync.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('calendar')
export class CalendarController {
  constructor(
    private calendarService: CalendarService,
    private ical: IcalSyncService,
  ) {}

  @Get()
  findAll() {
    return this.calendarService.findAll();
  }

  // Private to the signed-in person: events read from their own Google Calendar.
  @Get('personal')
  personal(@CurrentUser() user: User) {
    return this.ical.personalEvents(user.id);
  }

  // Saves the person's private Google Calendar (iCal) link and reads it.
  @Put('ical')
  link(@CurrentUser() user: User, @Body() body: { url?: string }) {
    return this.ical.link(user, body?.url ?? '');
  }

  @Delete('ical')
  unlink(@CurrentUser() user: User) {
    return this.ical.unlink(user);
  }

  // Reads the person's Google Calendar again (rate-limited unless forced).
  @Post('ical/sync')
  sync(@CurrentUser() user: User, @Body() body: { force?: boolean }) {
    return this.ical.sync(user, !!body?.force);
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
