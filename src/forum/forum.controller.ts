import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { ForumSort, ForumService } from './forum.service';
import { ForumVoteTargetType } from './forum-vote.entity';
import { ForumQuestionStatus } from './forum-question.entity';

// Administrative Officers use the forum; Administrators can read everything
// and moderate (approve / reject / remove). Posting, replying and voting are
// AO-only and enforced again in ForumService.
@UseGuards(JwtAuthGuard, ApprovedGuard, RolesGuard)
@Roles(Role.ADMIN_OFFICER, Role.ADMINISTRATOR)
@Controller('forum')
export class ForumController {
  constructor(private forumService: ForumService) {}

  @Get('questions')
  listQuestions(
    @CurrentUser() user: User,
    @Query('sort') sort?: ForumSort,
    @Query('status') status?: ForumQuestionStatus,
  ) {
    return this.forumService.listQuestions(user, sort, status);
  }

  @Post('questions')
  createQuestion(@CurrentUser() user: User, @Body() body: { title: string; body: string }) {
    return this.forumService.createQuestion(user, body.title, body.body);
  }

  @Get('questions/:id')
  getQuestion(@CurrentUser() user: User, @Param('id') id: string) {
    return this.forumService.getQuestion(user, id);
  }

  @Post('questions/:id/replies')
  createReply(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: { body: string; parentReplyId?: string },
  ) {
    return this.forumService.createReply(user, id, body.body, body.parentReplyId);
  }

  @Post('questions/:id/vote')
  voteQuestion(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { value: 1 | -1 }) {
    return this.forumService.vote(user, ForumVoteTargetType.QUESTION, id, body.value);
  }

  @Post('replies/:id/vote')
  voteReply(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { value: 1 | -1 }) {
    return this.forumService.vote(user, ForumVoteTargetType.REPLY, id, body.value);
  }

  @Post('questions/:id/approve')
  approve(@CurrentUser() user: User, @Param('id') id: string) {
    return this.forumService.approve(user, id);
  }

  @Post('questions/:id/reject')
  reject(@CurrentUser() user: User, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.forumService.reject(user, id, body?.reason);
  }

  @Delete('questions/:id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.forumService.remove(user, id);
  }
}
