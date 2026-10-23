import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/user.entity';
import { ForumSort, ForumService } from './forum.service';
import { ForumVoteTargetType } from './forum-vote.entity';

// Every route here also requires ADMIN_OFFICER - the forum is AO-only
// end to end, so it's simplest to gate the whole controller rather than
// rely solely on the service-level checks.
@UseGuards(JwtAuthGuard, ApprovedGuard, RolesGuard)
@Roles(Role.ADMIN_OFFICER)
@Controller('forum')
export class ForumController {
  constructor(private forumService: ForumService) {}

  @Get('questions')
  listQuestions(@Query('sort') sort?: ForumSort) {
    return this.forumService.listQuestions(sort);
  }

  @Post('questions')
  createQuestion(
    @CurrentUser() user: User,
    @Body() body: { title: string; body: string },
  ) {
    return this.forumService.createQuestion(user, body.title, body.body);
  }

  @Get('questions/:id')
  getQuestion(@Param('id') id: string) {
    return this.forumService.getQuestion(id);
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
}
