import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { HrProfileService } from './hr-profile.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('hr-profile')
export class HrProfileController {
  constructor(private svc: HrProfileService) {}

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.svc.get(user, user.id);
  }

  @Get(':userId')
  get(@CurrentUser() user: User, @Param('userId') userId: string) {
    return this.svc.get(user, userId);
  }

  @Put(':userId')
  save(@CurrentUser() user: User, @Param('userId') userId: string, @Body() dto: Record<string, any>) {
    return this.svc.save(user, userId, dto);
  }
}
