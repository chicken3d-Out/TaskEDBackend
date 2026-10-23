import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SchoolsModule } from './schools/schools.module';
import { TicketsModule } from './tickets/tickets.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CalendarModule } from './calendar/calendar.module';
import { ForumModule } from './forum/forum.module';
import { WeatherModule } from './weather/weather.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { StorageModule } from './storage/storage.module';
import { User } from './users/user.entity';
import { School } from './schools/school.entity';
import { Ticket } from './tickets/ticket.entity';
import { TicketUpdate } from './tickets/ticket-update.entity';
import { TicketAttachment } from './tickets/ticket-attachment.entity';
import { Notification } from './notifications/notification.entity';
import { CalendarEvent } from './calendar/calendar-event.entity';
import { ForumQuestion } from './forum/forum-question.entity';
import { ForumReply } from './forum/forum-reply.entity';
import { ForumVote } from './forum/forum-vote.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: parseInt(config.get('DB_PORT', '5432'), 10),
        username: config.get('DB_USERNAME', 'tasked'),
        password: config.get('DB_PASSWORD', 'change_me'),
        database: config.get('DB_DATABASE', 'tasked'),
        ssl: config.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
        entities: [
          User,
          School,
          Ticket,
          TicketUpdate,
          TicketAttachment,
          Notification,
          CalendarEvent,
          ForumQuestion,
          ForumReply,
          ForumVote,
        ],
        // Fine for local dev; switch to migrations (npm run migration:run)
        // before this ever touches a real deployment.
        synchronize: config.get('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    UsersModule,
    SchoolsModule,
    TicketsModule,
    NotificationsModule,
    CalendarModule,
    ForumModule,
    WeatherModule,
    ChatbotModule,
    StorageModule,
  ],
})
export class AppModule {}
