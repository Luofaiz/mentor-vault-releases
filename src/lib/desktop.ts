import type { Professor, ProfessorDraft, ProfessorFilters } from '../types/professor';
import type { TimelineEvent, TimelineEventDraft } from '../types/timeline';
import type { DocumentNote, DocumentNoteInput } from '../types/note';
import type { ListOrderPreferences } from '../types/listOrderPreferences';

export interface VibeDesktopApi {
  system: {
    getRuntimeInfo: () => Promise<{
      platform: string;
      storageMode: 'desktop-json';
      version: string;
    }>;
    checkForUpdates: () => Promise<{
      configured: boolean;
      currentVersion: string;
      latestVersion?: string;
      updateAvailable: boolean;
      downloadUrl?: string;
      downloadUrls?: string[];
      downloadSha256ByUrl?: Record<string, string>;
      releaseUrl?: string;
      notes?: string;
    }>;
    openExternalUrl: (url: string) => Promise<void>;
    installUpdate: (update: string | string[] | { downloadUrls: string[]; downloadSha256ByUrl?: Record<string, string> }) => Promise<{ ok: true }>;
    installDifferentialUpdate?: (latestVersion?: string) => Promise<{ ok: true; mode: 'differential' }>;
    pauseUpdateDownload?: () => Promise<{ ok: boolean }>;
    resumeUpdateDownload?: () => Promise<{ ok: boolean }>;
    cancelUpdateDownload?: () => Promise<{ ok: boolean }>;
    clearUpdateCache?: () => Promise<{ ok: true; freedBytes: number; removedPaths: string[] }>;
    getDataDirectoryInfo?: () => Promise<DataDirectoryInfo>;
    openDataDirectory?: () => Promise<{ ok: true }>;
    chooseDataDirectory?: () => Promise<
      | { canceled: true }
      | { canceled: false; dataDir: string; copiedFiles: DataDirectoryCopyResult[]; restartRequired: true }
    >;
    createDataBackup?: () => Promise<{ canceled: true } | { canceled: false; filePath: string }>;
    restoreDataBackup?: () => Promise<
      | { canceled: true }
      | { canceled: false; restoredFrom: string; previousBackupPath: string }
    >;
    onUpdateDownloadProgress?: (callback: (progress: UpdateDownloadProgress) => void) => () => void;
  };
  professors: {
    list: (filters?: ProfessorFilters) => Promise<Professor[]>;
    create: (draft: ProfessorDraft) => Promise<Professor>;
    update: (id: string, draft: ProfessorDraft) => Promise<Professor>;
    trash: (id: string) => Promise<Professor>;
    restore: (id: string) => Promise<Professor>;
    purge: (id: string) => Promise<void>;
  };
  timeline: {
    list: (professorId: string) => Promise<TimelineEvent[]>;
    create: (draft: TimelineEventDraft) => Promise<TimelineEvent>;
  };
  notes: {
    list: () => Promise<DocumentNote[]>;
    save: (id: string | null, input: DocumentNoteInput) => Promise<DocumentNote | null>;
    delete: (id: string) => Promise<void>;
  };
  listOrderPreferences: {
    get: () => Promise<ListOrderPreferences>;
    save: (input: ListOrderPreferences) => Promise<ListOrderPreferences>;
  };
}

export interface UpdateDownloadProgress {
  mode?: 'differential' | 'full';
  status: 'downloading' | 'paused' | 'completed';
  transferredBytes: number;
  totalBytes?: number;
  bytesPerSecond: number;
  remainingSeconds?: number;
  percent?: number;
}

export interface DataDirectoryFileInfo {
  path: string;
  exists: boolean;
  size: number;
  updatedAt: number | null;
}

export interface DataDirectoryInfo {
  dataDir: string;
  defaultDataDir: string;
  isCustomDataDir: boolean;
  storePath: string;
  files: DataDirectoryFileInfo[];
}

export interface DataDirectoryCopyResult {
  fileName: string;
  from: string | null;
  to: string;
}

export function getDesktopApi(): VibeDesktopApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.vibe ?? null;
}

export function isDesktopRuntime() {
  return getDesktopApi() !== null;
}
