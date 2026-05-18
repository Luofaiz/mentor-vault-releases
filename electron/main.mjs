import { app, BrowserWindow, dialog, ipcMain, net, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import electronUpdater from 'electron-updater';
import { CancellationToken } from 'builder-util-runtime';

const { autoUpdater } = electronUpdater;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_VERSION = 9;
const DESKTOP_DATA_DIRNAME = 'Mentor Vault';
const DATA_LOCATION_FILE_NAME = 'data-location.json';
const STORE_FILE_NAME = 'vibe-data.json';
const LEGACY_DATA_DIRNAMES = ['Professor Tracker', 'Vibe Sender', 'vibe-sender'];
const UPDATE_MANIFEST_ENV_KEYS = ['PROFESSOR_TRACKER_UPDATE_URL', 'UPDATE_MANIFEST_URL'];
const DEFAULT_UPDATE_MANIFEST_URL =
  'https://github.com/Luofaiz/mentor-vault/releases/latest/download/latest.json';
const DEFAULT_UPDATE_MANIFEST_FALLBACK_URLS = [
  'https://raw.githubusercontent.com/Luofaiz/mentor-vault/main/latest.json',
  'https://api.github.com/repos/Luofaiz/mentor-vault/releases/latest',
  'https://cdn.jsdelivr.net/gh/Luofaiz/mentor-vault@main/latest.json',
  'https://gcore.jsdelivr.net/gh/Luofaiz/mentor-vault@main/latest.json',
];
const UPDATE_CHECK_TIMEOUT_MS = 30000;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const UPDATE_INSTALLER_FILE_NAME = 'MentorVaultSetup.exe';
const UPDATE_CACHE_DIRNAMES = ['vibe-sender-updater', 'mentor-vault-updater'];
const UPDATE_DOWNLOAD_PROGRESS_CHANNEL = 'system:update-download-progress';
const AUTO_UPDATE_LATEST_BASE_URL = 'https://github.com/Luofaiz/mentor-vault/releases/latest/download/';
const AUTO_UPDATE_VERSION_BASE_URL_PREFIX = 'https://github.com/Luofaiz/mentor-vault/releases/download/';
const ELECTRON_UPDATER_SESSION_NAME = 'electron-updater';
let currentUpdateDownloadTask = null;
let currentDifferentialUpdateCancellationToken = null;
let updateProxyReadyPromise = null;
let configuredDataDir = null;

const DEFAULT_PROFESSORS = [];

const DEFAULT_TIMELINE_EVENTS = [];

function getDefaultDataDir() {
  return path.join(app.getPath('appData'), DESKTOP_DATA_DIRNAME);
}

function getDataLocationConfigPath() {
  return path.join(getDefaultDataDir(), DATA_LOCATION_FILE_NAME);
}

function normalizeDataDirPath(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return '';
  }

  return path.resolve(raw);
}

function readConfiguredDataDir() {
  if (configuredDataDir) {
    return configuredDataDir;
  }

  try {
    const config = JSON.parse(readFileSync(getDataLocationConfigPath(), 'utf8'));
    const dataDir = normalizeDataDirPath(config?.dataDir);
    configuredDataDir = dataDir || null;
  } catch {
    configuredDataDir = null;
  }

  return configuredDataDir;
}

function getPreferredDataDir() {
  return readConfiguredDataDir() ?? getDefaultDataDir();
}

function getLegacyDataDirs() {
  const preferred = getPreferredDataDir();
  return Array.from(
    new Set([
      getDefaultDataDir(),
      app.getPath('userData'),
      ...LEGACY_DATA_DIRNAMES.map((directoryName) => path.join(app.getPath('appData'), directoryName)),
    ]),
  ).filter((candidate) => candidate !== preferred);
}

