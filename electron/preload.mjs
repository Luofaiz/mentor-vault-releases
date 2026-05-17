import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vibe', {
  system: {
    getRuntimeInfo: () => ipcRenderer.invoke('system:get-runtime-info'),
    checkForUpdates: () => ipcRenderer.invoke('system:check-for-updates'),
    openExternalUrl: (url) => ipcRenderer.invoke('system:open-external-url', url),
    installUpdate: (downloadUrl) => ipcRenderer.invoke('system:install-update', downloadUrl),
    installDifferentialUpdate: (latestVersion) => ipcRenderer.invoke('system:install-differential-update', latestVersion),
    pauseUpdateDownload: () => ipcRenderer.invoke('system:pause-update-download'),
    resumeUpdateDownload: () => ipcRenderer.invoke('system:resume-update-download'),
    cancelUpdateDownload: () => ipcRenderer.invoke('system:cancel-update-download'),
    clearUpdateCache: () => ipcRenderer.invoke('system:clear-update-cache'),
    getDataDirectoryInfo: () => ipcRenderer.invoke('system:get-data-directory-info'),
    openDataDirectory: () => ipcRenderer.invoke('system:open-data-directory'),
    chooseDataDirectory: () => ipcRenderer.invoke('system:choose-data-directory'),
    createDataBackup: () => ipcRenderer.invoke('system:create-data-backup'),
    restoreDataBackup: () => ipcRenderer.invoke('system:restore-data-backup'),
    onUpdateDownloadProgress: (callback) => {
      const listener = (_event, progress) => callback(progress);
      ipcRenderer.on('system:update-download-progress', listener);
      return () => ipcRenderer.removeListener('system:update-download-progress', listener);
    },
  },
  professors: {
    list: (filters) => ipcRenderer.invoke('professors:list', filters),
    create: (draft) => ipcRenderer.invoke('professors:create', draft),
    update: (id, draft) => ipcRenderer.invoke('professors:update', id, draft),
    trash: (id) => ipcRenderer.invoke('professors:trash', id),
    restore: (id) => ipcRenderer.invoke('professors:restore', id),
    purge: (id) => ipcRenderer.invoke('professors:purge', id),
  },
  timeline: {
    list: (professorId) => ipcRenderer.invoke('timeline:list', professorId),
    create: (draft) => ipcRenderer.invoke('timeline:create', draft),
  },
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    save: (id, input) => ipcRenderer.invoke('notes:save', id, input),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
  },
  listOrderPreferences: {
    get: () => ipcRenderer.invoke('list-order-preferences:get'),
    save: (input) => ipcRenderer.invoke('list-order-preferences:save', input),
  },
});
