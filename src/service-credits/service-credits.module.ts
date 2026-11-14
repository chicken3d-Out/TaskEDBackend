import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { LeaveCredit, LeaveCreditLog, LeaveCreditRequest } from './service-credit.entities';
import { ServiceCreditsService } from './service-credits.service';
import { LeaveApplication } from './leave-application.entity';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { TravelSignatory } from '../travel-authority/travel-signatory.entity';
import { ServiceCreditsController } from './service-credits.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveCredit, LeaveCreditLog, LeaveCreditRequest, LeaveApplication, TravelSignatory, User]), NotificationsModule, StorageModule],
  controllers: [ServiceCreditsController, LeaveController],
  providers: [ServiceCreditsService, LeaveService],
  exports: [ServiceCreditsService],
})
export class ServiceCreditsModule {}
