import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bot, Download, ExternalLink, FolderOpen, Github, HardDrive, LockKeyhole, Mail, Pause, Play, RefreshCw, RotateCcw, Save, Upload, X } from 'lucide-react';
import { useAiSettings } from '../hooks/useAiSettings';
import { useMailAccounts } from '../hooks/useMailAccounts';
import { useUserProfile } from '../hooks/useUserProfile';
import { DEFAULT_AI_CONFIG, getDefaultAISettingsInput, testAISettings } from '../lib/ai';
import { useSendLogs } from '../hooks/useSendLogs';
import { useI18n } from '../lib/i18n';
import { getDefault163AccountInput } from '../lib/mail';
import { getDesktopApi, isDesktopRuntime } from '../lib/desktop';
import type { DataDirectoryInfo, UpdateDownloadProgress } from '../lib/desktop';
import type { AIProvider, AISettingsInput } from '../types/ai';
import type { MailAccountInput } from '../types/mail';
import type { UserProfileSettingsInput } from '../types/profile';


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
  isClearingUpdateCache: boolean;
  availableUpdate: AvailableUpdateSummary | null;
  onCheckUpdates: () => void;
  onClearUpdateCache: () => void;
  onDownloadDifferentialUpdate: () => void;
  onDownloadFullUpdate: () => void;
  onManualDownloadUpdate: () => void;
  onPauseUpdateDownload: () => void;
  onResumeUpdateDownload: () => void;
  onCancelUpdateDownload: () => void;
  onOpenExternalUrl: (url: string) => void;
}

const PROJECT_GITHUB_URL = 'https://github.com/Luofaiz/mentor-vault';
const CSBAOYAN_DDL_URL = 'https://ddl.csbaoyan.top/';

