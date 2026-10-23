import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ChatMessage, ChatbotService } from './chatbot.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('chatbot')
export class ChatbotController {
  constructor(private chatbotService: ChatbotService) {}

  @Post('message')
  async sendMessage(
    @CurrentUser() user: User,
    @Body() body: { message: string; history?: ChatMessage[] },
  ) {
    const reply = await this.chatbotService.sendMessage(user, body.message, body.history);
    return { reply };
  }
}
