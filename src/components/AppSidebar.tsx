import {
  BookOpenCheck,
  Building2,
  FileText,
  Github,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { UpdateDownloadProgress } from '../lib/desktop';
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
  updateMessage: string | null;
  updateDownloadProgress: UpdateDownloadProgress | null;
  isCheckingUpdates: boolean;
  isClearingUpdateCache: boolean;
  availableUpdate: AvailableUpdateSummary | null;
  onOpenExternalUrl: (url: string) => void;
  onCheckUpdates: () => void;
  onClearUpdateCache: () => void;
  onDownloadDifferentialUpdate: () => void;
  onDownloadFullUpdate: () => void;
  onManualDownloadUpdate: () => void;
  onPauseUpdateDownload: () => void;
  onResumeUpdateDownload: () => void;
  onCancelUpdateDownload: () => void;
  onChangeView: (view: View) => void;
}

interface AvailableUpdateSummary {
  notes?: string;
  downloadUrls: string[];
  releaseUrl?: string;
  canInstallDifferential: boolean;
}

const PROJECT_GITHUB_URL = 'https://github.com/Luofaiz/mentor-vault';
const CSBAOYAN_DDL_URL = 'https://ddl.csbaoyan.top/';

function formatSidebarBytes(bytes?: number) {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let nextValue = value;
  let unitIndex = 0;
  while (nextValue >= 1024 && unitIndex < units.length - 1) {
    nextValue /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = nextValue >= 10 || unitIndex === 0 ? 0 : 1;
  return `${nextValue.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatSidebarDuration(seconds?: number) {
  const value = Number(seconds ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return '--';
  }

  const rounded = Math.ceil(value);
  const minutes = Math.floor(rounded / 60);
  const restSeconds = rounded % 60;
  if (minutes <= 0) {
    return `${restSeconds} 秒`;
  }

  return `${minutes} 分 ${restSeconds.toString().padStart(2, '0')} 秒`;
}

export function AppSidebar({
  view,
  contactedProfessorCount,
  activeProfessorCount,
  updateMessage,
  updateDownloadProgress,
  isCheckingUpdates,
  isClearingUpdateCache,
  availableUpdate,
  onOpenExternalUrl,
  onCheckUpdates,
  onClearUpdateCache,
  onDownloadDifferentialUpdate,
  onDownloadFullUpdate,
  onManualDownloadUpdate,
  onPauseUpdateDownload,
  onResumeUpdateDownload,
  onCancelUpdateDownload,
  onChangeView,
}: AppSidebarProps) {
  const { t } = useI18n();
  const isUpdateDownloadPaused = updateDownloadProgress?.status === 'paused';
  const isDifferentialUpdate = updateDownloadProgress?.mode === 'differential';
  const progressPercent = updateDownloadProgress?.percent ?? null;
  const progressWidth = progressPercent === null ? 100 : Math.max(0, Math.min(100, progressPercent));
  const canChooseUpdateDownload = Boolean(availableUpdate && !updateDownloadProgress && !isCheckingUpdates);
  const progressLabel = isUpdateDownloadPaused ? '已暂停' : progressPercent === null ? '正在下载' : `${progressPercent}%`;

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
        <div className="mt-7 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenExternalUrl(PROJECT_GITHUB_URL)}
            title="打开项目 GitHub"
            aria-label="打开项目 GitHub"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-950 text-white shadow-lg shadow-stone-900/15 transition-colors hover:bg-stone-800"
          >
            <Github className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onOpenExternalUrl(CSBAOYAN_DDL_URL)}
            title="打开 CS 保研 DDL"
            aria-label="打开 CS 保研 DDL"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-950 shadow-lg shadow-stone-900/15 transition-colors hover:bg-stone-800"
          >
            <img src="./csbaoyan-ddl.svg" alt="" className="h-6 w-6" />
          </button>
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

      <div className="mt-auto space-y-3">
        <div className="rounded-3xl border border-stone-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCheckUpdates}
              disabled={isCheckingUpdates}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-2xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdates ? t('checkingUpdates') : t('checkUpdates')}</span>
            </button>
            <button
              type="button"
              onClick={onClearUpdateCache}
              disabled={isClearingUpdateCache || Boolean(updateDownloadProgress)}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-2xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isClearingUpdateCache ? 'animate-spin' : ''}`} />
              <span>{isClearingUpdateCache ? '清理中' : '清理缓存'}</span>
            </button>
          </div>

          {updateMessage && (
            <div className="mt-3 rounded-2xl bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-600">
              <p>{updateMessage}</p>
              {availableUpdate?.notes && !updateDownloadProgress && (
                <p className="mt-1 text-stone-400">{availableUpdate.notes}</p>
              )}
              {canChooseUpdateDownload && (
                <div className="mt-2 grid gap-2">
                  {availableUpdate?.canInstallDifferential && (
                    <button type="button" onClick={onDownloadDifferentialUpdate} className="h-9 rounded-xl bg-white px-3 text-xs font-medium text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-100">
                      增量下载
                    </button>
                  )}
                  {availableUpdate?.downloadUrls.length ? (
                    <button type="button" onClick={onDownloadFullUpdate} className="h-9 rounded-xl bg-white px-3 text-xs font-medium text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-100">
                      全量下载
                    </button>
                  ) : null}
                  {availableUpdate?.releaseUrl ? (
                    <button type="button" onClick={onManualDownloadUpdate} className="h-9 rounded-xl bg-white px-3 text-xs font-medium text-stone-700 ring-1 ring-stone-200 transition-colors hover:bg-stone-100">
                      手动下载
                    </button>
                  ) : null}
                </div>
              )}
              {updateDownloadProgress && (
                <div className="mt-3 space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className={`h-full rounded-full bg-stone-900 transition-all ${progressPercent === null ? 'animate-pulse' : ''}`}
                      style={{ width: `${progressWidth}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-stone-600">
                    <span>{progressLabel}</span>
                    <span>{formatSidebarBytes(updateDownloadProgress.transferredBytes)} / {formatSidebarBytes(updateDownloadProgress.totalBytes)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-stone-400">
                    <span>{formatSidebarBytes(updateDownloadProgress.bytesPerSecond)}/s</span>
                    <span>剩余 {formatSidebarDuration(updateDownloadProgress.remainingSeconds)}</span>
                  </div>
                  {updateDownloadProgress.status !== 'completed' && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {!isDifferentialUpdate && (
                        <button type="button" onClick={isUpdateDownloadPaused ? onResumeUpdateDownload : onPauseUpdateDownload} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 transition-colors hover:bg-stone-100">
                          {isUpdateDownloadPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                          <span>{isUpdateDownloadPaused ? '继续' : '暂停'}</span>
                        </button>
                      )}
                      <button type="button" onClick={onCancelUpdateDownload} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700 ring-1 ring-rose-100 transition-colors hover:bg-rose-100">
                        <X className="h-3.5 w-3.5" />
                        <span>取消</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-stone-900 p-4 text-white">
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
      </div>
    </aside>
  );
}
