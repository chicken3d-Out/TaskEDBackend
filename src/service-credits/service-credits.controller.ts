import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { ServiceCreditsService } from './service-credits.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('service-credits')
export class ServiceCreditsController {
  constructor(private service: ServiceCreditsService) {}

  @Get('me') mine(@CurrentUser() u: User) { return this.service.overview(u, u.id); }
  @Get('staff') staff(@CurrentUser() u: User) { return this.service.staff(u); }
  @Post('upload-signature') upload(@CurrentUser() u: User) { return this.service.uploadSignature(u); }

  @Get('requests') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) requests(@CurrentUser() u: User) { return this.service.pendingRequests(u); }
  @Post('requests/:id/decision') @UseGuards(RolesGuard) @Roles(Role.ADMINISTRATOR) decide(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.decide(u, id, b ?? {}); }

  @Get('user/:id') user(@CurrentUser() u: User, @Param('id') id: string) { return this.service.overview(u, id); }
  @Post('user/:id/initial') initial(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.setInitial(u, id, b ?? {}); }
  @Post('user/:id/edit-request') edit(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.requestEdit(u, id, b ?? {}); }
  @Post('user/:id/special-order') so(@CurrentUser() u: User, @Param('id') id: string, @Body() b: any) { return this.service.addSpecialOrder(u, id, b ?? {}); }
}
