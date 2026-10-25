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
import { AssignRoleDto, CompleteRegistrationDto, UpdateProfileDto, UsersService } from './users.service';
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

  @SkipApprovalCheck()
  @Patch('me')
  updateProfile(@CurrentUser() user: User, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, body);
  }

  // Called by the Ionic/Capacitor app after it registers for FCM push -
  // never called from the web build (there's no equivalent there).
  @Post('me/push-token')
  savePushToken(@CurrentUser() user: User, @Body() body: { token: string }) {
    return this.usersService.savePushToken(user.id, body.token);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Get('pending-approvals')
  pendingApprovals(@CurrentUser() user: User) {
    return this.usersService.findPendingApprovalsFor(user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Get()
  findAll(@CurrentUser() user: User) {
    return this.usersService.findAllUsers(user);
  }

  // Assign (or change) a role; also approves the account.
  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Post(':id/assign-role')
  assignRole(@CurrentUser() admin: User, @Param('id') id: string, @Body() dto: AssignRoleDto) {
    return this.usersService.assignRole(admin, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Post(':id/reject')
  reject(@CurrentUser() admin: User, @Param('id') id: string) {
    return this.usersService.reject(admin, id);
  }
}
