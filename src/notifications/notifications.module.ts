import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { User } from '../users/user.entity';
import { PresenceController } from './presence.controller';
import { PushModule } from '../push/push.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User]), PushModule],
  controllers: [NotificationsController, PresenceController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
