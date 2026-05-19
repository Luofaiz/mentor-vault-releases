export const TIMELINE_EVENT_TYPES = [
  'Initial Outreach',
  'Follow-Up',
  'Reply',
  'Meeting',
  'Note',
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export interface TimelineEvent {
  id: string;
  professorId: string;
  type: TimelineEventType;
  title: string;
  description: string;
  eventDate: string;
  createdAt: number;
}

export interface TimelineEventDraft {
  professorId: string;
  type: TimelineEventType;
  title: string;
  description: string;
  eventDate: string;
}

export type TimelineEventUpdate = TimelineEventDraft;
