export enum TicketStatus {
  SUBMITTED = 'submitted',
  ACKNOWLEDGED = 'acknowledged',
  IN_PROGRESS = 'in_progress',
  NEEDS_ATTACHMENT = 'needs_attachment',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

// Status transitions considered valid when an AO updates a ticket.
// Enforced server-side so the frontend can never bypass the lifecycle.
export const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.SUBMITTED]: [TicketStatus.ACKNOWLEDGED, TicketStatus.IN_PROGRESS],
  [TicketStatus.ACKNOWLEDGED]: [TicketStatus.IN_PROGRESS, TicketStatus.NEEDS_ATTACHMENT],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.NEEDS_ATTACHMENT, TicketStatus.RESOLVED],
  [TicketStatus.NEEDS_ATTACHMENT]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  [TicketStatus.CLOSED]: [],
};
