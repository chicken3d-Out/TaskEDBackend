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

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @Get()
  findAll() {
    return this.calendarService.findAll();
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
