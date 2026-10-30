import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountStatus, Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { SchoolPortalService, SchoolProfileDto, TeacherDto } from './school-portal.service';

// School accounts, AOs (for their schools) and Administrators.
@UseGuards(JwtAuthGuard, ApprovedGuard, RolesGuard)
@Roles(Role.SCHOOL, Role.ADMIN_OFFICER, Role.ADMINISTRATOR)
@Controller('school-portal')
export class SchoolPortalController {
  constructor(private portal: SchoolPortalService) {}

  @Get('schools/mine')
  mine(@CurrentUser() user: User) {
    return this.portal.mySchools(user);
  }

  @Get('schools')
  summary(@CurrentUser() user: User) {
    return this.portal.schoolsSummary(user);
  }

  @Get('schools/:id')
  overview(@CurrentUser() user: User, @Param('id') id: string) {
    return this.portal.overview(user, id);
  }

  @Patch('schools/:id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: SchoolProfileDto) {
    return this.portal.updateSchool(user, id, dto);
  }

  // ---- teachers ----
  @Get('schools/:id/teachers')
  teachers(@CurrentUser() user: User, @Param('id') id: string) {
    return this.portal.listTeachers(user, id);
  }

  @Post('schools/:id/teachers')
  addTeacher(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: TeacherDto) {
    return this.portal.addTeacher(user, id, dto);
  }

  @Patch('schools/:id/teachers/:userId')
  updateTeacher(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: TeacherDto,
  ) {
    return this.portal.updateTeacher(user, id, userId, dto);
  }

  @Post('schools/:id/teachers/:userId/status')
  teacherStatus(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { status: AccountStatus },
  ) {
    return this.portal.setTeacherStatus(user, id, userId, body.status);
  }

  @Post('schools/:id/teachers/:userId/approve')
  approveTeacher(@CurrentUser() user: User, @Param('id') id: string, @Param('userId') userId: string) {
    return this.portal.approveTeacher(user, id, userId);
  }

  @Post('schools/:id/teachers/:userId/reject')
  rejectTeacher(@CurrentUser() user: User, @Param('id') id: string, @Param('userId') userId: string) {
    return this.portal.rejectTeacher(user, id, userId);
  }

  // ---- document types ----
  @Get('document-types')
  types(@CurrentUser() user: User) {
    return this.portal.listTypes(user, true);
  }

  @Post('document-types')
  createType(
    @CurrentUser() user: User,
    @Body() dto: { name: string; description?: string; required?: boolean },
  ) {
    return this.portal.createType(user, dto);
  }

  @Patch('document-types/:id')
  updateType(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string; required?: boolean; active?: boolean },
  ) {
    return this.portal.updateType(user, id, dto);
  }

  @Delete('document-types/:id')
  deleteType(@CurrentUser() user: User, @Param('id') id: string) {
    return this.portal.deleteType(user, id);
  }

  // ---- school files ----
  @Get('schools/:id/files')
  files(@CurrentUser() user: User, @Param('id') id: string) {
    return this.portal.listFiles(user, id);
  }

  @Post('schools/:id/files/sign')
  sign(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { fileName: string; kind: string },
  ) {
    return this.portal.signUpload(user, id, body.fileName, body.kind);
  }

  @Post('schools/:id/files')
  saveFile(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { documentTypeId: string; kind: string; fileName: string; fileUrl: string },
  ) {
    return this.portal.saveFile(user, id, body);
  }

  @Delete('schools/:id/files/:fileId')
  deleteFile(@CurrentUser() user: User, @Param('id') id: string, @Param('fileId') fileId: string) {
    return this.portal.deleteFile(user, id, fileId);
  }
}
