import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { BugReportsService } from './bug-reports.service';

@Controller('bug-reports')
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class BugReportsController {
  constructor(private service: BugReportsService) {}
  // every signed-in, approved user can report
  @Post() create(@CurrentUser() u: User, @Body() b: any) { return this.service.create(u, b ?? {}); }
  @Get() @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) list() { return this.service.list(); }
  @Get('open-count') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) openCount() { return this.service.openCount(); }
  @Post(':id/status') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) setStatus(@Param('id') id: string, @Body() b: any) { return this.service.setStatus(id, b ?? {}); }
  @Delete(':id') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) remove(@Param('id') id: string) { return this.service.remove(id); }
}
