import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { TeacherFilesService } from './teacher-files.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('teacher-files')
export class TeacherFilesController {
  constructor(private svc: TeacherFilesService) {}

  @Get('teacher/:teacherId')
  list(@CurrentUser() user: User, @Param('teacherId') teacherId: string) {
    return this.svc.list(user, teacherId);
  }

  @Post('teacher/:teacherId')
  add(@CurrentUser() user: User, @Param('teacherId') teacherId: string, @Body() body: { section?: string; label?: string; link?: string }) {
    return this.svc.add(user, teacherId, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }
}
