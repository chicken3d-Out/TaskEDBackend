import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  summary(@CurrentUser() user: User) {
    return this.dashboardService.summaryFor(user);
  }
}