function compareVersions(left, right) {
  const leftParts = String(left ?? '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const rightParts = String(right ?? '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
}

async function readRuntimePackageJson() {
  try {
    const text = await readFile(path.join(app.getAppPath(), 'package.json'), 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function appendUpdateManifestUrl(urls, value) {
  const url = String(value ?? '').trim();
  if (url && !urls.includes(url)) {
    urls.push(url);
  }
}

async function prepareUpdateProxy() {
  if (updateProxyReadyPromise) {
    return updateProxyReadyPromise;
  }

  updateProxyReadyPromise = (async () => {
    const proxyConfig = { mode: 'system' };
    const updaterSession = session.fromPartition(ELECTRON_UPDATER_SESSION_NAME, { cache: false });
    await Promise.all([session.defaultSession.setProxy(proxyConfig), updaterSession.setProxy(proxyConfig)]);
    await Promise.allSettled([
      session.defaultSession.forceReloadProxyConfig?.(),
      updaterSession.forceReloadProxyConfig?.(),
    ]);
    await Promise.allSettled([session.defaultSession.closeAllConnections(), updaterSession.closeAllConnections()]);
  })().catch((error) => {
    console.warn('[update-proxy] Failed to use system proxy settings.', error);
  }).finally(() => {
    updateProxyReadyPromise = null;
  });

  return updateProxyReadyPromise;
}

async function fetchForUpdate(url, options) {
  await prepareUpdateProxy();
  return net.fetch(url, options);
}

async function getUpdateManifestUrls() {
  const urls = [];

  for (const key of UPDATE_MANIFEST_ENV_KEYS) {
    appendUpdateManifestUrl(urls, process.env[key]);
  }

  const runtimePackage = await readRuntimePackageJson();
  appendUpdateManifestUrl(urls, runtimePackage?.updateManifestUrl);
  if (Array.isArray(runtimePackage?.updateManifestFallbackUrls)) {
    for (const url of runtimePackage.updateManifestFallbackUrls) {
      appendUpdateManifestUrl(urls, url);
    }
  }
  appendUpdateManifestUrl(urls, DEFAULT_UPDATE_MANIFEST_URL);
  for (const url of DEFAULT_UPDATE_MANIFEST_FALLBACK_URLS) {
    appendUpdateManifestUrl(urls, url);
  }

  return urls;
}

async function fetchUpdateManifest(manifestUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetchForUpdate(manifestUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('?????????????????? GitHub Release ?????');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBestUpdateManifest(manifestUrls, currentVersion) {
  let bestManifest = null;
  let lastError = null;

  for (const manifestUrl of manifestUrls) {
    try {
      const manifest = normalizeUpdateManifest(await fetchUpdateManifest(manifestUrl));
      if (!bestManifest || compareVersions(manifest.latestVersion, bestManifest.latestVersion) > 0) {
        bestManifest = manifest;
      }
      if (compareVersions(manifest.latestVersion, currentVersion) > 0) {
        return manifest;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (bestManifest) {
    return bestManifest;
  }

  throw new Error(
    `???????????????????${
      lastError instanceof Error ? lastError.message : String(lastError ?? '????')
    }`,
  );
}

function normalizeUpdateManifest(manifest) {
  const latestVersion = String(manifest?.version ?? manifest?.tag_name ?? '')
    .trim()
    .replace(/^v(?=\d)/i, '');
  const releaseAssets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  const releaseAsset =
    releaseAssets.find((asset) => asset?.name === UPDATE_INSTALLER_FILE_NAME) ??
    releaseAssets.find((asset) => String(asset?.name ?? '').toLowerCase().endsWith('.exe')) ??
    releaseAssets.find((asset) => asset?.name === 'MentorVaultPortable.zip') ??
    releaseAssets.find((asset) => String(asset?.name ?? '').toLowerCase().endsWith('.zip')) ??
    null;
  const downloadUrlCandidates = [
    ...(Array.isArray(manifest?.downloadUrls) ? manifest.downloadUrls : []),
    manifest?.downloadUrl,
    releaseAsset?.browser_download_url,
  ];
  const downloadUrls = Array.from(
    new Set(downloadUrlCandidates.map((url) => String(url ?? '').trim()).filter(Boolean)),
  );
  const downloadUrl = downloadUrls[0] ?? '';
  const downloadSha256ByUrl = normalizeDownloadSha256ByUrl(downloadUrls, manifest);
  const notes = String(manifest?.notes ?? manifest?.body ?? '').trim();
  const releaseUrl = String(manifest?.releaseUrl ?? manifest?.html_url ?? '').trim();

  if (!latestVersion) {
    throw new Error('Update manifest is missing "version".');
  }

  for (const url of downloadUrls) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Update download URL must use http or https.');
    }
  }

  return {
    latestVersion,
    downloadUrl,
    downloadUrls,
    downloadSha256ByUrl,
    releaseUrl,
    notes,
  };
}

async function checkForUpdates() {
  const currentVersion = app.getVersion();
  const manifestUrls = await getUpdateManifestUrls();

  if (manifestUrls.length === 0) {
    return {
      configured: false,
      currentVersion,
      updateAvailable: false,
    };
  }

  const manifest = await fetchBestUpdateManifest(manifestUrls, currentVersion);
  const updateAvailable = compareVersions(manifest.latestVersion, currentVersion) > 0;

  return {
    configured: true,
    currentVersion,
    latestVersion: manifest.latestVersion,
    updateAvailable,
    downloadUrl: manifest.downloadUrl,
    downloadUrls: manifest.downloadUrls,
    downloadSha256ByUrl: manifest.downloadSha256ByUrl,
    releaseUrl: manifest.releaseUrl,
    notes: manifest.notes,
  };
}

async function openExternalUrl(url) {
  const parsed = new URL(String(url ?? '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs can be opened.');
  }

  await shell.openExternal(parsed.toString());
}

function isHttpExternalUrl(url) {
  try {
    const parsed = new URL(String(url ?? '').trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function shouldOpenInDefaultBrowser(targetUrl, currentUrl) {
  if (!isHttpExternalUrl(targetUrl)) {
    return false;
  }

  if (!currentUrl || currentUrl.startsWith('file:')) {
    return true;
  }

  try {
    return new URL(targetUrl).origin !== new URL(currentUrl).origin;
  } catch {
    return true;
  }
}

function openExternalUrlFromWebContents(url) {
  if (!isHttpExternalUrl(url)) {
    return;
  }

  shell.openExternal(String(url).trim()).catch((error) => {
    console.warn('[external-url] Failed to open URL in default browser.', error);
  });
}

function configureExternalLinkHandling(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrlFromWebContents(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!shouldOpenInDefaultBrowser(url, window.webContents.getURL())) {
      return;
    }

    event.preventDefault();
    openExternalUrlFromWebContents(url);
  });
}

function sendUpdateDownloadProgress(webContents, progress) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }

  webContents.send(UPDATE_DOWNLOAD_PROGRESS_CHANNEL, progress);
}

function getDifferentialUpdateBaseUrl(latestVersion) {
  const version = String(latestVersion ?? '').trim().replace(/^v(?=\d)/i, '');
  if (!version) {
    return AUTO_UPDATE_LATEST_BASE_URL;
  }

  return `${AUTO_UPDATE_VERSION_BASE_URL_PREFIX}v${version}/`;
}

function configureDifferentialUpdater(webContents, latestVersion) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.disableDifferentialDownload = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = {
    info: (...args) => console.log('[autoUpdater]', ...args),
    warn: (...args) => console.warn('[autoUpdater]', ...args),
    error: (...args) => console.error('[autoUpdater]', ...args),
  };
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: getDifferentialUpdateBaseUrl(latestVersion),
    useMultipleRangeRequest: false,
  });

  if (!autoUpdater.__mentorVaultProgressBridgeAttached) {
    autoUpdater.on('error', (error) => {
      console.error('[autoUpdater]', error);
    });
    autoUpdater.on('download-progress', (progress) => {
      const bytesPerSecond = Number(progress?.bytesPerSecond ?? 0);
      const transferredBytes = Number(progress?.transferred ?? 0);
      const totalBytes = Number(progress?.total ?? 0);
      const remainingBytes =
        Number.isFinite(totalBytes) && totalBytes > 0 ? Math.max(totalBytes - transferredBytes, 0) : undefined;
      sendUpdateDownloadProgress(webContents, {
        mode: 'differential',
        status: 'downloading',
        transferredBytes,
        totalBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : undefined,
        bytesPerSecond: Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0,
        remainingSeconds:
          remainingBytes === undefined || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0
            ? undefined
            : remainingBytes / bytesPerSecond,
        percent:
          typeof progress?.percent === 'number'
            ? Math.max(0, Math.min(100, Math.round(progress.percent)))
            : undefined,
      });
    });
    autoUpdater.__mentorVaultProgressBridgeAttached = true;
  }
}

async function installDifferentialUpdate(webContents, latestVersion) {
  if (process.platform !== 'win32') {
    throw new Error('????????? Windows?');
  }

  if (!app.isPackaged) {
    throw new Error('???????????????????????');
  }

  if (currentDifferentialUpdateCancellationToken) {
    throw new Error('???????????');
  }

  configureDifferentialUpdater(webContents, latestVersion);
  const cancellationToken = new CancellationToken();
  currentDifferentialUpdateCancellationToken = cancellationToken;

  try {
    await prepareUpdateProxy();
    const checkResult = await autoUpdater.checkForUpdates();
    if (!checkResult?.isUpdateAvailable) {
      throw new Error('??????????');
    }

    sendUpdateDownloadProgress(webContents, {
      mode: 'differential',
      status: 'downloading',
      transferredBytes: 0,
      totalBytes: undefined,
      bytesPerSecond: 0,
      remainingSeconds: undefined,
      percent: undefined,
    });

    await autoUpdater.downloadUpdate(cancellationToken);
    sendUpdateDownloadProgress(webContents, {
      mode: 'differential',
      status: 'completed',
      transferredBytes: 1,
      totalBytes: 1,
      bytesPerSecond: 0,
      remainingSeconds: 0,
      percent: 100,
    });

    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 500);
    return { ok: true, mode: 'differential' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/cancel/i.test(message) || cancellationToken.cancelled) {
      throw new Error('??????????');
    }
    throw error;
  } finally {
    currentDifferentialUpdateCancellationToken = null;
  }
}

function createUpdateDownloadTask(controller, installerPath) {
  return {
    controller,
    installerPath,
    isPaused: false,
    isCanceled: false,
    resumeWaiters: [],
    transferredBytes: 0,
    totalBytes: undefined,
  };
}

function waitForUpdateDownloadResume(task) {
  if (!task.isPaused) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    task.resumeWaiters.push(resolve);
  });
}

