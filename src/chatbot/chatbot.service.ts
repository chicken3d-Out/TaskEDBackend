import { BadGatewayException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/user.entity';
import { Role } from '../common/enums/role.enum';
import { TicketsService } from '../tickets/tickets.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY_MESSAGES = 12; // keep the request small/cheap
const MAX_TICKETS_IN_CONTEXT = 15;

// Static description of how TaskEd works, kept in one place so the
// chatbot's "explain the system" answers stay consistent with the app
// itself. Update this alongside any real feature changes.
const SYSTEM_OVERVIEW = `
You are the TaskEd Assistant, built into TaskEd - a ticket/task-tracking
and communication platform for the DepEd Schools Division of Leyte.

How TaskEd works:
- Roles: Teacher (files tickets to their school's Administrative Officer,
  can see - but not edit - other teachers' tickets at their own school for
  transparency), Administrative Officer / AO (processes tickets for their
  assigned school(s), can request attachments and change ticket status),
  Administrative Office account (posts public calendar events and
  announcements), and Administrator (approves AO/public-post/admin
  accounts and oversees the system).
- Accounts sign in with a @deped.gov.ph Google account, complete a
  registration form, and then wait for approval: Administrators approve
  AO/public-post/admin accounts; the AO assigned to a school approves
  Teacher accounts from that school. Nobody can use the app until approved.
- Tickets move through: Submitted -> Acknowledged -> In Progress ->
  Needs Attachment -> Resolved -> Closed. Only the requesting teacher and
  the assigned AO can act on (comment on, change the status of) a ticket;
  other teachers at the same school can only view it.
- The shared Calendar and the Announcements section show the same
  underlying events - Administrators and Administrative Office accounts
  can create them. AOs get a reminder notification when an event is
  within 2 days.
- The Ask-a-Question forum is for Administrative Officers only, end to
  end - only AOs can post, reply, or vote there.
- The Weather section shows the user's current location on a map and a
  2-hour rain-chance forecast for the next 12 hours.

Answer questions about how to use TaskEd, what a status or role means,
and questions about the current user's own tickets (a summary is
provided below, if any). Keep answers concise and practical. If asked
something outside TaskEd, you can still help as a general-purpose
assistant, but stay helpful and professional - this is a workplace tool
for a government schools division.
`.trim();

@Injectable()
export class ChatbotService {
  private readonly apiKey: string | undefined;
  private readonly model: string;

  constructor(
    private config: ConfigService,
    private ticketsService: TicketsService,
  ) {
    this.apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    // OpenRouter's free lineup shifts over time - override via env instead
    // of a code change if this one gets retired or replaced.
    this.model = this.config.get<string>(
      'OPENROUTER_MODEL',
      'deepseek/deepseek-v4-flash:free',
    );
  }

  private async buildTicketContext(user: User): Promise<string> {
    try {
      const tickets = await this.ticketsService.findAllFor(user);
      if (tickets.length === 0) {
        return 'The current user has no visible tickets right now.';
      }
      const lines = tickets.slice(0, MAX_TICKETS_IN_CONTEXT).map((t) => {
        const desc = t.description.length > 160 ? `${t.description.slice(0, 160)}…` : t.description;
        return `- [${t.status}] "${t.title}" (requested by ${t.requester.name}, assigned to ${t.assignedAo.name}, school: ${t.school.name}): ${desc}`;
      });
      const truncatedNote =
        tickets.length > MAX_TICKETS_IN_CONTEXT
          ? `\n(${tickets.length - MAX_TICKETS_IN_CONTEXT} more ticket(s) not shown here.)`
          : '';
      return `Tickets visible to the current user (${user.name}, role: ${user.role}):\n${lines.join('\n')}${truncatedNote}`;
    } catch {
      // Chat should still work even if ticket context fails to load for
      // some reason (e.g. a role with no ticket access at all).
      return 'Ticket context is unavailable right now.';
    }
  }

  async sendMessage(user: User, message: string, history: ChatMessage[] = []): Promise<string> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'The chatbot is not configured yet - set OPENROUTER_API_KEY on the backend.',
      );
    }

    const ticketContext = await this.buildTicketContext(user);
    const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

    const messages = [
      { role: 'system', content: `${SYSTEM_OVERVIEW}\n\n${ticketContext}` },
      ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          // Optional but recommended by OpenRouter so usage attributes
          // correctly to this app on their leaderboards/dashboards.
          'HTTP-Referer': this.config.get<string>('FRONTEND_URL', 'http://localhost:4200'),
          'X-Title': 'TaskEd',
        },
        body: JSON.stringify({ model: this.model, messages }),
      });
    } catch {
      throw new BadGatewayException('Could not reach the chatbot service');
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new BadGatewayException(
        `Chatbot service returned an error (${res.status}): ${bodyText.slice(0, 300)}`,
      );
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      throw new BadGatewayException('Chatbot service returned an empty response');
    }
    return reply;
  }
}
