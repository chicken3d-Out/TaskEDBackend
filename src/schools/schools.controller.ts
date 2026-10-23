import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { SchoolsService } from './schools.service';

@Controller('schools')
export class SchoolsController {
  constructor(private schoolsService: SchoolsService) {}

  // Public-ish within the app: the registration form needs the school list
  // before the account is approved, so this only requires a valid JWT,
  // not @UseGuards(ApprovedGuard).
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.schoolsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMINISTRATOR)
  @Post()
  create(@Body() body: { name: string; district: string }) {
    return this.schoolsService.create(body.name, body.district);
  }
}