function resumeUpdateDownloadTask(task) {
  task.isPaused = false;
  const waiters = task.resumeWaiters.splice(0);
  waiters.forEach((resolve) => resolve());
}

function pauseCurrentUpdateDownload() {
  if (currentDifferentialUpdateCancellationToken) {
    return { ok: false, reason: '???????????' };
  }

  if (!currentUpdateDownloadTask || currentUpdateDownloadTask.isCanceled) {
    return { ok: false };
  }

  currentUpdateDownloadTask.isPaused = true;
  return { ok: true };
}

function resumeCurrentUpdateDownload() {
  if (currentDifferentialUpdateCancellationToken) {
    return { ok: false, reason: '???????????' };
  }

  if (!currentUpdateDownloadTask || currentUpdateDownloadTask.isCanceled) {
    return { ok: false };
  }

  resumeUpdateDownloadTask(currentUpdateDownloadTask);
  return { ok: true };
}

function cancelCurrentUpdateDownload() {
  if (currentDifferentialUpdateCancellationToken) {
    currentDifferentialUpdateCancellationToken.cancel();
    currentDifferentialUpdateCancellationToken = null;
    return { ok: true };
  }

  if (!currentUpdateDownloadTask) {
    return { ok: false };
  }

  currentUpdateDownloadTask.isCanceled = true;
  resumeUpdateDownloadTask(currentUpdateDownloadTask);
  currentUpdateDownloadTask.controller.abort();
  return { ok: true };
}

