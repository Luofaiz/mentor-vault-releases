const { contextBridge, ipcRenderer } = require('electron');

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
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    save: (input) => ipcRenderer.invoke('profile:save', input),
  },
  timeline: {
    list: (professorId) => ipcRenderer.invoke('timeline:list', professorId),
    create: (draft) => ipcRenderer.invoke('timeline:create', draft),
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    save: (id, input) => ipcRenderer.invoke('templates:save', id, input),
    delete: (id) => ipcRenderer.invoke('templates:delete', id),
  },
  drafts: {
    list: () => ipcRenderer.invoke('drafts:list'),
    save: (id, input) => ipcRenderer.invoke('drafts:save', id, input),
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
  mailAccounts: {
    list: () => ipcRenderer.invoke('mail-accounts:list'),
    save: (id, input) => ipcRenderer.invoke('mail-accounts:save', id, input),
  },
  mail: {
    send: (payload) => ipcRenderer.invoke('mail:send', payload),
    listLogs: () => ipcRenderer.invoke('mail:logs'),
  },
  ai: {
    getSettings: () => ipcRenderer.invoke('ai:get-settings'),
    saveSettings: (input) => ipcRenderer.invoke('ai:save-settings', input),
    setActiveConfig: (id) => ipcRenderer.invoke('ai:set-active-config', id),
    deleteConfig: (id) => ipcRenderer.invoke('ai:delete-config', id),
    testSettings: (input) => ipcRenderer.invoke('ai:test-settings', input),
    generateDraft: (input) => ipcRenderer.invoke('ai:generate-draft', input),
    iterateSelection: (input) => ipcRenderer.invoke('ai:iterate-selection', input),
    getFeedback: (input) => ipcRenderer.invoke('ai:get-feedback', input),
    chat: (input) => ipcRenderer.invoke('ai:chat', input),
  },
});
