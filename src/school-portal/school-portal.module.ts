import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { School } from '../schools/school.entity';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { SchoolDocumentType } from './school-document-type.entity';
import { SchoolFile } from './school-file.entity';
import { SchoolPortalService } from './school-portal.service';
import { SchoolPortalController } from './school-portal.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, School, SchoolDocumentType, SchoolFile]),
    UsersModule,
    NotificationsModule,
    StorageModule,
  ],
  controllers: [SchoolPortalController],
  providers: [SchoolPortalService],
  exports: [SchoolPortalService],
})
export class SchoolPortalModule {}
