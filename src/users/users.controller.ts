import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipApprovalCheck } from '../common/decorators/skip-approval-check.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { CompleteRegistrationDto, UsersService } from './users.service';
import { User } from './user.entity';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // Pending/rejected users still need to see their own status, so this
  // route is exempt from the approval gate.
  @SkipApprovalCheck()
  @Get('me')
  me(@CurrentUser() user: User) {
    return user;
  }

  @SkipApprovalCheck()
  @Post('register')
  register(@CurrentUser() user: User, @Body() dto: CompleteRegistrationDto) {
    return this.usersService.completeRegistration(user.id, dto);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: User,
    @Body() body: { name?: string; district?: string; designation?: string; schoolId?: string },
  ) {
    return this.usersService.updateProfile(user.id, body);
  }

  // Called by the Ionic/Capacitor app after it registers for FCM push -
  // never called from the web build (there's no equivalent there).
  @Post('me/push-token')
  savePushToken(@CurrentUser() user: User, @Body() body: { token: string }) {
    return this.usersService.savePushToken(user.id, body.token);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRATOR, Role.ADMIN_OFFICER)
  @Get('pending-approvals')
  pendingApprovals(@CurrentUser() user: User) {
    return this.usersService.findPendingApprovalsFor(user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRATOR, Role.ADMIN_OFFICER)
  @Post(':id/approve')
  approve(@CurrentUser() approver: User, @Param('id') id: string) {
    return this.usersService.approve(approver, id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRATOR, Role.ADMIN_OFFICER)
  @Post(':id/reject')
  reject(@CurrentUser() approver: User, @Param('id') id: string) {
    return this.usersService.reject(approver, id);
  }
}
