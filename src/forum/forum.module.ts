import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForumQuestion } from './forum-question.entity';
import { ForumReply } from './forum-reply.entity';
import { ForumVote } from './forum-vote.entity';
import { ForumService } from './forum.service';
import { ForumController } from './forum.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([ForumQuestion, ForumReply, ForumVote]), NotificationsModule],
  controllers: [ForumController],
  providers: [ForumService],
  exports: [ForumService],
})
export class ForumModule {}
