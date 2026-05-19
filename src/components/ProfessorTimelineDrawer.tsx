import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { TIMELINE_EVENT_TYPES, type TimelineEvent, type TimelineEventDraft, type TimelineEventUpdate } from '../types/timeline';
import type { Professor } from '../types/professor';

interface ProfessorTimelineDrawerProps {
  professor: Professor | null;
  open: boolean;
  events: TimelineEvent[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onCreateEvent: (draft: TimelineEventDraft) => Promise<void>;
  onUpdateEvent: (id: string, input: TimelineEventUpdate) => Promise<void>;
  onDeleteEvent: (id: string) => Promise<void>;
}

const EMPTY_EVENT = {
  type: 'Note' as const,
  title: '',
  description: '',
  eventDate: new Date().toISOString().slice(0, 10),
};

const EVENT_TONE: Record<string, string> = {
  'Initial Outreach': 'bg-sky-50 text-sky-700 border-sky-100',
  'Follow-Up': 'bg-amber-50 text-amber-700 border-amber-100',
  Reply: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Meeting: 'bg-violet-50 text-violet-700 border-violet-100',
  Note: 'bg-stone-100 text-stone-700 border-stone-200',
};

export function ProfessorTimelineDrawer({
  professor,
  open,
  events,
  isLoading,
  error,
  onClose,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
}: ProfessorTimelineDrawerProps) {
  const { getTimelineTypeLabel, t } = useI18n();
  const [draft, setDraft] = useState<{
    type: TimelineEventDraft['type'];
    title: string;
    description: string;
    eventDate: string;
  }>(EMPTY_EVENT);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !professor) {
      return;
    }

    setDraft({
      ...EMPTY_EVENT,
      eventDate: new Date().toISOString().slice(0, 10),
    });
    setEditingEventId(null);
  }, [open, professor]);

  if (!open || !professor) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const input = {
        professorId: professor.id,
        type: draft.type,
        title: draft.title,
        description: draft.description,
        eventDate: draft.eventDate,
      };
      if (editingEventId) {
        await onUpdateEvent(editingEventId, input);
      } else {
        await onCreateEvent(input);
      }
      setDraft({
        ...EMPTY_EVENT,
        eventDate: new Date().toISOString().slice(0, 10),
      });
      setEditingEventId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditEvent = (timelineEvent: TimelineEvent) => {
    setEditingEventId(timelineEvent.id);
    setDraft({
      type: timelineEvent.type,
      title: timelineEvent.title,
      description: timelineEvent.description,
      eventDate: timelineEvent.eventDate || new Date().toISOString().slice(0, 10),
    });
  };

  const handleCancelEdit = () => {
    setEditingEventId(null);
    setDraft({
      ...EMPTY_EVENT,
      eventDate: new Date().toISOString().slice(0, 10),
    });
  };

  const handleDeleteEvent = async (timelineEvent: TimelineEvent) => {
    if (!window.confirm(t('deleteTimelineEventConfirm'))) {
      return;
    }

    await onDeleteEvent(timelineEvent.id);
    if (editingEventId === timelineEvent.id) {
      handleCancelEdit();
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-stone-950/30 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-stone-200 bg-[#fcfbf8] shadow-2xl shadow-stone-400/30">
        <div className="flex items-start justify-between border-b border-stone-200 px-8 py-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('professorTimeline')}</p>
            <h2 className="mt-2 text-3xl font-serif font-medium tracking-tight text-stone-900">{professor.name}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              {[professor.school || t('schoolNotSet'), professor.college, professor.researchArea || t('researchAreaNotSet')]
                .filter(Boolean)
                .join(' / ')}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-y-auto border-b border-stone-200 px-8 py-6 lg:border-b-0 lg:border-r">
            <div className="mb-6 rounded-[2rem] border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center gap-3 text-sm text-stone-600">
                <CalendarClock className="h-4 w-4 text-accent" />
                <span>{professor.firstContactDate ? t('firstContactOn', { date: professor.firstContactDate }) : t('noFirstContactDate')}</span>
              </div>
              <div className="mt-3 text-sm text-stone-600">
                {professor.lastContactDate ? t('lastContactOn', { date: professor.lastContactDate }) : t('noLastContactDate')}
              </div>
              {professor.notes && <p className="mt-3 text-sm leading-6 text-stone-500">{professor.notes}</p>}
            </div>

            {error && <div className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}

            {isLoading ? (
              <div className="rounded-[2rem] border border-dashed border-stone-200 bg-white px-6 py-16 text-center text-sm text-stone-400">
                {t('loadingTimeline')}
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-stone-200 bg-white px-6 py-16 text-center">
                <p className="text-lg font-medium text-stone-700">{t('noTimelineYet')}</p>
                <p className="mt-2 text-sm text-stone-400">{t('addFirstInteraction')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((timelineEvent) => (
                  <article key={timelineEvent.id} className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{timelineEvent.eventDate}</p>
                        <h3 className="mt-2 text-lg font-semibold tracking-tight text-stone-900">
                          {timelineEvent.title || getTimelineTypeLabel(timelineEvent.type)}
                        </h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${EVENT_TONE[timelineEvent.type]}`}>
                          {getTimelineTypeLabel(timelineEvent.type)}
                        </span>
                        <button
                          type="button"
                          title={t('edit')}
                          onClick={() => handleEditEvent(timelineEvent)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={t('delete')}
                          onClick={() => void handleDeleteEvent(timelineEvent)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-100 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {timelineEvent.description && (
                      <p className="mt-3 text-sm leading-7 text-stone-600">{timelineEvent.description}</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-y-auto px-8 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">
              {editingEventId ? t('editTimelineEvent') : t('addEvent')}
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
              {editingEventId ? t('editTimelineEvent') : t('logInteraction')}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              {t('timelineIntro')}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-600">{t('eventType')}</span>
                <select
                  value={draft.type}
                  onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as TimelineEventDraft['type'] }))}
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                >
                  {TIMELINE_EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {getTimelineTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-600">{t('timelineEventTitle')}</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-600">{t('date')}</span>
                <input
                  type="date"
                  value={draft.eventDate}
                  onChange={(event) => setDraft((current) => ({ ...current, eventDate: event.target.value }))}
                  required
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-600">{t('description')}</span>
                <textarea
                  rows={5}
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  className="w-full resize-none rounded-3xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                />
              </label>

              <div className="flex gap-2">
                {editingEventId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="inline-flex flex-1 items-center justify-center rounded-full border border-stone-200 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
                  >
                    {t('cancel')}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editingEventId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  <span>{isSubmitting ? t('saving') : editingEventId ? t('saveChanges') : t('addTimelineEvent')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