export function SettingsPage({
  updateMessage,
  updateDownloadProgress,
  isCheckingUpdates,
  isClearingUpdateCache,
  availableUpdate,
  onCheckUpdates,
  onClearUpdateCache,
  onDownloadDifferentialUpdate,
  onDownloadFullUpdate,
  onManualDownloadUpdate,
  onPauseUpdateDownload,
  onResumeUpdateDownload,
  onCancelUpdateDownload,
  onOpenExternalUrl,
}: SettingsPageProps) {
  const { locale, t } = useI18n();
  const desktopReady = isDesktopRuntime();
  const {
    settings: aiSettings,
    isLoading: aiLoading,
    error: aiError,
    save: saveAiSettings,
    setActive: setActiveAiConfig,
    remove: removeAiConfig,
  } = useAiSettings();
  const { accounts, isLoading, error, save } = useMailAccounts();
  const { logs, isLoading: logsLoading, error: logsError } = useSendLogs();
  const { profile, isLoading: profileLoading, error: profileError, save: saveProfile } = useUserProfile();
  const [aiForm, setAiForm] = useState<AISettingsInput>(getDefaultAISettingsInput());
  const [aiSaveMessage, setAiSaveMessage] = useState<string | null>(null);
  const [aiMessageTone, setAiMessageTone] = useState<'success' | 'error'>('success');
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [profileForm, setProfileForm] = useState<UserProfileSettingsInput>({ fullName: '', university: '' });
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);
  const [profileMessageTone, setProfileMessageTone] = useState<'success' | 'error'>('success');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [form, setForm] = useState<MailAccountInput>(getDefault163AccountInput());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dataInfo, setDataInfo] = useState<DataDirectoryInfo | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataMessageTone, setDataMessageTone] = useState<'success' | 'error'>('success');
  const [isLoadingDataInfo, setIsLoadingDataInfo] = useState(false);
  const [isChoosingDataDir, setIsChoosingDataDir] = useState(false);
  const [isBackingUpData, setIsBackingUpData] = useState(false);
  const [isRestoringData, setIsRestoringData] = useState(false);

  const activeAiConfig = aiSettings.configs.find((config) => config.isActive) ?? null;
  const defaultAccount = useMemo(
    () => accounts.find((account) => account.isDefault) ?? accounts[0] ?? null,
    [accounts],
  );

  useEffect(() => {
    if (!activeAiConfig) {
      return;
    }

    setAiForm({
      id: activeAiConfig.id,
      name: activeAiConfig.name,
      provider: activeAiConfig.provider,
      baseUrl: activeAiConfig.baseUrl,
      model: activeAiConfig.model,
      apiKey: '',
    });
  }, [activeAiConfig]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setProfileForm({
      fullName: profile.fullName,
      university: profile.university,
    });
  }, [profile]);


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
      setDataMessage(loadError instanceof Error ? loadError.message : '\u52a0\u8f7d\u6570\u636e\u76ee\u5f55\u5931\u8d25\u3002');
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
      setDataMessage(openError instanceof Error ? openError.message : '\u6253\u5f00\u6570\u636e\u76ee\u5f55\u5931\u8d25\u3002');
    }
  };

  const handleChooseDataDirectory = async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.chooseDataDirectory) {
      setDataMessageTone('error');
      setDataMessage('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u4fee\u6539\u6570\u636e\u76ee\u5f55\u3002');
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
      setDataMessage(`\u6570\u636e\u76ee\u5f55\u5df2\u5207\u6362\u5230\uff1a${result.dataDir}\u3002\u5f53\u524d\u6570\u636e\u5df2\u590d\u5236\u8fc7\u53bb\uff0c\u5efa\u8bae\u91cd\u542f\u7a0b\u5e8f\u540e\u7ee7\u7eed\u4f7f\u7528\u3002`);
      await loadDataDirectoryInfo();
    } catch (chooseError) {
      setDataMessageTone('error');
      setDataMessage(chooseError instanceof Error ? chooseError.message : '\u4fee\u6539\u6570\u636e\u76ee\u5f55\u5931\u8d25\u3002');
    } finally {
      setIsChoosingDataDir(false);
    }
  };

  const handleCreateDataBackup = async () => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.createDataBackup) {
      setDataMessageTone('error');
      setDataMessage('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u5907\u4efd\u6570\u636e\u3002');
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
      setDataMessage(`\u5907\u4efd\u5df2\u4fdd\u5b58\uff1a${result.filePath}`);
    } catch (backupError) {
      setDataMessageTone('error');
      setDataMessage(backupError instanceof Error ? backupError.message : '\u5907\u4efd\u6570\u636e\u5931\u8d25\u3002');
    } finally {
      setIsBackingUpData(false);
    }
  };

  const handleRestoreDataBackup = async () => {
    const confirmed = window.confirm('\u6062\u590d\u4f1a\u7528\u5907\u4efd\u6587\u4ef6\u8986\u76d6\u5f53\u524d\u6570\u636e\u3002\u7a0b\u5e8f\u4f1a\u5148\u81ea\u52a8\u5907\u4efd\u5f53\u524d\u6570\u636e\uff0c\u786e\u8ba4\u7ee7\u7eed\u5417\uff1f');
    if (!confirmed) {
      return;
    }

    const desktopApi = getDesktopApi();
    if (!desktopApi?.system.restoreDataBackup) {
      setDataMessageTone('error');
      setDataMessage('\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u6062\u590d\u6570\u636e\u3002');
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
      setDataMessage(`\u6570\u636e\u5df2\u6062\u590d\u3002\u6062\u590d\u524d\u7684\u6570\u636e\u5df2\u5907\u4efd\u5230\uff1a${result.previousBackupPath}\u3002\u5efa\u8bae\u91cd\u542f\u7a0b\u5e8f\u5237\u65b0\u9875\u9762\u6570\u636e\u3002`);
      await loadDataDirectoryInfo();
    } catch (restoreError) {
      setDataMessageTone('error');
      setDataMessage(restoreError instanceof Error ? restoreError.message : '\u6062\u590d\u6570\u636e\u5931\u8d25\u3002');
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

  const updateAiProvider = (provider: AIProvider) => {
    setAiForm((current) => ({
      ...current,
      provider,
      baseUrl: DEFAULT_AI_CONFIG[provider].baseUrl,
      model: DEFAULT_AI_CONFIG[provider].model,
    }));
  };

  const updateAiField = <K extends keyof AISettingsInput>(key: K, value: AISettingsInput[K]) => {
    setAiForm((current) => ({ ...current, [key]: value }));
  };

  const handleSaveAi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const editingConfig = aiForm.id ? aiSettings.configs.find((config) => config.id === aiForm.id) ?? null : null;
    if (!aiForm.apiKey.trim() && !editingConfig?.hasApiKey) {
      setAiMessageTone('error');
      setAiSaveMessage(t('aiApiKeyRequired'));
      return;
    }

    setIsSavingAi(true);
    setAiSaveMessage(null);
    try {
      const record = await saveAiSettings(aiForm);
      const nextActiveConfig = record.configs.find((config) => config.isActive) ?? null;
      setAiMessageTone('success');
      setAiSaveMessage(t('aiSettingsSaved'));
      if (nextActiveConfig) {
        setAiForm({
          id: nextActiveConfig.id,
          name: nextActiveConfig.name,
          provider: nextActiveConfig.provider,
          baseUrl: nextActiveConfig.baseUrl,
          model: nextActiveConfig.model,
          apiKey: '',
        });
      }
    } catch (saveError) {
      setAiMessageTone('error');
      setAiSaveMessage(saveError instanceof Error ? saveError.message : t('failedToSaveAiSettings'));
    } finally {
      setIsSavingAi(false);
    }
  };

  const handleTestAi = async () => {
    setAiSaveMessage(null);
    setIsTestingAi(true);
    try {
      const result = await testAISettings({
        ...aiForm,
        locale,
      });
      setAiMessageTone('success');
      setAiSaveMessage(`${t('aiConnectionSuccess')} ${result.preview}`);
    } catch (testError) {
      setAiMessageTone('error');
      setAiSaveMessage(testError instanceof Error ? testError.message : t('aiDraftFailed'));
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleCreateNewAiConfig = () => {
    setAiSaveMessage(null);
    setAiForm({
      ...getDefaultAISettingsInput('gemini'),
      id: null,
      name: `配置 ${aiSettings.configs.length + 1}`,
    });
  };

  const handleLoadAiConfig = (configId: string) => {
    const config = aiSettings.configs.find((item) => item.id === configId);
    if (!config) {
      return;
    }

    setAiSaveMessage(null);
    setAiForm({
      id: config.id,
      name: config.name,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: '',
    });
  };

  const handleActivateAiConfig = async (configId: string) => {
    setAiSaveMessage(null);
    try {
      const record = await setActiveAiConfig(configId);
      const config = record.configs.find((item) => item.id === configId);
      if (config) {
        setAiForm({
          id: config.id,
          name: config.name,
          provider: config.provider,
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: '',
        });
      }
    } catch (activateError) {
      setAiMessageTone('error');
      setAiSaveMessage(activateError instanceof Error ? activateError.message : t('failedToSaveAiSettings'));
    }
  };

  const handleDeleteAiConfig = async (configId: string) => {
    setAiSaveMessage(null);
    try {
      const record = await removeAiConfig(configId);
      const nextActiveConfig = record.configs.find((config) => config.isActive) ?? null;
      setAiMessageTone('success');
      setAiSaveMessage(t('aiConfigDeleted'));
      if (nextActiveConfig) {
        setAiForm({
          id: nextActiveConfig.id,
          name: nextActiveConfig.name,
          provider: nextActiveConfig.provider,
          baseUrl: nextActiveConfig.baseUrl,
          model: nextActiveConfig.model,
          apiKey: '',
        });
      } else {
        setAiForm(getDefaultAISettingsInput());
      }
    } catch (deleteError) {
      setAiMessageTone('error');
      setAiSaveMessage(deleteError instanceof Error ? deleteError.message : t('failedToDeleteAiConfig'));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await save(null, form);
      setSaveMessage(t('accountSaved'));
      setForm(getDefault163AccountInput());
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : t('failedToSaveMailAccount'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = <K extends keyof MailAccountInput>(key: K, value: MailAccountInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateProfileField = <K extends keyof UserProfileSettingsInput>(key: K, value: UserProfileSettingsInput[K]) => {
    setProfileForm((current) => ({ ...current, [key]: value }));
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileSaveMessage(null);
    try {
      const record = await saveProfile(profileForm);
      setProfileMessageTone('success');
      setProfileSaveMessage(t('profileSaved'));
      setProfileForm({
        fullName: record.fullName,
        university: record.university,
      });
    } catch (saveError) {
      setProfileMessageTone('error');
      setProfileSaveMessage(saveError instanceof Error ? saveError.message : t('failedToSaveProfile'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 md:px-12">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">设置</p>
          <h1 className="mt-3 text-4xl font-serif font-medium tracking-tight text-stone-900">设置中心</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-500">
            集中管理数据目录、更新、备份恢复、外部链接、邮箱账号和 AI 配置。
          </p>
        </div>

        {!desktopReady && (
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 px-6 py-5 text-sm leading-7 text-amber-800">
            {t('webPreviewOnly')}
          </div>
        )}

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
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
                集中管理数据目录、备份恢复、更新检查和常用外部入口。数据文件不会放进 GitHub Release。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenExternalUrl(PROJECT_GITHUB_URL)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              >
                <Github className="h-4 w-4" />
                <span>打开 GitHub</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenExternalUrl(CSBAOYAN_DDL_URL)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
              >
                <ExternalLink className="h-4 w-4" />
                <span>CS 保研 DDL</span>
              </button>
            </div>
          </div>

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
                <button
                  type="button"
                  onClick={() => void handleOpenDataDirectory()}
                  disabled={!desktopReady}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>打开目录</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleChooseDataDirectory()}
                  disabled={!desktopReady || isChoosingDataDir}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>{isChoosingDataDir ? '选择中...' : '修改目录'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateDataBackup()}
                  disabled={!desktopReady || isBackingUpData}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  <span>{isBackingUpData ? '备份中...' : '备份数据'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRestoreDataBackup()}
                  disabled={!desktopReady || isRestoringData}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  <span>{isRestoringData ? '恢复中...' : '恢复数据'}</span>
                </button>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-stone-200 bg-stone-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">更新</p>
              <p className="mt-2 text-sm leading-6 text-stone-500">检查新版本、清理下载缓存，也可以手动打开发布页。</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={onCheckUpdates}
                  disabled={!desktopReady || isCheckingUpdates}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${isCheckingUpdates ? 'animate-spin' : ''}`} />
                  <span>{isCheckingUpdates ? t('checkingUpdates') : t('checkUpdates')}</span>
                </button>
                <button
                  type="button"
                  onClick={onClearUpdateCache}
                  disabled={!desktopReady || isClearingUpdateCache || Boolean(updateDownloadProgress)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw className={`h-4 w-4 ${isClearingUpdateCache ? 'animate-spin' : ''}`} />
                  <span>{isClearingUpdateCache ? '清理中' : '清理更新缓存'}</span>
                </button>
              </div>

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

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('personalProfile')}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{t('personalProfileTitle')}</h2>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-500">{t('personalProfileDesc')}</p>

              <form onSubmit={handleSaveProfile} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-stone-600">{t('yourName')}</span>
                  <input
                    value={profileForm.fullName}
                    onChange={(event) => updateProfileField('fullName', event.target.value)}
                    placeholder={t('yourNamePlaceholder')}
                    className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-stone-600">{t('yourUniversity')}</span>
                  <input
                    value={profileForm.university}
                    onChange={(event) => updateProfileField('university', event.target.value)}
                    placeholder={t('yourUniversityPlaceholder')}
                    className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                  />
                </label>

                {(profileError || profileSaveMessage) && (
                  <div className={`md:col-span-2 rounded-[1.5rem] px-4 py-4 text-sm ${(profileError || profileMessageTone === 'error') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {profileError || profileSaveMessage}
                  </div>
                )}

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    <span>{isSavingProfile ? t('saving') : t('saveProfile')}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-[1.75rem] border border-stone-200 bg-stone-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('personalProfile')}</p>
              {profileLoading ? (
                <p className="mt-4 text-sm text-stone-400">{t('loadingAccounts')}</p>
              ) : !profile || (!profile.fullName && !profile.university) ? (
                <p className="mt-4 text-sm leading-7 text-stone-500">{t('noProfileSaved')}</p>
              ) : (
                <p className="mt-4 text-sm leading-7 text-stone-600">
                  {t('profileReady', {
                    name: profile.fullName || '-',
                    university: profile.university || '-',
                  })}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10">
                  <Bot className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('aiAssistant')}</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{t('aiSettingsTitle')}</h2>
                </div>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-500">{t('aiSettingsDesc')}</p>

              <form onSubmit={handleSaveAi} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-stone-600">{t('configName')}</span>
                  <input
                    value={aiForm.name}
                    onChange={(event) => updateAiField('name', event.target.value)}
                    placeholder={t('configNamePlaceholder')}
                    className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-stone-600">{t('aiProvider')}</span>
                  <select
                    value={aiForm.provider}
                    onChange={(event) => updateAiProvider(event.target.value as AIProvider)}
                    className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                  >
                    <option value="gemini">{t('gemini')}</option>
                    <option value="openai">{t('openai')}</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-stone-600">{t('aiModel')}</span>
                  <input
                    value={aiForm.model}
                    onChange={(event) => updateAiField('model', event.target.value)}
                    className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-stone-600">{t('apiBaseUrl')}</span>
                  <input
                    value={aiForm.baseUrl}
                    onChange={(event) => updateAiField('baseUrl', event.target.value)}
                    className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-stone-600">{t('apiKey')}</span>
                  <input
                    type="password"
                    value={aiForm.apiKey}
                    onChange={(event) => updateAiField('apiKey', event.target.value)}
                    placeholder={t('apiKeyPlaceholder')}
                    className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                  />
                </label>

                <div className="md:col-span-2 rounded-[1.5rem] bg-stone-50 px-4 py-4 text-sm leading-7 text-stone-600">
                  {t('aiProviderHint')}
                </div>

                {(aiError || aiSaveMessage) && (
                  <div className={`md:col-span-2 rounded-[1.5rem] px-4 py-4 text-sm ${(aiError || aiMessageTone === 'error') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {aiError || aiSaveMessage}
                  </div>
                )}

                <div className="md:col-span-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCreateNewAiConfig}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
                  >
                    <span>{t('createNewConfig')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTestAi()}
                    disabled={!desktopReady || isTestingAi}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-5 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Bot className="h-4 w-4" />
                    <span>{isTestingAi ? t('testingAiConnection') : t('testAiConnection')}</span>
                  </button>
                  <button
                    type="submit"
                    disabled={!desktopReady || isSavingAi}
                    className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    <span>{isSavingAi ? t('saving') : t('saveAiSettings')}</span>
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-[1.75rem] border border-stone-200 bg-stone-50 px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('configuredAi')}</p>
              {aiLoading ? (
                <p className="mt-4 text-sm text-stone-400">{t('loadingAccounts')}</p>
              ) : aiSettings.configs.length === 0 ? (
                <p className="mt-4 text-sm leading-7 text-stone-500">{t('noAiConfigs')}</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {aiSettings.configs.map((config) => (
                    <div key={config.id} className="rounded-[1.25rem] border border-stone-200 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">{config.name}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-400">
                            {config.provider === 'gemini' ? t('gemini') : t('openai')} · {config.model}
                          </p>
                        </div>
                        {config.isActive && (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            {t('activeConfig')}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-stone-500">{config.baseUrl}</p>
                      <p className="mt-2 text-sm text-stone-500">{t('apiKeyHintSaved', { hint: config.apiKeyHint || t('hidden') })}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadAiConfig(config.id)}
                          className="rounded-full border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
                        >
                          {t('edit')}
                        </button>
                        {!config.isActive && (
                          <button
                            type="button"
                            onClick={() => void handleActivateAiConfig(config.id)}
                            className="rounded-full border border-stone-200 px-3 py-2 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-50"
                          >
                            {t('useThisConfig')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDeleteAiConfig(config.id)}
                          className="rounded-full border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
                        >
                          {t('deleteConfig')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10">
                <Mail className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('smtpProvider163')}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{t('addMailboxAccount')}</h2>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-stone-600">{t('email163')}</span>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  placeholder={t('email163Placeholder')}
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-stone-600">{t('displayName')}</span>
                <input
                  value={form.displayName}
                  onChange={(event) => updateField('displayName', event.target.value)}
                  placeholder={t('displayNamePlaceholder')}
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-stone-600">{t('smtpHost')}</span>
                <input
                  value={form.smtpHost}
                  onChange={(event) => updateField('smtpHost', event.target.value)}
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-stone-600">{t('port')}</span>
                <input
                  type="number"
                  value={form.smtpPort}
                  onChange={(event) => updateField('smtpPort', Number(event.target.value))}
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-stone-600">{t('smtpAuthorizationCode')}</span>
                <input
                  type="password"
                  required
                  value={form.authorizationCode}
                  onChange={(event) => updateField('authorizationCode', event.target.value)}
                  placeholder={t('authorizationPlaceholder')}
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 outline-none transition-colors focus:border-accent"
                />
              </label>

              <label className="flex items-center gap-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.secure}
                  onChange={(event) => updateField('secure', event.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-accent focus:ring-accent"
                />
                <span className="text-sm text-stone-600">{t('useSecureConnection')}</span>
              </label>

              <label className="flex items-center gap-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(event) => updateField('isDefault', event.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-accent focus:ring-accent"
                />
                <span className="text-sm text-stone-600">{t('setAsDefaultSendingAccount')}</span>
              </label>

              <div className="md:col-span-2 rounded-[1.5rem] bg-stone-50 px-4 py-4 text-sm leading-7 text-stone-600">
                {t('smtpRecommendation')}
              </div>

              {(error || saveMessage) && (
                <div className={`md:col-span-2 rounded-[1.5rem] px-4 py-4 text-sm ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {error || saveMessage}
                </div>
              )}

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={!desktopReady || isSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? t('saving') : t('saveAccount')}</span>
                </button>
              </div>
            </form>
          </section>

          <div className="space-y-8">
            <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100">
                <LockKeyhole className="h-5 w-5 text-stone-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('fromAccount')}</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{t('configuredSenders')}</h2>
              </div>
            </div>

            {isLoading ? (
              <p className="mt-4 text-sm text-stone-400">{t('loadingAccounts')}</p>
            ) : accounts.length === 0 ? (
              <p className="mt-4 text-sm leading-7 text-stone-500">{t('noMailAccountsSaved')}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {accounts.map((account) => (
                    <div key={account.id} className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">{account.email}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-400">
                            {account.displayName || t('noDisplayName')} · {account.smtpHost}:{account.smtpPort}
                          </p>
                        </div>
                        {account.isDefault && (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            {t('defaultBadge')}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-sm text-stone-500">
                        {t('authCodeHint', { hint: account.authCodeHint || t('hidden') })}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {defaultAccount && (
                <div className="mt-5 rounded-[1.5rem] bg-accent/5 px-4 py-4 text-sm leading-7 text-stone-600">
                  {t('currentDefaultSender', { email: defaultAccount.email })}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('sendLogs')}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">{t('recentOutcomes')}</h2>
              {logsError && <p className="mt-4 text-sm text-rose-700">{logsError}</p>}
              {logsLoading ? (
                <p className="mt-4 text-sm text-stone-400">{t('loadingSendLogs')}</p>
              ) : logs.length === 0 ? (
                <p className="mt-4 text-sm leading-7 text-stone-500">{t('noSendAttempts')}</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {logs.slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-[1.5rem] border border-stone-200 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-stone-900">{log.to}</p>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${log.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {log.status === 'success' ? t('success') : t('failed')}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-stone-500">{log.subject}</p>
                      {log.errorMessage && <p className="mt-2 text-sm text-rose-700">{log.errorMessage}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
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
    return `${remainingSeconds} ?`;
  }

  return `${minutes} ? ${remainingSeconds} ?`;
}

function formatDataTime(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) {
    return '--';
  }

  return new Date(value as number).toLocaleString('zh-CN', { hour12: false });
}
