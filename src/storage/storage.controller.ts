import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SkipApprovalCheck } from '../common/decorators/skip-approval-check.decorator';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ALLOWED_UPLOAD_TYPES, StorageService } from './storage.service';

const MAX_FILENAME_LENGTH = 200;

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('uploads')
export class StorageController {
  constructor(private storageService: StorageService) {}

  // Ticket attachments / update images (JPG or PDF only).
  @Post('sign')
  signAttachment(@CurrentUser() user: User, @Body() body: { fileName: string; contentType: string }) {
    if (!body.fileName || body.fileName.length > MAX_FILENAME_LENGTH) {
      throw new BadRequestException('A valid fileName is required');
    }
    const allowedExtensions = ALLOWED_UPLOAD_TYPES[body.contentType];
    if (!allowedExtensions) {
      throw new BadRequestException('Only JPG images and PDF files are accepted');
    }
    const lowerName = body.fileName.toLowerCase();
    if (!allowedExtensions.some((ext) => lowerName.endsWith(ext))) {
      throw new BadRequestException(
        `File extension doesn't match ${body.contentType} (expected ${allowedExtensions.join(' or ')})`,
      );
    }
    return this.storageService.signUpload(user.id, 'attachment');
  }

  // Profile picture: allowed before approval (it is part of the registration
  // form), JPG only. The browser resizes it to a small square first.
  @SkipApprovalCheck()
  @Post('sign-avatar')
  signAvatar(@CurrentUser() user: User) {
    return this.storageService.signUpload(user.id, 'avatar');
  }
}
