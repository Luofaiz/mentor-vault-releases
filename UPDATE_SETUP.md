# Mentor Vault 更新配置

这个项目支持两种更新方式：用户检查到新版本后，可以手动选择使用 `latest.yml` 和 `.blockmap` 做增量下载，或使用 `latest.json` 里的完整安装包做全量下载。

## 1. 准备 latest.json

参考 `update-latest.example.json`：

```json
{
  "version": "0.1.1",
  "notes": "更新检查后可手动选择增量下载或全量下载。",
  "downloadUrls": [
    "https://github.com/Luofaiz/mentor-vault/releases/latest/download/MentorVaultSetup.exe"
  ],
  "downloadUrl": "https://example.com/MentorVaultSetup.exe",
  "releaseUrl": "https://example.com/mentor-vault/releases/0.1.1"
}
```

字段说明：

- `version`: 最新版本号，必须大于当前 `package.json` 里的版本号才会提示更新。
- `notes`: 更新说明。
- `downloadUrls`: 新版完整安装程序的公网下载地址列表。用户选择全量下载时，程序会按顺序尝试这些完整安装包地址。
- `downloadUrl`: 兼容旧版本的单个安装包下载地址。
- `releaseUrl`: 可选，发布页地址。如果没有 `downloadUrl`，程序会尝试打开它。

## 2. 发布文件

每个新版 Release 至少上传这些文件：

- `MentorVaultSetup.exe`
- `MentorVaultSetup.exe.blockmap`
- `latest.yml`
- `latest.json`

其中 `latest.yml` 和 `.blockmap` 由 `electron-builder` 生成，用于增量下载；`MentorVaultSetup.exe` 和 `latest.json` 用于全量下载。
程序会按新版版本号读取具体 Release 里的 `latest.yml`，例如 `https://github.com/Luofaiz/mentor-vault/releases/download/v0.2.37/latest.yml`。

把这些文件放到稳定公网地址，例如：

- GitHub Releases
- GitHub Pages
- Vercel / Netlify 静态站
- OSS / COS / S3
- 支持直链的网盘

## 3. 打包时写入更新地址

复制 `.env.example` 为 `.env`，填入：

```env
UPDATE_MANIFEST_URL="https://github.com/Luofaiz/mentor-vault/releases/latest/download/latest.json"
```

然后重新打包：

```powershell
npm run build:desktop:installer
```

打包脚本会把这个 URL 写入桌面安装版的 `resources/app/package.json`。

## 4. 用户侧体验

用户打开程序后会静默检查一次更新；如果有新版，侧边栏会显示“增量下载”“全量下载”和“手动下载”三个按钮。用户选择增量或全量后，程序才会开始对应下载并在完成后启动安装流程；选择手动下载会打开 Release 页面。

侧边栏底部也有“检查更新”按钮，可以手动检查。
