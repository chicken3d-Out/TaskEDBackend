import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { TravelAuthorityService } from './travel-authority.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('travel-authority')
export class TravelAuthorityController {
  constructor(private service: TravelAuthorityService) {}

  @Get() mine(@CurrentUser() u: User) { return this.service.mine(u); }
  @Get('inbox') inbox(@CurrentUser() u: User) { return this.service.inbox(u); }

  @Get('route')
  route(@CurrentUser() u: User, @Query('outside') outside: string, @Query('requesterId') requesterId?: string) {
    return this.service.routeFor(u, outside === 'true', requesterId);
  }

  @Get('signature') getSignature(@CurrentUser() u: User) { return this.service.getSignature(u); }
  @Put('signature') setSignature(@CurrentUser() u: User, @Body() b: { signature?: string | null }) { return this.service.setSignature(u, b?.signature ?? null); }

  @Get('settings') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) settings() { return this.service.getSettings(); }
  @Put('settings') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) saveSettings(@Body() b: any) { return this.service.setSettings(b ?? {}); }

  @Post('upload-signature') uploadSignature(@CurrentUser() u: User) { return this.service.signUpload(u); }

  @Get('numbering') @UseGuards(RolesGuard) @Roles(Role.DS_SECRETARY, Role.ADMINISTRATOR) numbering() { return this.service.numbering(); }
  @Put(':id/number') @UseGuards(RolesGuard) @Roles(Role.DS_SECRETARY, Role.ADMINISTRATOR) setNumber(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.setNumber(u, id, b ?? {}); }

  @Post() create(@CurrentUser() u: User, @Body() b: any) { return this.service.create(u, b ?? {}); }
  @Get(':id') get(@CurrentUser() u: User, @Param('id') id: string) { return this.service.get(u, id); }
  @Patch(':id') update(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.update(u, id, b ?? {}); }
  @Post(':id/send') send(@CurrentUser() u: User, @Param('id') id: string) { return this.service.sendToRequester(u, id); }
  @Post(':id/sign') sign(@CurrentUser() u: User, @Param('id') id: string, @Body() b: { x?: number; y?: number }) { return this.service.sign(u, id, b ?? {}); }
  @Post(':id/attachments') addAttachment(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.addAttachment(u, id, b ?? {}); }
  @Get(':id/attachments/:aid') getAttachment(@CurrentUser() u: User, @Param('id') id: string, @Param('aid') aid: string) { return this.service.getAttachment(u, id, aid); }
  @Delete(':id/attachments/:aid') removeAttachment(@CurrentUser() u: User, @Param('id') id: string, @Param('aid') aid: string) { return this.service.removeAttachment(u, id, aid); }
  @Post(':id/emailed') emailed(@CurrentUser() u: User, @Param('id') id: string) { return this.service.markEmailed(u, id); }
  @Patch(':id/drive') drive(@CurrentUser() u: User, @Param('id') id: string, @Body() b: { link?: string; rev?: number }) { return this.service.setDrive(u, id, b ?? {}); }
  @Delete(':id') remove(@CurrentUser() u: User, @Param('id') id: string) { return this.service.remove(u, id); }
}
