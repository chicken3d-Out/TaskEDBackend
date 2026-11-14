import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { LeaveService, LEAVE_TYPES } from './leave.service';

@Controller('leave')
@UseGuards(JwtAuthGuard, ApprovedGuard)
export class LeaveController {
  constructor(private service: LeaveService) {}
  @Get('types') types() { return LEAVE_TYPES; }
  @Get() list(@CurrentUser() u: User) { return this.service.list(u); }
  @Get('settings') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) settings() { return this.service.getSettings(); }
  @Put('settings') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) setSettings(@Body() b: { hrmo?: string; asds?: string }) { return this.service.setSettings(b); }
  @Post() create(@CurrentUser() u: User, @Body() b: any) { return this.service.create(u, b); }
  @Get(':id') get(@CurrentUser() u: User, @Param('id') id: string) { return this.service.get(u, id); }
  @Put(':id') update(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.update(u, id, b); }
  @Delete(':id') remove(@CurrentUser() u: User, @Param('id') id: string) { return this.service.remove(u, id); }
  @Post(':id/sign') sign(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.sign(u, id, b); }
  @Post(':id/disapprove') disapprove(@CurrentUser() u: User, @Param('id') id: string, @Body() b: { reason?: string }) { return this.service.disapprove(u, id, b?.reason ?? ''); }
  @Post(':id/send') send(@CurrentUser() u: User, @Param('id') id: string) { return this.service.send(u, id); }
}
