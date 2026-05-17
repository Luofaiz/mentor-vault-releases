import {
  BookOpenCheck,
  Building2,
  FileText,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

type View = 'contacts' | 'schools' | 'notes' | 'trash' | 'settings';

export interface Attachment {
  name: string;
  content: string;
}

interface AppSidebarProps {
  view: View;
  contactedProfessorCount: number;
  activeProfessorCount: number;
  onChangeView: (view: View) => void;
}

export function AppSidebar({
  view,
  contactedProfessorCount,
  activeProfessorCount,
  onChangeView,
}: AppSidebarProps) {
  const { t } = useI18n();

  return (
    <aside className="h-screen w-72 shrink-0 overflow-hidden border-r border-stone-200 bg-white/70 flex flex-col p-5 space-y-6 backdrop-blur-md">
      <div className="px-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-ink text-white flex items-center justify-center shadow-lg shadow-stone-900/15">
            <BookOpenCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('appName')}</p>
            <p className="truncate text-lg font-semibold tracking-tight">{t('appSubtitle')}</p>
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        <button
          onClick={() => onChangeView('contacts')}
          className={cn(
            'w-full flex items-center space-x-3 rounded-2xl px-4 py-3 text-left transition-colors',
            view === 'contacts' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
          )}
        >
          <Users className="w-4 h-4" />
          <span className="font-medium">{t('professors')}</span>
        </button>
        <button
          onClick={() => onChangeView('schools')}
          className={cn(
            'w-full flex items-center space-x-3 rounded-2xl px-4 py-3 text-left transition-colors',
            view === 'schools' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
          )}
        >
          <Building2 className="w-4 h-4" />
          <span className="font-medium">{t('schoolDirectory')}</span>
        </button>
        <button
          onClick={() => onChangeView('notes')}
          className={cn(
            'w-full flex items-center space-x-3 rounded-2xl px-4 py-3 text-left transition-colors',
            view === 'notes' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
          )}
        >
          <FileText className="w-4 h-4" />
          <span className="font-medium">{t('documentNotes')}</span>
        </button>
        <button
          onClick={() => onChangeView('trash')}
          className={cn(
            'w-full flex items-center space-x-3 rounded-2xl px-4 py-3 text-left transition-colors',
            view === 'trash' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
          )}
        >
          <Trash2 className="w-4 h-4" />
          <span className="font-medium">{t('recycleBin')}</span>
        </button>
        <button
          onClick={() => onChangeView('settings')}
          className={cn(
            'w-full flex items-center space-x-3 rounded-2xl px-4 py-3 text-left transition-colors',
            view === 'settings' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
          )}
        >
          <Settings className="w-4 h-4" />
          <span className="font-medium">{t('settings')}</span>
        </button>
      </nav>

      <div className="mt-auto rounded-3xl bg-stone-900 p-4 text-white">
        <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">
          <BookOpenCheck className="w-4 h-4" />
          <span>{t('phase1')}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/10 px-3 py-3">
            <p className="text-[11px] font-medium text-stone-400">{t('contactedProfessors')}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{contactedProfessorCount}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-3 py-3">
            <p className="text-[11px] font-medium text-stone-400">{t('activeProfessors')}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white">{activeProfessorCount}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-stone-200">
          {t('phase1Desc')}
        </p>
      </div>
    </aside>
  );
}