async function removeFileIfExists(filePath) {
  try {
    await unlink(filePath);
  } catch {
  }
}

async function getPathSize(targetPath) {
  try {
    const metadata = await stat(targetPath);
    if (metadata.isFile()) {
      return metadata.size;
    }
    if (!metadata.isDirectory()) {
      return 0;
    }

    const entries = await readdir(targetPath, { withFileTypes: true });
    let totalBytes = 0;
    for (const entry of entries) {
      totalBytes += await getPathSize(path.join(targetPath, entry.name));
    }
    return totalBytes;
  } catch {
    return 0;
  }
}

function getUpdateCachePaths() {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(app.getPath('appData'), '..', 'Local');
  return [
    ...UPDATE_CACHE_DIRNAMES.map((directoryName) => path.join(localAppData, directoryName)),
    path.join(app.getPath('temp'), 'MentorVaultSetup.exe'),
  ];
}

async function clearUpdateCache() {
  if (currentUpdateDownloadTask || currentDifferentialUpdateCancellationToken) {
    throw new Error('??????????????????????????');
  }

  const cachePaths = Array.from(new Set(getUpdateCachePaths().map((cachePath) => path.resolve(cachePath))));
  let freedBytes = 0;
  const removedPaths = [];

  for (const cachePath of cachePaths) {
    const size = await getPathSize(cachePath);
    if (size <= 0) {
      continue;
    }

    await rm(cachePath, { recursive: true, force: true });
    freedBytes += size;
    removedPaths.push(cachePath);
  }

  try {
    const tempEntries = await readdir(app.getPath('temp'), { withFileTypes: true });
    for (const entry of tempEntries) {
      if (!entry.isFile() || !/^MentorVaultSetup-\d+\.exe$/i.test(entry.name)) {
        continue;
      }

      const tempInstallerPath = path.join(app.getPath('temp'), entry.name);
      const size = await getPathSize(tempInstallerPath);
      await rm(tempInstallerPath, { force: true });
      freedBytes += size;
      removedPaths.push(tempInstallerPath);
    }
  } catch {
  }

  return {
    ok: true,
    freedBytes,
    removedPaths,
  };
}

function createUpdateDownloadProgressStream(totalBytes, notifyProgress, task) {
  let transferredBytes = 0;
  let lastSentAt = 0;
  let activeStartedAt = Date.now();
  let pausedStartedAt = null;
  let totalPausedMs = 0;
  task.totalBytes = totalBytes;

  const emitProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastSentAt < 200) {
      return;
    }

    const elapsedSeconds = Math.max((now - activeStartedAt - totalPausedMs) / 1000, 0.001);
    const bytesPerSecond = transferredBytes / elapsedSeconds;
    const remainingBytes = totalBytes ? Math.max(totalBytes - transferredBytes, 0) : undefined;

    lastSentAt = now;
    notifyProgress({
      mode: 'full',
      status: task.isPaused ? 'paused' : 'downloading',
      transferredBytes,
      totalBytes,
      bytesPerSecond,
      remainingSeconds: remainingBytes === undefined || bytesPerSecond <= 0 ? undefined : remainingBytes / bytesPerSecond,
      percent: totalBytes ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : undefined,
    });
  };

  notifyProgress({
    mode: 'full',
    status: 'downloading',
    transferredBytes: 0,
    totalBytes,
    bytesPerSecond: 0,
    remainingSeconds: undefined,
    percent: totalBytes ? 0 : undefined,
  });

  return new Transform({
    async transform(chunk, _encoding, callback) {
      try {
        if (task.isCanceled) {
          callback(new Error('Update download canceled.'));
          return;
        }

        if (task.isPaused) {
          pausedStartedAt = Date.now();
          notifyProgress({
            mode: 'full',
            status: 'paused',
            transferredBytes,
            totalBytes,
            bytesPerSecond: 0,
            remainingSeconds: undefined,
            percent: totalBytes ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : undefined,
          });
          await waitForUpdateDownloadResume(task);
          if (pausedStartedAt !== null) {
            totalPausedMs += Date.now() - pausedStartedAt;
            pausedStartedAt = null;
          }
        }

        if (task.isCanceled) {
          callback(new Error('Update download canceled.'));
          return;
        }

        transferredBytes += chunk.length;
        task.transferredBytes = transferredBytes;
        emitProgress(transferredBytes === totalBytes);
        callback(null, chunk);
      } catch (error) {
        callback(error);
      }
    },
    flush(callback) {
      emitProgress(true);
      callback();
    },
  });
}

function normalizeDownloadUrls(input) {
  const values = Array.isArray(input) ? input : [input];
  return Array.from(new Set(values.map((url) => String(url ?? '').trim()).filter(Boolean)));
}

