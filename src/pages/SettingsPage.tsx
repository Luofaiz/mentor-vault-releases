import { useEffect, useState } from 'react';
import { Download, FolderOpen, HardDrive, Pause, Play, Upload, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { getDesktopApi, isDesktopRuntime } from '../lib/desktop';
import type { DataDirectoryInfo, UpdateDownloadProgress } from '../lib/desktop';

interface AvailableUpdateSummary {
  notes?: string;
  downloadUrls: string[];
  releaseUrl?: string;
  canInstallDifferential: boolean;
}

interface SettingsPageProps {
  updateMessage: string | null;
  updateDownloadProgress: UpdateDownloadProgress | null;
  isCheckingUpdates: boolean;
  availableUpdate: AvailableUpdateSummary | null;
  onDownloadDifferentialUpdate: () => void;
  onDownloadFullUpdate: () => void;
  onManualDownloadUpdate: () => void;
  onPauseUpdateDownload: () => void;
  onResumeUpdateDownload: () => void;
  onCancelUpdateDownload: () => void;
}

export function SettingsPage({
  updateMessage,
  updateDownloadProgress,
  isCheckingUpdates,
  availableUpdate,
  onDownloadDifferentialUpdate,
  onDownloadFullUpdate,
  onManualDownloadUpdate,
  onPauseUpdateDownload,
  onResumeUpdateDownload,
  onCancelUpdateDownload,
}: SettingsPageProps) {
  const { t } = useI18n();
  const desktopReady = isDesktopRuntime();
  const [dataInfo, setDataInfo] = useState<DataDirectoryInfo | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataMessageTone, setDataMessageTone] = useState<'success' | 'error'>('success');
  const [isLoadingDataInfo, setIsLoadingDataInfo] = useState(false);
  const [isChoosingDataDir, setIsChoosingDataDir] = useState(false);
  const [isBackingUpData, setIsBackingUpData] = useState(false);
  const [isRestoringData, setIsRestoringData] = useState(false);

  const loadDataDirectoryInfo = async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.getDataDirectoryInfo) {
      return;
    }

    setIsLoadingDataInfo(true);
    try {
      setDataInfo(await desktopApi.system.getDataDirectoryInfo());
    } catch (loadError) {
      setDataMessageTone('error');
      setDataMessage(loadError instanceof Error ? loadError.message : '加载数据目录失败。');
    } finally {
      setIsLoadingDataInfo(false);
    }
  };

  useEffect(() => {
    void loadDataDirectoryInfo();
  }, []);

  const handleOpenDataDirectory = async () => {
    const desktopApi = getDesktopApi();
    try {
      await desktopApi?.system.openDataDirectory?.();
    } catch (openError) {
      setDataMessageTone('error');
      setDataMessage(openError instanceof Error ? openError.message : '打开数据目录失败。');
    }
  };

  const handleChooseDataDirectory = async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.chooseDataDirectory) {
      setDataMessageTone('error');
      setDataMessage('当前环境不支持修改数据目录。');
      return;
    }

    setIsChoosingDataDir(true);
    setDataMessage(null);
    try {
      const result = await desktopApi.system.chooseDataDirectory();
      if (!('dataDir' in result)) {
        return;
      }
      setDataMessageTone('success');
      setDataMessage(`数据目录已切换到：${result.dataDir}。当前数据已复制过去，建议重启程序后继续使用。`);
      await loadDataDirectoryInfo();
    } catch (chooseError) {
      setDataMessageTone('error');
      setDataMessage(chooseError instanceof Error ? chooseError.message : '修改数据目录失败。');
    } finally {
      setIsChoosingDataDir(false);
    }
  };

  const handleCreateDataBackup = async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.createDataBackup) {
      setDataMessageTone('error');
      setDataMessage('当前环境不支持备份数据。');
      return;
    }

    setIsBackingUpData(true);
    setDataMessage(null);
    try {
      const result = await desktopApi.system.createDataBackup();
      if (!('filePath' in result)) {
        return;
      }
      setDataMessageTone('success');
      setDataMessage(`备份已保存：${result.filePath}`);
    } catch (backupError) {
      setDataMessageTone('error');
      setDataMessage(backupError instanceof Error ? backupError.message : '备份数据失败。');
    } finally {
      setIsBackingUpData(false);
    }
  };

  const handleRestoreDataBackup = async () => {
    const confirmed = window.confirm('恢复会用备份文件覆盖当前数据。程序会先自动备份当前数据，确认继续吗？');
    if (!confirmed) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.restoreDataBackup) {
      setDataMessageTone('error');
      setDataMessage('当前环境不支持恢复数据。');
      return;
    }

    setIsRestoringData(true);
    setDataMessage(null);
    try {
      const result = await desktopApi.system.restoreDataBackup();
      if (!('previousBackupPath' in result)) {
        return;
      }
      setDataMessageTone('success');
      setDataMessage(`数据已恢复。恢复前的数据已备份到：${result.previousBackupPath}。建议重启程序刷新页面数据。`);
      await loadDataDirectoryInfo();
    } catch (restoreError) {
      setDataMessageTone('error');
      setDataMessage(restoreError instanceof Error ? restoreError.message : '恢复数据失败。');
    } finally {
      setIsRestoringData(false);
    }
  };

  const isUpdateDownloadPaused = updateDownloadProgress?.status === 'paused';
  const isDifferentialUpdate = updateDownloadProgress?.mode === 'differential';
  const progressPercent = updateDownloadProgress?.percent ?? null;
  const progressWidth = progressPercent === null ? 100 : Math.max(0, Math.min(100, progressPercent));
  const canChooseUpdateDownload = Boolean(availableUpdate && !updateDownloadProgress && !isCheckingUpdates);
  const progressLabel = isUpdateDownloadPaused ? '已暂停' : progressPercent === null ? '正在下载' : `${progressPercent}%`;

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 md:px-12">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">设置</p>
          <h1 className="mt-3 text-4xl font-serif font-medium tracking-tight text-stone-900">设置中心</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-500">
            管理本地数据目录、备份恢复和程序更新。
          </p>
        </div>

        {!desktopReady && (
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-5 text-sm leading-7 text-amber-800">
            {t('webPreviewOnly')}
          </div>
        )}

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10">
              <HardDrive className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">应用与数据</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">数据、更新与备份</h2>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-500">
            数据只保存在本地，GitHub Release 只包含安装程序，不包含你的导师资料和笔记。
          </p>

          <div className="mt-6 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[1.75rem] border border-stone-200 bg-stone-50 px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">数据目录</p>
                  <p className="mt-2 break-all text-sm leading-6 text-stone-700">
                    {isLoadingDataInfo ? '加载中...' : dataInfo?.dataDir ?? '尚未读取到数据目录'}
                  </p>
                  {dataInfo && (
                    <p className="mt-2 text-xs text-stone-400">
                      {dataInfo.isCustomDataDir ? '正在使用自定义目录' : '正在使用默认目录'} · 数据文件：{dataInfo.storePath}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  数据
                </span>
              </div>

              {dataInfo?.files?.length ? (
                <div className="mt-4 grid gap-2">
                  {dataInfo.files.map((file) => (
                    <div key={file.path} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-stone-700">{file.path.split(/[\\/]/).pop()}</span>
                        <span className="text-stone-400">{file.exists ? formatBytes(file.size) : '未找到'}</span>
                      </div>
                      <p className="mt-1 break-all text-xs text-stone-400">{file.path}</p>
                      <p className="mt-1 text-xs text-stone-400">修改于 {formatDataTime(file.updatedAt)}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {dataMessage && (
                <div className={`mt-4 rounded-[1.5rem] px-4 py-4 text-sm ${dataMessageTone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {dataMessage}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => void handleOpenDataDirectory()} disabled={!desktopReady} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60">
                  <FolderOpen className="h-4 w-4" />
                  <span>打开目录</span>
                </button>
                <button type="button" onClick={() => void handleChooseDataDirectory()} disabled={!desktopReady || isChoosingDataDir} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60">
                  <FolderOpen className="h-4 w-4" />
                  <span>{isChoosingDataDir ? '选择中...' : '修改目录'}</span>
                </button>
                <button type="button" onClick={() => void handleCreateDataBackup()} disabled={!desktopReady || isBackingUpData} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60">
                  <Download className="h-4 w-4" />
                  <span>{isBackingUpData ? '备份中...' : '备份数据'}</span>
                </button>
                <button type="button" onClick={() => void handleRestoreDataBackup()} disabled={!desktopReady || isRestoringData} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60">
                  <Upload className="h-4 w-4" />
                  <span>{isRestoringData ? '恢复中...' : '恢复数据'}</span>
                </button>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-stone-200 bg-stone-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">更新</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">检查新版本、清理下载缓存，也可以手动打开发布页。</p>
              {updateMessage && (
                <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-stone-600">
                  <p>{updateMessage}</p>
                  {availableUpdate?.notes && !updateDownloadProgress && (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-stone-400">{availableUpdate.notes}</p>
                  )}
                  {canChooseUpdateDownload && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availableUpdate?.canInstallDifferential && (
                        <button type="button" onClick={onDownloadDifferentialUpdate} className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-4 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100">
                          增量下载
                        </button>
                      )}
                      {availableUpdate?.downloadUrls.length ? (
                        <button type="button" onClick={onDownloadFullUpdate} className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-4 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100">
                          全量下载
                        </button>
                      ) : null}
                      {availableUpdate?.releaseUrl ? (
                        <button type="button" onClick={onManualDownloadUpdate} className="inline-flex h-10 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-4 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100">
                          手动下载
                        </button>
                      ) : null}
                    </div>
                  )}
                  {updateDownloadProgress && (
                    <div className="mt-3 space-y-2">
                      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                        <div className={`h-full rounded-full bg-stone-900 transition-all ${progressPercent === null ? 'animate-pulse' : ''}`} style={{ width: `${progressWidth}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs font-medium text-stone-600">
                        <span>{progressLabel}</span>
                        <span>{formatBytes(updateDownloadProgress.transferredBytes)} / {formatBytes(updateDownloadProgress.totalBytes)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs text-stone-400">
                        <span>{formatBytes(updateDownloadProgress.bytesPerSecond)}/s</span>
                        <span>剩余 {formatDuration(updateDownloadProgress.remainingSeconds)}</span>
                      </div>
                      {updateDownloadProgress.status !== 'completed' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {!isDifferentialUpdate && (
                            <button type="button" onClick={isUpdateDownloadPaused ? onResumeUpdateDownload : onPauseUpdateDownload} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100">
                              {isUpdateDownloadPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                              <span>{isUpdateDownloadPaused ? '继续' : '暂停'}</span>
                            </button>
                          )}
                          <button type="button" onClick={onCancelUpdateDownload} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100">
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
          </div>
        </section>
      </div>
    </div>
  );
}

function formatBytes(bytes?: number) {
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

function formatDuration(seconds?: number) {
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

function formatDataTime(value: number | null) {
  if (!value) {
    return '未记录';
  }
  return new Date(value).toLocaleString('zh-CN');
}
