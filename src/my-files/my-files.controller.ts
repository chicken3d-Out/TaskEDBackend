import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { MAX_UPLOAD_BYTES, pipeToClient } from '../common/file-types';
import { MyFilesService } from './my-files.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('my-files')
export class MyFilesController {
  constructor(private service: MyFilesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.service.list(user);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { label?: string; category?: string },
  ) {
    return this.service.upload(user, file, body?.label, body?.category);
  }

  @Patch(':id')
  rename(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { label: string; category?: string }) {
    return this.service.rename(user, id, body?.label, body?.category);
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  @Get(':id/download')
  async download(@CurrentUser() user: User, @Param('id') id: string, @Res() res: Response) {
    const { res: source, name, mime } = await this.service.download(user, id);
    pipeToClient(res, source, name, mime);
  }
}