function normalizeSha256(value) {
  const hash = String(value ?? '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
}

function normalizeDownloadSha256ByUrl(downloadUrls, manifest) {
  const fallbackHash = normalizeSha256(manifest?.downloadSha256 ?? manifest?.sha256);
  const manifestHashes =
    manifest?.downloadHashes && typeof manifest.downloadHashes === 'object' && !Array.isArray(manifest.downloadHashes)
      ? manifest.downloadHashes
      : {};

  return Object.fromEntries(
    downloadUrls
      .map((url) => [url, normalizeSha256(manifestHashes[url]) || fallbackHash])
      .filter(([, hash]) => Boolean(hash)),
  );
}

async function calculateFileSha256(filePath) {
  const buffer = await readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function downloadUpdateInstaller(downloadUrl, expectedSha256, webContents) {
  const parsed = new URL(String(downloadUrl ?? '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('??????????? http ? https?');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_DOWNLOAD_TIMEOUT_MS);
  const installerPath = path.join(app.getPath('temp'), `MentorVaultSetup-${Date.now()}.exe`);
  if (currentUpdateDownloadTask) {
    throw new Error('????????????');
  }

  const task = createUpdateDownloadTask(controller, installerPath);
  currentUpdateDownloadTask = task;

  try {
    const response = await fetchForUpdate(parsed.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/octet-stream,application/x-msdownload,*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : undefined;
    const notifyProgress = (progress) => sendUpdateDownloadProgress(webContents, progress);

    if (response.body) {
      await pipeline(
        Readable.fromWeb(response.body),
        createUpdateDownloadProgressStream(totalBytes, notifyProgress, task),
        createWriteStream(installerPath),
      );
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      notifyProgress({
        mode: 'full',
        status: 'downloading',
        transferredBytes: 0,
        totalBytes: buffer.length,
        bytesPerSecond: 0,
        remainingSeconds: undefined,
        percent: 0,
      });
      await writeFile(installerPath, buffer);
      task.transferredBytes = buffer.length;
      task.totalBytes = buffer.length;
      notifyProgress({
        mode: 'full',
        status: 'completed',
        transferredBytes: buffer.length,
        totalBytes: buffer.length,
        bytesPerSecond: 0,
        remainingSeconds: 0,
        percent: 100,
      });
    }

    notifyProgress({
      mode: 'full',
      status: 'completed',
      transferredBytes: task.transferredBytes || totalBytes || 0,
      totalBytes,
      bytesPerSecond: 0,
      remainingSeconds: 0,
      percent: 100,
    });
    const normalizedExpectedSha256 = normalizeSha256(expectedSha256);
    if (normalizedExpectedSha256) {
      const actualSha256 = await calculateFileSha256(installerPath);
      if (actualSha256 !== normalizedExpectedSha256) {
        await removeFileIfExists(installerPath);
        throw new Error('????????????????????????????????? GitHub Release ?????');
      }
    }
    return installerPath;
  } catch (error) {
    if (task.isCanceled) {
      await removeFileIfExists(installerPath);
      throw new Error('????????');
    }

    if (error?.name === 'AbortError') {
      throw new Error('??????????????????? GitHub Release ????????');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
    if (currentUpdateDownloadTask === task) {
      currentUpdateDownloadTask = null;
    }
  }
}

async function startVisibleUpdateInstaller(installerPath) {
  const result = await shell.openPath(installerPath);
  if (result) {
    throw new Error(`?????????${result}`);
  }
}

async function installUpdate(updateInput, webContents) {
  if (process.platform !== 'win32') {
    throw new Error('??????????? Windows?');
  }

  const downloadUrls = normalizeDownloadUrls(
    updateInput && typeof updateInput === 'object' && !Array.isArray(updateInput)
      ? updateInput.downloadUrls ?? updateInput.downloadUrl
      : updateInput,
  );
  const downloadSha256ByUrl =
    updateInput && typeof updateInput === 'object' && !Array.isArray(updateInput) && updateInput.downloadSha256ByUrl
      ? updateInput.downloadSha256ByUrl
      : {};
  if (downloadUrls.length === 0) {
    throw new Error('???????????????');
  }

  let installerPath = '';
  let lastError = null;
  for (let index = 0; index < downloadUrls.length; index += 1) {
    const downloadUrl = downloadUrls[index];
    try {
      installerPath = await downloadUpdateInstaller(downloadUrl, downloadSha256ByUrl[downloadUrl], webContents);
      break;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (/??|canceled|cancelled/i.test(message) || index === downloadUrls.length - 1) {
        throw error;
      }
    }
  }

  if (!installerPath) {
    throw lastError ?? new Error('??????????');
  }

  await startVisibleUpdateInstaller(installerPath);

  setTimeout(() => {
    app.quit();
  }, 1200);
  return { ok: true };
}

async function readExistingDataFile(fileName) {
  const candidatePaths = [
    path.join(getPreferredDataDir(), fileName),
    ...getLegacyDataDirs().map((dir) => path.join(dir, fileName)),
  ];
  const existingFiles = [];

  for (const candidatePath of candidatePaths) {
    try {
      const [text, metadata] = await Promise.all([readFile(candidatePath, 'utf8'), stat(candidatePath)]);
      existingFiles.push({
        path: candidatePath,
        text,
        mtimeMs: metadata.mtimeMs,
      });
    } catch {
    }
  }

  if (existingFiles.length === 0) {
    return null;
  }

  existingFiles.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return existingFiles[0];
}

async function writePreferredDataFile(fileName, text) {
  const preferredDir = getPreferredDataDir();
  await mkdir(preferredDir, { recursive: true });
  const filePath = path.join(preferredDir, fileName);
  await writeFile(filePath, text, 'utf8');
  return filePath;
}

function getManagedDataFileNames() {
  return [STORE_FILE_NAME];
}

function getBackupFileName() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
  return `mentor-vault-backup-${timestamp}.json`;
}

function createBackupPayload(store) {
  return {
    format: 'mentor-vault-backup',
    backupVersion: 1,
    appVersion: app.getVersion(),
    createdAt: Date.now(),
    store: normalizeStore(store),
  };
}

function looksLikeStorePayload(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return ['professors', 'timelineEvents', 'notes', 'listOrderPreferences'].some((key) =>
    Object.prototype.hasOwnProperty.call(value, key),
  );
}

function extractStoreFromBackupPayload(value) {
  if (value?.format === 'mentor-vault-backup' && looksLikeStorePayload(value.store)) {
    return value.store;
  }

  if (looksLikeStorePayload(value)) {
    return value;
  }

  throw new Error('??????? Mentor Vault ?????');
}

async function getDataFileInfo(fileName) {
  const filePath = path.join(getPreferredDataDir(), fileName);
  try {
    const metadata = await stat(filePath);
    return {
      path: filePath,
      exists: metadata.isFile(),
      size: metadata.size,
      updatedAt: metadata.mtimeMs,
    };
  } catch {
    return {
      path: filePath,
      exists: false,
      size: 0,
      updatedAt: null,
    };
  }
}

async function getDataDirectoryInfo() {
  const dataDir = getPreferredDataDir();
  const files = await Promise.all(getManagedDataFileNames().map((fileName) => getDataFileInfo(fileName)));
  const storeFile = files.find((file) => path.basename(file.path) === STORE_FILE_NAME);

  return {
    dataDir,
    defaultDataDir: getDefaultDataDir(),
    isCustomDataDir: path.resolve(dataDir) !== path.resolve(getDefaultDataDir()),
    storePath: storeFile?.path ?? path.join(dataDir, STORE_FILE_NAME),
    files,
  };
}

async function openDataDirectory() {
  const dataDir = getPreferredDataDir();
  await mkdir(dataDir, { recursive: true });
  await shell.openPath(dataDir);
  return { ok: true };
}

async function copyDataFilesToDirectory(targetDir) {
  await mkdir(targetDir, { recursive: true });
  const copiedFiles = [];

  for (const fileName of getManagedDataFileNames()) {
    const existing = await readExistingDataFile(fileName);
    if (!existing) {
      continue;
    }

    const targetPath = path.join(targetDir, fileName);
    await writeFile(targetPath, existing.text, 'utf8');
    copiedFiles.push({ fileName, from: existing.path, to: targetPath });
  }

  if (!copiedFiles.some((file) => file.fileName === STORE_FILE_NAME)) {
    const targetPath = path.join(targetDir, STORE_FILE_NAME);
    await writeFile(targetPath, JSON.stringify(normalizeStore(null), null, 2), 'utf8');
    copiedFiles.push({ fileName: STORE_FILE_NAME, from: null, to: targetPath });
  }

  return copiedFiles;
}

async function saveDataLocation(targetDir) {
  configuredDataDir = normalizeDataDirPath(targetDir);
  await mkdir(getDefaultDataDir(), { recursive: true });
  await writeFile(
    getDataLocationConfigPath(),
    JSON.stringify({ dataDir: configuredDataDir, updatedAt: Date.now() }, null, 2),
    'utf8',
  );
}

async function chooseDataDirectory() {
  const result = await dialog.showOpenDialog({
    title: '????????',
    defaultPath: getPreferredDataDir(),
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const targetDir = normalizeDataDirPath(result.filePaths[0]);
  const copiedFiles = await copyDataFilesToDirectory(targetDir);
  await saveDataLocation(targetDir);

  return {
    canceled: false,
    dataDir: targetDir,
    copiedFiles,
    restartRequired: true,
  };
}

async function createDataBackup() {
  const result = await dialog.showSaveDialog({
    title: '?? Mentor Vault ??',
    defaultPath: path.join(app.getPath('documents'), getBackupFileName()),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const store = await ensureStore();
  await writeFile(result.filePath, JSON.stringify(createBackupPayload(store), null, 2), 'utf8');
  return { canceled: false, filePath: result.filePath };
}

async function restoreDataBackup() {
  const result = await dialog.showOpenDialog({
    title: '?? Mentor Vault ??',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const backupPath = result.filePaths[0];
  const backupText = await readFile(backupPath, 'utf8');
  const backupStore = normalizeStore(extractStoreFromBackupPayload(parseJsonSafely(backupText)));
  const currentText = JSON.stringify(await ensureStore(), null, 2);
  const currentBackupPath = path.join(
    getPreferredDataDir(),
    `vibe-data.before-restore-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')}.json`,
  );
  await mkdir(getPreferredDataDir(), { recursive: true });
  await writeFile(currentBackupPath, currentText, 'utf8');
  await saveStore(backupStore);
  return {
    canceled: false,
    restoredFrom: backupPath,
    previousBackupPath: currentBackupPath,
  };
}

function normalizeDateValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeProfessorStatus(value) {
  const status = String(value ?? '').trim();
  if (!status) {
    return 'Pending';
  }

  if (status === '??' || status === '???') {
    return '??';
  }

  return status;
}

function normalizeProfessorRecord(record) {
  const status = normalizeProfessorStatus(record?.status);
  const lastContactDate = normalizeDateValue(record?.lastContactDate);
  const firstContactDate =
    normalizeDateValue(record?.firstContactDate) ||
    (lastContactDate && status !== 'Pending' && status !== 'Drafting' ? lastContactDate : '');

  const legacyParts = [
    record?.country ? `???/???${String(record.country).trim()}` : '',
    record?.applicationSeason ? `?????${String(record.applicationSeason).trim()}` : '',
    record?.followUpDate ? `????????${normalizeDateValue(record.followUpDate)}` : '',
  ].filter(Boolean);
  const legacyNote = legacyParts.length > 0 ? `[????] ${legacyParts.join('?')}` : '';
  const currentNotes = String(record?.notes ?? '').trim();
  const notes = legacyNote && currentNotes.includes(legacyNote)
    ? currentNotes
    : [currentNotes, legacyNote].filter(Boolean).join('\n');

  return {
    id: String(record?.id ?? crypto.randomUUID()),
    name: String(record?.name ?? '').trim(),
    title: String(record?.title ?? '').trim(),
    school: String(record?.school ?? '').trim(),
    college: String(record?.college ?? record?.department ?? '').trim(),
    email: String(record?.email ?? '').trim(),
    homepage: String(record?.homepage ?? record?.website ?? '').trim(),
    researchArea: String(record?.researchArea ?? '').trim(),
    status,
    tags: Array.isArray(record?.tags) ? record.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    firstContactDate,
    lastContactDate,
    notes,
    createdAt: typeof record?.createdAt === 'number' ? record.createdAt : Date.now(),
    updatedAt: typeof record?.updatedAt === 'number' ? record.updatedAt : Date.now(),
    deletedAt: typeof record?.deletedAt === 'number' ? record.deletedAt : undefined,
  };
}

function normalizeTimelineEventRecord(event) {
  return {
    id: String(event?.id ?? crypto.randomUUID()),
    professorId: String(event?.professorId ?? ''),
    type: String(event?.type ?? 'Note'),
    title: String(event?.title ?? '').trim(),
    description: String(event?.description ?? '').trim(),
    eventDate: normalizeDateValue(event?.eventDate),
    createdAt: typeof event?.createdAt === 'number' ? event.createdAt : Date.now(),
  };
}

function normalizeDocumentNoteRecord(note) {
  const now = Date.now();

  return {
    id: String(note?.id ?? crypto.randomUUID()),
    title: String(note?.title ?? '').trim(),
    body: String(note?.body ?? note?.content ?? '').trim(),
    createdAt: typeof note?.createdAt === 'number' ? note.createdAt : now,
    updatedAt: typeof note?.updatedAt === 'number' ? note.updatedAt : now,
  };
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)));
}

function normalizeListOrderPreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const collegesBySchool =
    input.collegesBySchool && typeof input.collegesBySchool === 'object'
      ? Object.fromEntries(
          Object.entries(input.collegesBySchool)
            .map(([school, colleges]) => [String(school ?? '').trim(), normalizeStringArray(colleges)])
            .filter(([school]) => school),
        )
      : {};

  return {
    noteIds: normalizeStringArray(input.noteIds),
    schools: normalizeStringArray(input.schools),
    collegesBySchool,
  };
}

function normalizeStore(rawStore) {
  const store = rawStore && typeof rawStore === 'object' ? rawStore : {};

  return {
    version: STORE_VERSION,
    professors: Array.isArray(store.professors)
      ? store.professors.map((record) => normalizeProfessorRecord(record))
      : DEFAULT_PROFESSORS,
    timelineEvents: Array.isArray(store.timelineEvents)
      ? store.timelineEvents.map((event) => normalizeTimelineEventRecord(event))
      : DEFAULT_TIMELINE_EVENTS,
    notes: Array.isArray(store.notes) ? store.notes.map((note) => normalizeDocumentNoteRecord(note)) : [],
    listOrderPreferences: normalizeListOrderPreferences(store.listOrderPreferences),
  };
}

function parseJsonSafely(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    title: 'Mentor Vault',
    width: 1560,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    backgroundColor: '#fcfbf8',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  configureExternalLinkHandling(window);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function getStorePath() {
  return path.join(getPreferredDataDir(), 'vibe-data.json');
}

async function ensureStore() {
  const existing = await readExistingDataFile('vibe-data.json');
  if (!existing) {
    return normalizeStore(null);
  }

  return normalizeStore(parseJsonSafely(existing.text));
}

async function saveStore(store) {
  await writePreferredDataFile('vibe-data.json', JSON.stringify(normalizeStore(store), null, 2));
}

function filterProfessors(professors, filters = {}) {
  const query = String(filters.query ?? '').trim().toLowerCase();

  return professors
    .filter((professor) => (filters.includeDeleted ? true : !professor.deletedAt))
    .filter((professor) => {
      if (!query) {
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
        .includes(query);
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function normalizeDraft(draft) {
  return {
    name: draft.name.trim(),
    title: draft.title.trim(),
    school: draft.school.trim(),
    college: String(draft.college ?? '').trim(),
    email: draft.email.trim(),
    homepage: String(draft.homepage ?? '').trim(),
    researchArea: draft.researchArea.trim(),
    status: normalizeProfessorStatus(draft.status),
    firstContactDate: normalizeDateValue(draft.firstContactDate),
    lastContactDate: normalizeDateValue(draft.lastContactDate),
    notes: draft.notes.trim(),
    tags: Array.isArray(draft.tags) ? draft.tags.map((tag) => tag.trim()).filter(Boolean) : [],
  };
}

ipcMain.handle('system:get-runtime-info', async () => ({
  platform: process.platform,
  storageMode: 'desktop-json',
  version: app.getVersion(),
}));

ipcMain.handle('system:check-for-updates', async () => checkForUpdates());

ipcMain.handle('system:open-external-url', async (_event, url) => {
  await openExternalUrl(url);
});

ipcMain.handle('system:install-update', async (event, downloadUrl) => installUpdate(downloadUrl, event.sender));

ipcMain.handle('system:install-differential-update', async (event, latestVersion) =>
  installDifferentialUpdate(event.sender, latestVersion),
);

ipcMain.handle('system:pause-update-download', async () => pauseCurrentUpdateDownload());

ipcMain.handle('system:resume-update-download', async () => resumeCurrentUpdateDownload());

ipcMain.handle('system:cancel-update-download', async () => cancelCurrentUpdateDownload());

ipcMain.handle('system:clear-update-cache', async () => clearUpdateCache());

ipcMain.handle('system:get-data-directory-info', async () => getDataDirectoryInfo());

ipcMain.handle('system:open-data-directory', async () => openDataDirectory());

ipcMain.handle('system:choose-data-directory', async () => chooseDataDirectory());

ipcMain.handle('system:create-data-backup', async () => createDataBackup());

ipcMain.handle('system:restore-data-backup', async () => restoreDataBackup());

ipcMain.handle('professors:list', async (_event, filters) => {
  const store = await ensureStore();
  return filterProfessors(store.professors, filters);
});

ipcMain.handle('professors:create', async (_event, draft) => {
  const store = await ensureStore();
  const now = Date.now();
  const record = {
    id: crypto.randomUUID(),
    ...normalizeDraft(draft),
    createdAt: now,
    updatedAt: now,
  };
  store.professors.unshift(record);
  await saveStore(store);
  return record;
});

ipcMain.handle('professors:update', async (_event, id, draft) => {
  const store = await ensureStore();
  const now = Date.now();
  const normalized = normalizeDraft(draft);
  store.professors = store.professors.map((professor) =>
    professor.id === id ? { ...professor, ...normalized, updatedAt: now } : professor,
  );
  await saveStore(store);
  return store.professors.find((professor) => professor.id === id) ?? null;
});

ipcMain.handle('professors:trash', async (_event, id) => {
  const store = await ensureStore();
  const now = Date.now();
  store.professors = store.professors.map((professor) =>
    professor.id === id ? { ...professor, deletedAt: now, updatedAt: now } : professor,
  );
  await saveStore(store);
  return store.professors.find((professor) => professor.id === id) ?? null;
});

ipcMain.handle('professors:restore', async (_event, id) => {
  const store = await ensureStore();
  const now = Date.now();
  store.professors = store.professors.map((professor) =>
    professor.id === id ? { ...professor, deletedAt: undefined, updatedAt: now } : professor,
  );
  await saveStore(store);
  return store.professors.find((professor) => professor.id === id) ?? null;
});

ipcMain.handle('professors:purge', async (_event, id) => {
  const store = await ensureStore();
  store.professors = store.professors.filter((professor) => professor.id !== id);
  store.timelineEvents = store.timelineEvents.filter((event) => event.professorId !== id);
  await saveStore(store);
});

ipcMain.handle('timeline:list', async (_event, professorId) => {
  const store = await ensureStore();
  return store.timelineEvents
    .filter((event) => event.professorId === professorId)
    .sort((left, right) => {
      const dateCompare = right.eventDate.localeCompare(left.eventDate);
      return dateCompare !== 0 ? dateCompare : right.createdAt - left.createdAt;
    });
});

ipcMain.handle('timeline:create', async (_event, draft) => {
  const store = await ensureStore();
  const record = {
    id: crypto.randomUUID(),
    ...draft,
    createdAt: Date.now(),
  };
  store.timelineEvents.unshift(record);
  await saveStore(store);
  return record;
});

ipcMain.handle('notes:list', async () => {
  const store = await ensureStore();
  return store.notes.sort((left, right) => right.updatedAt - left.updatedAt);
});

ipcMain.handle('notes:save', async (_event, id, input) => {
  const store = await ensureStore();
  const now = Date.now();
  const existing = id ? store.notes.find((note) => note.id === id) ?? null : null;
  const normalized = normalizeDocumentNoteRecord({
    ...existing,
    id: existing?.id ?? id ?? crypto.randomUUID(),
    title: input?.title,
    body: input?.body,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  store.notes = existing
    ? store.notes.map((note) => (note.id === existing.id ? normalized : note))
    : [normalized, ...store.notes];
  await saveStore(store);
  return normalized;
});

ipcMain.handle('notes:delete', async (_event, id) => {
  const store = await ensureStore();
  store.notes = store.notes.filter((note) => note.id !== id);
  store.listOrderPreferences.noteIds = store.listOrderPreferences.noteIds.filter((noteId) => noteId !== id);
  await saveStore(store);
});

ipcMain.handle('list-order-preferences:get', async () => {
  const store = await ensureStore();
  return store.listOrderPreferences;
});

ipcMain.handle('list-order-preferences:save', async (_event, input) => {
  const store = await ensureStore();
  store.listOrderPreferences = normalizeListOrderPreferences(input);
  await saveStore(store);
  return store.listOrderPreferences;
});

app.whenReady().then(() => {
  void prepareUpdateProxy();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
