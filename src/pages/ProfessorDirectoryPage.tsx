import { useDeferredValue, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Download, Plus, Search, Upload } from 'lucide-react';
import { ProfessorCard } from '../components/ProfessorCard';
import { ProfessorFormDialog } from '../components/ProfessorFormDialog';
import { ProfessorTimelineDrawer } from '../components/ProfessorTimelineDrawer';
import { useTimeline } from '../hooks/useTimeline';
import { useI18n } from '../lib/i18n';
import { exportProfessorsToExcel, parseProfessorExcelFile } from '../lib/professors';
import { PROFESSOR_STATUSES, type Professor, type ProfessorDraft, type ProfessorStatus } from '../types/professor';
import type { TimelineEventDraft } from '../types/timeline';

type SortOption =
  | 'updated-desc'
  | 'last-contact-desc'
  | 'last-contact-asc'
  | 'first-contact-desc'
  | 'first-contact-asc'
  | 'name-asc';

interface ProfessorDirectoryPageProps {
  mode: 'active' | 'trash';
  professors: Professor[];
  isLoading: boolean;
  error: string | null;
  onCreateProfessor: (draft: ProfessorDraft) => Promise<void>;
  onUpdateProfessor: (id: string, draft: ProfessorDraft) => Promise<void>;
  onTrashProfessor: (id: string) => Promise<void>;
  onRestoreProfessor: (id: string) => Promise<void>;
  onPurgeProfessor: (id: string) => Promise<void>;
  onCreateTimelineEvent: (draft: TimelineEventDraft) => Promise<void>;
  onImportProfessors: (drafts: ProfessorDraft[]) => Promise<{ created: number; updated: number; skipped: number }>;
}

function compareDateValue(left: string, right: string, direction: 'asc' | 'desc') {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }

  return direction === 'asc' ? left.localeCompare(right) : right.localeCompare(left);
}

