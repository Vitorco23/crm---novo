// Agenda — tipos do domínio (Refatoração 002).
export interface GoogleEvent {
  id?: string;
  summary?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  [key: string]: unknown;
}

export interface GoogleEventsRange {
  timeMin: string;
  timeMax: string;
  timeZone: string;
}

export interface GoogleEventsResult {
  events: GoogleEvent[];
  error?: string;
  details?: string;
}

export interface MeetingInput {
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  timeZone: string;
  attendeeEmail?: string;
  withMeet: boolean;
}

export interface MeetingResult {
  eventId?: string;
  htmlLink?: string;
  meetLink?: string;
  error?: string;
  details?: string;
}

export interface TaskEventInput {
  title: string;
  description: string;
  dueISO: string;
  durationMin: number;
  timeZone: string;
  priority: string;
}

export interface TaskEventResult {
  eventId?: string;
  htmlLink?: string;
  error?: string;
  details?: string;
}
