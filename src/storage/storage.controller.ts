import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ALLOWED_UPLOAD_TYPES, StorageService } from './storage.service';

const MAX_FILENAME_LENGTH = 200;

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('uploads')
export class StorageController {
  constructor(private storageService: StorageService) {}

  // Step 1 of the upload flow: ask for a presigned PUT URL, then the
  // browser uploads the file bytes directly to MinIO (not through this
  // API), then the frontend calls the existing ticket/update endpoints
  // with the returned fileUrl. Keeps large file bodies off this server.
  //
  // Only JPG and PDF are accepted - enforced here (fileName extension)
  // AND at the storage layer (the contentType is signed into the
  // presigned URL itself, see StorageService).
  @Post('presign')
  async presign(
    @CurrentUser() user: User,
    @Body() body: { fileName: string; contentType: string },
  ) {
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

    return this.storageService.createPresignedUpload(user.id, body.fileName, body.contentType);
  }
}
