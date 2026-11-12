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
You are the TaskEd Assistant, built into TaskEd - a task-tracking
and communication platform for the DepEd Schools Division of Leyte.

How TaskEd works:
- Roles: Teacher (files tasks to their school's Administrative Officer,
  can see - but not edit - other teachers' tasks at their own school for
  transparency), Administrative Officer / AO (processes tasks for their
  assigned school(s), can request attachments and change task status,
  and can manage the teachers of their schools), School Head and School (one
  each per school: manage the school profile, the teachers of the school, and
  upload school files such as the Annual Implementation Plan), Publisher
  (posts public calendar events and announcements), and Administrator
  (signs in with a username and password; adds users, assigns roles,
  approves accounts, approves forum questions, and sets which school
  documents must be uploaded).
- Teachers, AOs, Schools and Publishers sign in with a @deped.gov.ph
  Google account, complete their profile, and wait until an Administrator
  assigns a role. A School account or an AO can also approve and manage
  the teachers of their own school(s). Nobody can use the app until approved.
- Tasks move through: Submitted -> Acknowledged -> In Progress ->
  Needs Attachment -> Resolved -> Closed. Only the requesting teacher and
  the assigned AO can act on (comment on, change the status of) a task;
  other teachers at the same school can only view it.
- The shared Calendar and Announcements are one page - Administrators and
  Publishers can create events. AOs get a reminder when an event is
  within 2 days.
- The Ask-a-Question forum is for Administrative Officers only: AOs post
  questions (an Administrator must approve a question before it appears),
  reply (no approval needed), and upvote or downvote.
- The Weather section shows the user's location on a map, a 12-hour rain
  forecast, rain radar and satellite views, a typhoon tracker (path, speed,
  strength) and nearby earthquake alerts.
- My Files has two tabs: Working Directory Files (the person's own working
  forms: Personal Data Sheet, Service Record, SALN and other documents; each
  can be uploaded, previewed, edited into clean inputs, downloaded, or removed)
  and File Storage (older files sorted by school year). Files live in the
  person's own Google Drive; TaskEd only sees files it created. Removing a
  file also moves it to the Drive trash.
- Administrative Officers have a Manage button for each teacher of their school
  to keep the teacher's profile (employment details) and documents in the AO's
  own Drive, under Teachers > school > teacher name.
- The Calendar opens a pop-up for any day clicked, with events, holidays and
  the person's private notes (orange); notes can be added there.

Answer questions about how to use TaskEd, what a status or role means,
and questions about the current user's own tasks (a summary is
provided below, if any). If asked something outside TaskEd, you can still
help as a general-purpose assistant, but stay helpful and professional - this
is a workplace tool for a government schools division.

How to write your answers (very important):
- Write clean plain text. NEVER use markdown symbols: no asterisks (* or **),
  no # headings, no backticks, no underscores for emphasis, no tables.
- Start with the direct answer in the first sentence, then add only the
  details that help. Be accurate, specific and practical; do not pad.
- For steps, use short numbered lines like "1. Open My Files." one per line.
  For a few items, use a simple dash at the start of the line ("- ").
- Name buttons and menu items exactly as they appear, in plain words
  (for example: press Save to my Drive).
- Keep it short: usually under 120 words unless the person asks for detail.
- If you are not sure about something in TaskEd, say so honestly and suggest
  asking the Administrator instead of guessing. Never invent features.
- Answer in the language the person uses (English or Filipino).
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
    this.model = this.config.get<string>('OPENROUTER_MODEL', 'openrouter/free');
  }

  private async buildTicketContext(user: User): Promise<string> {
    try {
      const tickets = await this.ticketsService.findAllFor(user);
      if (tickets.length === 0) {
        return 'The current user has no visible tasks right now.';
      }
      const lines = tickets.slice(0, MAX_TICKETS_IN_CONTEXT).map((t) => {
        const desc = t.description.length > 160 ? `${t.description.slice(0, 160)}…` : t.description;
        return `- [${t.status}] "${t.title}" (requested by ${t.requester.name}, assigned to ${t.assignedAo.name}, school: ${t.school.name}): ${desc}`;
      });
      const truncatedNote =
        tickets.length > MAX_TICKETS_IN_CONTEXT
          ? `\n(${tickets.length - MAX_TICKETS_IN_CONTEXT} more task(s) not shown here.)`
          : '';
      return `Tasks visible to the current user (${user.name}, role: ${user.role}):\n${lines.join('\n')}${truncatedNote}`;
    } catch {
      // Chat should still work even if ticket context fails to load for
      // some reason (e.g. a role with no ticket access at all).
      return 'Task context is unavailable right now.';
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
      { role: 'system', content: `${SYSTEM_OVERVIEW}\n\nToday is ${new Date().toLocaleDateString('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' })}.\n\n${ticketContext}` },
      ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    // Try the configured model first, then backups, because free models on
    // OpenRouter come and go or get rate-limited. "openrouter/free" lets
    // OpenRouter pick any free model that is currently available.
    const models = [...new Set([this.model, 'openrouter/free', 'google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free'])];
    let res: Response | null = null;
    let lastError = '';
    for (const model of models) {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.config.get<string>('FRONTEND_URL', 'http://localhost:4200'),
            'X-Title': 'TaskEd',
          },
          body: JSON.stringify({ model, messages }),
        });
        if (r.ok) {
          res = r;
          break;
        }
        lastError = `${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`;
        // A bad key will fail for every model, so stop right away.
        if (r.status === 401 || r.status === 403) break;
      } catch {
        lastError = 'network error';
      }
    }
    if (!res) {
      if (lastError.startsWith('401') || lastError.startsWith('403')) {
        throw new BadGatewayException('The assistant\'s OpenRouter key was rejected. Ask the Administrator to check it.');
      }
      throw new BadGatewayException('The assistant is busy right now. Please try again in a minute.');
    }

    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      throw new BadGatewayException('Chatbot service returned an empty response');
    }
    return cleanReply(reply);
  }
}

// Safety net: free models sometimes ignore the style rules, so strip markdown
// symbols and tidy the text before it reaches the chat.
export function cleanReply(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,:;!?]|$)/g, '$1$2')
    .replace(/^\s*[*•]\s+/gm, '- ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)')
    .replace(/^\s*\|?\s*-{3,}.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