export function ProfessorDirectoryPage({
  mode,
  professors,
  isLoading,
  error,
  onCreateProfessor,
  onUpdateProfessor,
  onTrashProfessor,
  onRestoreProfessor,
  onPurgeProfessor,
  onCreateTimelineEvent,
  onImportProfessors,
}: ProfessorDirectoryPageProps) {
  const { getStatusLabel, locale, t } = useI18n();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProfessorStatus>('all');
  const [sortOption, setSortOption] = useState<SortOption>('updated-desc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfessor, setEditingProfessor] = useState<Professor | null>(null);
  const [detailProfessor, setDetailProfessor] = useState<Professor | null>(null);
  const [importFeedback, setImportFeedback] = useState<{ tone: 'success' | 'failed'; message: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search);
  const timeline = useTimeline(detailProfessor?.id ?? null);
  const availableStatuses = useMemo(
    () =>
      Array.from(
        new Set([
          ...PROFESSOR_STATUSES,
          ...professors
            .map((professor) => professor.status)
            .filter((status) => status.trim()),
        ]),
      ),
    [professors],
  );

  const visibleProfessors = useMemo(() => {
    const normalized = deferredSearch.trim().toLowerCase();
    return professors
      .filter((professor) => (mode === 'active' ? !professor.deletedAt : Boolean(professor.deletedAt)))
      .filter((professor) => (statusFilter === 'all' ? true : professor.status === statusFilter))
      .filter((professor) => {
        if (!normalized) {
          return true;
        }

        return [
          professor.name,
          professor.title,
          professor.school,
          professor.college,
          professor.email,
          professor.homepage,
          professor.researchArea,
          professor.status,
          professor.firstContactDate,
          professor.lastContactDate,
          professor.notes,
          professor.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      })
      .sort((left, right) => {
        if (sortOption === 'last-contact-desc') {
          return compareDateValue(left.lastContactDate, right.lastContactDate, 'desc') || right.updatedAt - left.updatedAt;
        }
        if (sortOption === 'last-contact-asc') {
          return compareDateValue(left.lastContactDate, right.lastContactDate, 'asc') || right.updatedAt - left.updatedAt;
        }
        if (sortOption === 'first-contact-desc') {
          return compareDateValue(left.firstContactDate, right.firstContactDate, 'desc') || right.updatedAt - left.updatedAt;
        }
        if (sortOption === 'first-contact-asc') {
          return compareDateValue(left.firstContactDate, right.firstContactDate, 'asc') || right.updatedAt - left.updatedAt;
        }
        if (sortOption === 'name-asc') {
          return left.name.localeCompare(right.name, locale === 'zh' ? 'zh-CN' : 'en-US') || right.updatedAt - left.updatedAt;
        }

        return right.updatedAt - left.updatedAt;
      });
  }, [deferredSearch, locale, mode, professors, sortOption, statusFilter]);

  const groupedProfessors = useMemo(
    () =>
      availableStatuses.map((status) => ({
        status,
        professors: visibleProfessors.filter((professor) => professor.status === status),
      })).filter((group) => group.professors.length > 0),
    [availableStatuses, visibleProfessors],
  );

  const openCreateDialog = () => {
    setEditingProfessor(null);
    setDialogOpen(true);
  };

  const openEditDialog = (professor: Professor) => {
    setEditingProfessor(professor);
    setDialogOpen(true);
  };

  const handleSubmit = async (draft: ProfessorDraft, professorId?: string) => {
    if (professorId) {
      await onUpdateProfessor(professorId, draft);
      return;
    }
    await onCreateProfessor(draft);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const drafts = await parseProfessorExcelFile(file);
      const result = await onImportProfessors(drafts);
      setImportFeedback({
        tone: 'success',
        message: t('importProfessorsSuccess', {
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
        }),
      });
    } catch (error) {
      console.error(error);
      setImportFeedback({
        tone: 'failed',
        message: t('importProfessorsFailed'),
      });
    } finally {
      event.target.value = '';
    }
  };

  const title = mode === 'active' ? t('professorDirectory') : t('recycleBin');
  const subtitle =
    mode === 'active'
      ? t('professorDirectoryDesc')
      : t('recycleBinDesc');

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 md:px-12">
      <div className="w-full">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{mode === 'active' ? t('dataLayer') : t('safetyNet')}</p>
            <h1 className="mt-3 text-4xl font-serif font-medium tracking-tight text-stone-900">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-500">{subtitle}</p>
          </div>
          {mode === 'active' && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => exportProfessorsToExcel(professors.filter((professor) => !professor.deletedAt))}
                className="inline-flex items-center justify-center space-x-2 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              >
                <Download className="w-4 h-4" />
                <span>{t('exportProfessors')}</span>
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center justify-center space-x-2 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              >
                <Upload className="w-4 h-4" />
                <span>{t('importProfessors')}</span>
              </button>
              <button
                onClick={openCreateDialog}
                className="inline-flex items-center justify-center space-x-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800"
              >
                <Plus className="w-4 h-4" />
                <span>{t('addProfessor')}</span>
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.xml,.csv,.html,.htm"
                className="hidden"
                onChange={(event) => void handleImport(event)}
              />
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 w-4 h-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchProfessors')}
              className="w-full rounded-full border border-stone-200 bg-stone-50 px-11 py-3 text-sm outline-none transition-colors focus:border-accent"
            />
          </div>
          {mode === 'active' && (
            <div className="flex flex-col gap-3 md:flex-row">
              <label className="flex items-center gap-2 rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600">
                <span>{t('statusFilter')}</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | ProfessorStatus)}
                  className="bg-transparent outline-none"
                >
                  <option value="all">{t('allStatuses')}</option>
                  {availableStatuses.map((status) => (
                    <option key={status} value={status}>
                      {getStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600">
                <span>{t('sortProfessors')}</span>
                <select
                  value={sortOption}
                  onChange={(event) => setSortOption(event.target.value as SortOption)}
                  className="bg-transparent outline-none"
                >
                  <option value="updated-desc">{t('sortUpdatedDesc')}</option>
                  <option value="last-contact-desc">{t('sortLastContactDesc')}</option>
                  <option value="last-contact-asc">{t('sortLastContactAsc')}</option>
                  <option value="first-contact-desc">{t('sortFirstContactDesc')}</option>
                  <option value="first-contact-asc">{t('sortFirstContactAsc')}</option>
                  <option value="name-asc">{t('sortNameAsc')}</option>
                </select>
              </label>
            </div>
          )}
          <div className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-500">
            {t('recordCount', {
              count: visibleProfessors.length,
              suffix: locale === 'en' && visibleProfessors.length === 1 ? '' : 's',
            })}
          </div>
        </div>

        {error && <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}
        {importFeedback && (
          <div className={`mt-6 rounded-3xl px-5 py-4 text-sm ${importFeedback.tone === 'success' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-rose-200 bg-rose-50 text-rose-700'}`}>
            {importFeedback.message}
          </div>
        )}

        {isLoading ? (
          <div className="mt-8 rounded-[2rem] border border-dashed border-stone-200 bg-white px-6 py-16 text-center text-sm text-stone-400">
            {t('loadingProfessorRecords')}
          </div>
        ) : visibleProfessors.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-dashed border-stone-200 bg-white px-6 py-16 text-center">
            <p className="text-lg font-medium text-stone-700">
              {mode === 'active' ? t('noProfessorsMatch') : t('recycleBinEmpty')}
            </p>
            <p className="mt-2 text-sm text-stone-400">
              {mode === 'active'
                ? t('createFirstProfessor')
                : t('deletedAppearHere')}
            </p>
          </div>
        ) : (
          mode === 'active' ? (
            <div className="mt-8 space-y-8">
              {groupedProfessors.map((group) => (
                <section key={group.status}>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-stone-900">{t('status')}: {getStatusLabel(group.status)}</h2>
                    <span className="text-sm text-stone-400">{group.professors.length}</span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-5">
                    {group.professors.map((professor) => (
                      <ProfessorCard
                        key={professor.id}
                        professor={professor}
                        mode={mode}
                        onEdit={openEditDialog}
                        onViewDetails={setDetailProfessor}
                        onTrash={(id) => void onTrashProfessor(id)}
                        onRestore={(id) => void onRestoreProfessor(id)}
                        onPurge={(id) => void onPurgeProfessor(id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-5">
              {visibleProfessors.map((professor) => (
                <ProfessorCard
                  key={professor.id}
                  professor={professor}
                  mode={mode}
                  onEdit={openEditDialog}
                  onViewDetails={setDetailProfessor}
                  onTrash={(id) => void onTrashProfessor(id)}
                  onRestore={(id) => void onRestoreProfessor(id)}
                  onPurge={(id) => void onPurgeProfessor(id)}
                />
              ))}
            </div>
          )
        )}
      </div>

      <ProfessorFormDialog
        open={dialogOpen}
        professor={editingProfessor}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />

      <ProfessorTimelineDrawer
        professor={detailProfessor}
        open={Boolean(detailProfessor)}
        events={timeline.events}
        isLoading={timeline.isLoading}
        error={timeline.error}
        onClose={() => setDetailProfessor(null)}
        onCreateEvent={async (draft) => {
          await onCreateTimelineEvent(draft);
          await timeline.refresh();
        }}
      />
    </div>
  );
}
