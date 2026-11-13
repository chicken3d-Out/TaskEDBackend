import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { TravelAuthority } from './travel-authority.entity';
import { TravelAttachment } from './travel-attachment.entity';
import { TravelSignatory } from './travel-signatory.entity';
import { StorageModule } from '../storage/storage.module';
import { TravelAuthorityService } from './travel-authority.service';
import { TravelAuthorityController } from './travel-authority.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TravelAuthority, TravelSignatory, TravelAttachment, User]), NotificationsModule, StorageModule],
  controllers: [TravelAuthorityController],
  providers: [TravelAuthorityService],
})
export class TravelAuthorityModule {}
