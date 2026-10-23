import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { CreateTicketDto, PostUpdateDto, TicketsService } from './tickets.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateTicketDto) {
    return this.ticketsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.ticketsService.findAllFor(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ticketsService.findOneFor(user, id);
  }

  @Post(':id/updates')
  postUpdate(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: PostUpdateDto,
  ) {
    return this.ticketsService.postUpdate(user, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/attachments')
  addAttachment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { fileUrl: string; fileName?: string },
  ) {
    return this.ticketsService.addAttachment(user, id, body.fileUrl, body.fileName);
  }
}
