import { useEffect, useMemo, useRef, useState } from 'react';
import { AppSidebar } from './components/AppSidebar';
import { useProfessorDirectory } from './hooks/useProfessorDirectory';
import { getDesktopApi, type UpdateDownloadProgress } from './lib/desktop';
import { createTimelineEvent } from './lib/timeline';
import { DocumentNotesPage } from './pages/DocumentNotesPage';
import { ProfessorDirectoryPage } from './pages/ProfessorDirectoryPage';
import { SchoolDirectoryPage } from './pages/SchoolDirectoryPage';
import type { ProfessorDraft } from './types/professor';
import type { TimelineEventDraft } from './types/timeline';

type View = 'contacts' | 'schools' | 'notes' | 'trash';

interface AvailableUpdate {
  currentVersion: string;
  latestVersion: string;
  notes?: string;
  downloadUrls: string[];
  releaseUrl?: string;
  canInstallDifferential: boolean;
}

const CONTACTED_STATUSES = new Set([
  'Contacted',
  'Follow-Up Due',
  'Replied',
  '未读',
  '已读不回',
  '官回',
  '待面试',
  '待考核',
]);

function formatUpdateErrorMessage(error: unknown, prefix = '检查更新失败') {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const message = rawMessage
    .replace(/^Error invoking remote method 'system:(?:check-for-updates|install-update|install-differential-update)':\s*/i, '')
    .trim();
  const lowerMessage = message.toLowerCase();
  const format = (reason: string) => `${prefix}：${reason}`;

  if (/aborterror|aborted|timeout|timed out|超时/.test(lowerMessage)) {
    return format('更新地址访问超时。可能是当前网络访问 GitHub 或 CDN 较慢，请稍后重试，或直接打开 GitHub Release 下载新版。');
  }

  if (/failed to fetch|fetch failed|network|dns|enotfound|econnreset|econnrefused|etimedout|eai_again|socket/.test(lowerMessage)) {
    return format('网络连接失败。请检查网络、代理，或确认 GitHub/CDN 当前可以访问。');
  }

  if (/404|not found/.test(lowerMessage)) {
    return format('更新文件没有找到。可能是 latest.json 还没有发布，或 CDN 缓存还没有刷新。');
  }

  if (/401|unauthorized/.test(lowerMessage)) {
    return format('更新地址需要授权访问。请确认 Release 仓库和下载文件是公开的。');
  }

  if (/403|forbidden|rate limit|rate exceeded/.test(lowerMessage)) {
    return format('GitHub 暂时拒绝访问或触发访问频率限制，请稍后再试。');
  }

  if (/5\d{2}|bad gateway|service unavailable|gateway timeout/.test(lowerMessage)) {
    return format('更新服务器暂时不可用，请稍后重试。');
  }

  if (/json|manifest|version|unexpected token/.test(lowerMessage)) {
    return format('更新配置文件格式不正确。请检查 latest.json 里的版本号和下载链接。');
  }

  if (/url|protocol/.test(lowerMessage)) {
    return format('更新地址格式不正确。请检查 UPDATE_MANIFEST_URL 或 latest.json 的下载链接。');
  }

  return message ? format(message) : format('未知错误。');
}

function formatUpdateNotes(notes?: string) {
  return String(notes ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*\s]+/, '').trim())
    .find(Boolean);
}

function formatStorageSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
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

