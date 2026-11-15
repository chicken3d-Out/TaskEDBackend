import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BugReport } from './bug-report.entity';
import { User } from '../users/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { BugReportsController } from './bug-reports.controller';
import { BugReportsService } from './bug-reports.service';

@Module({ imports: [TypeOrmModule.forFeature([BugReport, User]), NotificationsModule], controllers: [BugReportsController], providers: [BugReportsService] })
export class BugReportsModule {}
