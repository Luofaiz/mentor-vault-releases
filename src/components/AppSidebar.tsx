import {
  BookOpenCheck,
  Building2,
  FileText,
  Github,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import type { UpdateDownloadProgress } from '../lib/desktop';

type View = 'contacts' | 'schools' | 'notes' | 'trash';

const PROJECT_GITHUB_URL = 'https://github.com/Luofaiz/mentor-vault';
const CSBAOYAN_DDL_URL = 'https://ddl.csbaoyan.top/';

interface AvailableUpdateSummary {
  notes?: string;
  downloadUrls: string[];
  releaseUrl?: string;
  canInstallDifferential: boolean;
}

export interface Attachment {
  name: string;
  content: string;
}

interface AppSidebarProps {
  view: View;
  contactedProfessorCount: number;
  activeProfessorCount: number;
  onChangeView: (view: View) => void;
  updateMessage: string | null;
  updateDownloadProgress: UpdateDownloadProgress | null;
  isCheckingUpdates: boolean;
  isClearingUpdateCache: boolean;
  onCheckUpdates: () => void;
  onClearUpdateCache: () => void;
  availableUpdate: AvailableUpdateSummary | null;
  onDownloadDifferentialUpdate: () => void;
  onDownloadFullUpdate: () => void;
  onManualDownloadUpdate: () => void;
  onPauseUpdateDownload: () => void;
  onResumeUpdateDownload: () => void;
  onCancelUpdateDownload: () => void;
  onOpenExternalUrl: (url: string) => void;
}

export function AppSidebar({
  view,
  contactedProfessorCount,
  activeProfessorCount,
  onChangeView,
  updateMessage,
  updateDownloadProgress,
  isCheckingUpdates,
  isClearingUpdateCache,
  onCheckUpdates,
  onClearUpdateCache,
  availableUpdate,
  onDownloadDifferentialUpdate,
  onDownloadFullUpdate,
  onManualDownloadUpdate,
  onPauseUpdateDownload,
  onResumeUpdateDownload,
  onCancelUpdateDownload,
  onOpenExternalUrl,
}: AppSidebarProps) {
  const { t } = useI18n();
  const isUpdateDownloadPaused = updateDownloadProgress?.status === 'paused';
  const isDifferentialUpdate = updateDownloadProgress?.mode === 'differential';
  const progressPercent = updateDownloadProgress?.percent ?? null;
  const progressLabel = isUpdateDownloadPaused ? '已暂停' : progressPercent === null ? '正在下载' : `${progressPercent}%`;
  const progressWidth = progressPercent === null ? 100 : Math.max(0, Math.min(100, progressPercent));
  const canChooseUpdateDownload = Boolean(availableUpdate && !updateDownloadProgress && !isCheckingUpdates);

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
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            title="打开项目 GitHub"
            aria-label="打开项目 GitHub"
            onClick={() => onOpenExternalUrl(PROJECT_GITHUB_URL)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-white shadow-sm shadow-stone-900/15 transition-colors hover:bg-stone-700"
          >
            <Github className="h-5 w-5" />
          </button>
          <button
            type="button"
            title="打开 CS 保研 DDL"
            aria-label="打开 CS 保研 DDL"
            onClick={() => onOpenExternalUrl(CSBAOYAN_DDL_URL)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 shadow-sm shadow-stone-900/15 ring-1 ring-stone-900/10 transition-colors hover:bg-stone-700"
          >
            <img src="./csbaoyan-ddl.svg" alt="" className="h-5 w-5" />
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
      </nav>

      <div className="mt-auto space-y-3">
        <button
          type="button"
          onClick={onCheckUpdates}
          disabled={isCheckingUpdates}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
          <span>{isCheckingUpdates ? t('checkingUpdates') : t('checkUpdates')}</span>
        </button>
        <button
          type="button"
          onClick={onClearUpdateCache}
          disabled={isClearingUpdateCache || Boolean(updateDownloadProgress)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw className={`h-4 w-4 ${isClearingUpdateCache ? 'animate-spin' : ''}`} />
          <span>{isClearingUpdateCache ? '清理中' : '清理缓存'}</span>
        </button>
        {updateMessage && (
          <div className="rounded-2xl bg-stone-50 px-4 py-3 text-xs leading-5 text-stone-500">
            <p>{updateMessage}</p>
            {availableUpdate?.notes && !updateDownloadProgress && (
              <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-stone-400">{availableUpdate.notes}</p>
            )}
            {canChooseUpdateDownload && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {availableUpdate?.canInstallDifferential && (
                    <button
                      type="button"
                      onClick={onDownloadDifferentialUpdate}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-medium leading-none text-stone-700 transition-colors hover:bg-stone-100"
                    >
                      增量下载
                    </button>
                  )}
                  {availableUpdate?.downloadUrls.length ? (
                    <button
                      type="button"
                      onClick={onDownloadFullUpdate}
                      className={cn(
                        'inline-flex h-9 items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-medium leading-none text-stone-700 transition-colors hover:bg-stone-100',
                        !availableUpdate.canInstallDifferential && 'col-span-2',
                      )}
                    >
                      全量下载
                    </button>
                  ) : null}
                </div>
                {availableUpdate?.releaseUrl ? (
                  <button
                    type="button"
                    onClick={onManualDownloadUpdate}
                    className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-3 text-xs font-medium leading-none text-stone-700 transition-colors hover:bg-stone-100"
                  >
                    手动下载
                  </button>
                ) : null}
              </div>
            )}
            {updateDownloadProgress && (
              <div className="mt-3 space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className={cn(
                      'h-full rounded-full bg-stone-900 transition-all',
                      progressPercent === null && 'animate-pulse',
                    )}
                    style={{ width: `${progressWidth}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-stone-600">
                  <span>{progressLabel}</span>
                  <span>{formatBytes(updateDownloadProgress.transferredBytes)} / {formatBytes(updateDownloadProgress.totalBytes)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[11px] text-stone-400">
                  <span>{formatBytes(updateDownloadProgress.bytesPerSecond)}/s</span>
                  <span>剩余 {formatDuration(updateDownloadProgress.remainingSeconds)}</span>
                </div>
                {updateDownloadProgress.status !== 'completed' && (
                  <div className={cn('grid gap-2 pt-1', isDifferentialUpdate ? 'grid-cols-1' : 'grid-cols-2')}>
                    {!isDifferentialUpdate && (
                      <button
                        type="button"
                        onClick={isUpdateDownloadPaused ? onResumeUpdateDownload : onPauseUpdateDownload}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
                      >
                        {isUpdateDownloadPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        <span>{isUpdateDownloadPaused ? '继续' : '暂停'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onCancelUpdateDownload}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100"
                    >
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
    </aside>
  );
}

function formatBytes(bytes?: number) {
  if (!Number.isFinite(bytes) || !bytes) {
    return '--';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function formatDuration(seconds?: number) {
  if (!Number.isFinite(seconds) || seconds === undefined) {
    return '--';
  }

  const roundedSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  if (minutes <= 0) {
    return `${remainingSeconds} 秒`;
  }

  return `${minutes} 分 ${remainingSeconds} 秒`;
}