export default function App() {
  const [view, setView] = useState<View>('contacts');
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState<UpdateDownloadProgress | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isClearingUpdateCache, setIsClearingUpdateCache] = useState(false);
  const isCancelingUpdateDownloadRef = useRef(false);
  const transientUpdateMessageTimerRef = useRef<number | null>(null);
  const professorDirectory = useProfessorDirectory();
  const professorStats = useMemo(() => {
    const activeProfessors = professorDirectory.professors.filter((professor) => !professor.deletedAt);

    return {
      activeProfessorCount: activeProfessors.length,
      contactedProfessorCount: activeProfessors.filter((professor) => CONTACTED_STATUSES.has(professor.status)).length,
    };
  }, [professorDirectory.professors]);

  const showUpdateMessage = (message: string | null, options?: { transient?: boolean }) => {
    if (transientUpdateMessageTimerRef.current !== null) {
      window.clearTimeout(transientUpdateMessageTimerRef.current);
      transientUpdateMessageTimerRef.current = null;
    }

    setUpdateMessage(message);

    if (message && options?.transient) {
      transientUpdateMessageTimerRef.current = window.setTimeout(() => {
        setUpdateMessage((current) => (current === message ? null : current));
        transientUpdateMessageTimerRef.current = null;
      }, 3000);
    }
  };

  useEffect(() => {
    return () => {
      if (transientUpdateMessageTimerRef.current !== null) {
        window.clearTimeout(transientUpdateMessageTimerRef.current);
      }
    };
  }, []);

  const checkForUpdates = async (manual = true) => {
    const desktopApi = getDesktopApi();
    if (!desktopApi) {
      if (manual) {
        showUpdateMessage('网页预览模式不能检查桌面版更新。');
      }
      return;
    }

    setIsCheckingUpdates(true);
    isCancelingUpdateDownloadRef.current = false;
    setUpdateDownloadProgress(null);
    setAvailableUpdate(null);
    try {
      const result = await desktopApi.system.checkForUpdates();

      if (!result.configured) {
        if (manual) {
          showUpdateMessage('还没有配置更新地址。配置 UPDATE_MANIFEST_URL 后重新打包即可启用。');
        }
        return;
      }

      if (!result.updateAvailable) {
        if (manual) {
          showUpdateMessage(`当前已经是最新版：${result.currentVersion}`, { transient: true });
        }
        return;
      }

      const downloadUrls = result.downloadUrls?.length ? result.downloadUrls : result.downloadUrl ? [result.downloadUrl] : [];
      if (!result.latestVersion) {
        throw new Error('更新配置文件缺少最新版本号。');
      }

      setAvailableUpdate({
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        notes: formatUpdateNotes(result.notes),
        downloadUrls,
        releaseUrl: result.releaseUrl,
        canInstallDifferential: Boolean(desktopApi.system.installDifferentialUpdate),
      });
      showUpdateMessage(
        downloadUrls.length > 0
          ? `发现新版本 ${result.latestVersion}，当前版本 ${result.currentVersion}。请选择增量下载、全量下载或手动下载。`
          : `发现新版本 ${result.latestVersion}，当前版本 ${result.currentVersion}。没有找到安装包直链，可以打开发布页面手动下载。`,
      );
    } catch (error) {
      setUpdateDownloadProgress(null);
      if (isCancelingUpdateDownloadRef.current) {
        showUpdateMessage('已取消更新下载。');
        return;
      }
      if (manual) {
        showUpdateMessage(formatUpdateErrorMessage(error));
      }
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  useEffect(() => {
    void checkForUpdates(false);
  }, []);

  useEffect(() => {
    const desktopApi = getDesktopApi();
    return desktopApi?.system.onUpdateDownloadProgress?.((progress) => {
      setUpdateDownloadProgress(progress);
    });
  }, []);

  const downloadDifferentialUpdate = async () => {
    if (!availableUpdate) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.installDifferentialUpdate) {
      showUpdateMessage('当前版本暂不支持增量下载，请使用全量下载。');
      return;
    }

    isCancelingUpdateDownloadRef.current = false;
    setIsCheckingUpdates(true);
    setUpdateDownloadProgress(null);
    try {
      showUpdateMessage('正在进行增量下载。下载完成后会安装新版并关闭当前程序。');
      await desktopApi.system.installDifferentialUpdate(availableUpdate.latestVersion);
    } catch (error) {
      setUpdateDownloadProgress(null);
      if (isCancelingUpdateDownloadRef.current) {
        showUpdateMessage('已取消更新下载。');
        return;
      }
      showUpdateMessage(formatUpdateErrorMessage(error, '增量下载失败'));
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const downloadFullUpdate = async () => {
    if (!availableUpdate) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (!desktopApi) {
      return;
    }

    if (availableUpdate.downloadUrls.length === 0) {
      if (availableUpdate.releaseUrl) {
        await desktopApi.system.openExternalUrl(availableUpdate.releaseUrl);
      }
      return;
    }

    isCancelingUpdateDownloadRef.current = false;
    setIsCheckingUpdates(true);
    setUpdateDownloadProgress(null);
    try {
      showUpdateMessage('正在下载完整新版安装程序。下载完成后会启动安装程序并关闭当前程序。');
      await desktopApi.system.installUpdate(availableUpdate.downloadUrls);
    } catch (error) {
      setUpdateDownloadProgress(null);
      if (isCancelingUpdateDownloadRef.current) {
        showUpdateMessage('已取消更新下载。');
        return;
      }
      showUpdateMessage(formatUpdateErrorMessage(error, '全量下载失败'));
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const manualDownloadUpdate = async () => {
    if (!availableUpdate?.releaseUrl) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (desktopApi) {
      await desktopApi.system.openExternalUrl(availableUpdate.releaseUrl);
      return;
    }

    window.open(availableUpdate.releaseUrl, '_blank', 'noopener,noreferrer');
  };

  const pauseUpdateDownload = () => {
    const desktopApi = getDesktopApi();
    setUpdateDownloadProgress((current) =>
      current
        ? {
            ...current,
            status: 'paused',
            bytesPerSecond: 0,
            remainingSeconds: undefined,
          }
        : current,
    );
    void desktopApi?.system.pauseUpdateDownload?.();
  };

  const resumeUpdateDownload = () => {
    const desktopApi = getDesktopApi();
    setUpdateDownloadProgress((current) =>
      current
        ? {
            ...current,
            status: 'downloading',
          }
        : current,
    );
    void desktopApi?.system.resumeUpdateDownload?.();
  };

  const cancelUpdateDownload = () => {
    const desktopApi = getDesktopApi();
    isCancelingUpdateDownloadRef.current = true;
    setUpdateDownloadProgress(null);
    showUpdateMessage('已取消更新下载。');
    setIsCheckingUpdates(false);
    void desktopApi?.system.cancelUpdateDownload?.();
  };

  const clearUpdateCache = async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.clearUpdateCache) {
      showUpdateMessage('当前环境不支持清理更新缓存。');
      return;
    }

    setIsClearingUpdateCache(true);
    try {
      const result = await desktopApi.system.clearUpdateCache();
      showUpdateMessage(`已清理更新缓存，释放 ${formatStorageSize(result.freedBytes)}。`, {
        transient: result.freedBytes <= 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '未知错误');
      showUpdateMessage(`清理更新缓存失败：${message.replace(/^Error invoking remote method 'system:clear-update-cache':\s*/i, '')}`);
    } finally {
      setIsClearingUpdateCache(false);
    }
  };

  const openExternalUrl = (url: string) => {
    const desktopApi = getDesktopApi();
    if (desktopApi) {
      void desktopApi.system.openExternalUrl(url);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCreateProfessor = async (draft: ProfessorDraft) => {
    await professorDirectory.create(draft);
  };

  const handleUpdateProfessor = async (id: string, draft: ProfessorDraft) => {
    await professorDirectory.update(id, draft);
  };

  const handleCreateTimelineEvent = async (draft: TimelineEventDraft) => {
    await createTimelineEvent(draft);

    const professor = professorDirectory.professors.find((record) => record.id === draft.professorId);
    if (!professor) {
      return;
    }

    let nextStatus = professor.status;
    if (draft.type === 'Initial Outreach') {
      nextStatus = 'Contacted';
    } else if (draft.type === 'Follow-Up') {
      nextStatus = 'Follow-Up Due';
    } else if (draft.type === 'Reply') {
      nextStatus = 'Replied';
    }

    const nextFirstContactDate =
      draft.type === 'Initial Outreach' && !professor.firstContactDate
        ? draft.eventDate
        : professor.firstContactDate;

    const nextLastContactDate =
      draft.type === 'Note'
        ? professor.lastContactDate
        : professor.lastContactDate && professor.lastContactDate > draft.eventDate
          ? professor.lastContactDate
          : draft.eventDate;

    await professorDirectory.update(professor.id, {
      name: professor.name,
      title: professor.title,
      school: professor.school,
      college: professor.college,
      email: professor.email,
      homepage: professor.homepage,
      researchArea: professor.researchArea,
      status: nextStatus,
      tags: professor.tags,
      firstContactDate: nextFirstContactDate,
      lastContactDate: nextLastContactDate,
      notes: professor.notes,
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-paper text-ink selection:bg-accent/20">
      <AppSidebar
        view={view}
        contactedProfessorCount={professorStats.contactedProfessorCount}
        activeProfessorCount={professorStats.activeProfessorCount}
        onChangeView={setView}
        updateMessage={updateMessage}
        updateDownloadProgress={updateDownloadProgress}
        isCheckingUpdates={isCheckingUpdates}
        isClearingUpdateCache={isClearingUpdateCache}
        onCheckUpdates={() => void checkForUpdates(true)}
        onClearUpdateCache={() => void clearUpdateCache()}
        availableUpdate={availableUpdate}
        onDownloadDifferentialUpdate={() => void downloadDifferentialUpdate()}
        onDownloadFullUpdate={() => void downloadFullUpdate()}
        onManualDownloadUpdate={() => void manualDownloadUpdate()}
        onPauseUpdateDownload={pauseUpdateDownload}
        onResumeUpdateDownload={resumeUpdateDownload}
        onCancelUpdateDownload={cancelUpdateDownload}
        onOpenExternalUrl={openExternalUrl}
      />

      <main className="min-w-0 flex-1 flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(177,95,47,0.08),_transparent_28%),linear-gradient(180deg,#fcfbf8_0%,#f7f4ef_100%)]">
        {view === 'schools' ? (
          <SchoolDirectoryPage
            professors={professorDirectory.professors}
            isLoading={professorDirectory.isLoading}
            error={professorDirectory.error}
            onCreateProfessor={handleCreateProfessor}
            onUpdateProfessor={handleUpdateProfessor}
            onTrashProfessor={professorDirectory.moveToTrash}
            onCreateTimelineEvent={handleCreateTimelineEvent}
          />
        ) : view === 'notes' ? (
          <DocumentNotesPage />
        ) : (
          <ProfessorDirectoryPage
            mode={view === 'contacts' ? 'active' : 'trash'}
            professors={professorDirectory.professors}
            isLoading={professorDirectory.isLoading}
            error={professorDirectory.error}
            onCreateProfessor={handleCreateProfessor}
            onUpdateProfessor={handleUpdateProfessor}
            onTrashProfessor={professorDirectory.moveToTrash}
            onRestoreProfessor={professorDirectory.restore}
            onPurgeProfessor={professorDirectory.purge}
            onCreateTimelineEvent={handleCreateTimelineEvent}
            onImportProfessors={professorDirectory.importRecords}
          />
        )}
      </main>
    </div>
  );
}
