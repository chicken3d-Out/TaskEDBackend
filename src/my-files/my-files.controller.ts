import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { MyFilesService } from './my-files.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('my-files')
export class MyFilesController {
  constructor(private service: MyFilesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.service.list(user);
  }

  // Public client id of TaskEd's Google sign-in app; the browser needs it to
  // ask for permission to save files into the person's own Drive.
  @Get('drive-config')
  driveConfig() {
    return { clientId: process.env.GOOGLE_CLIENT_ID ?? '' };
  }

  @Post()
  add(@CurrentUser() user: User, @Body() body: { label?: string; category?: string; link?: string; schoolYear?: string }) {
    return this.service.add(user, body ?? {});
  }

  @Patch(':id')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { label?: string; category?: string; link?: string; schoolYear?: string }) {
    return this.service.update(user, id, body ?? {});
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
