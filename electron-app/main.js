const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');

Menu.setApplicationMenu(null);

// F12 打开开发者工具（调试用）
app.whenReady().then(() => {
  globalShortcut.register('F12', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.webContents.toggleDevTools();
  });
});

/*
 * =========================================================================
 * 环境区分（app.isPackaged）
 *
 * 打包版（exe，app.isPackaged === true）：
 *   - 配置存 AppData/Roaming/cfpt-config.json
 *   - 默认数据目录存 Documents/御备团
 *   - 所有文件系统操作正常，无权限限制
 *
 * 开发版（npx electron .，app.isPackaged === false）：
 *   - 配置存项目目录 __dirname/cfpt-config.json
 *   - 默认数据目录存项目目录 __dirname/data/
 *   - 原因：npx 启动的 Electron 进程在 Windows 上受安全策略限制，
 *     无法写入 Desktop、Documents、AppData 等系统目录（EPERM），
 *     但项目目录有写入权限
 *   - 迁移逻辑（Desktop→Documents）跳过，因为没有权限
 *
 * ⚠ 新 AI 对话注意：
 *   - app.isPackaged 是 Electron 原生 API，不是自定义环境变量
 *   - 打包版分支是主线逻辑，开发版分支是适配
 *   - 不要删除任一分支或合并为一个路径
 * =========================================================================
 */
const isPackaged = app.isPackaged;

const CONFIG_PATH = isPackaged
  ? path.join(app.getPath('userData'), 'cfpt-config.json')   // 打包版：AppData
  : path.join(__dirname, 'cfpt-config.json');                 // 开发版：项目目录

const ICON_PATH = path.join(__dirname, 'icon.ico');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch { return {}; }
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    const tmpPath = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2));
    fs.renameSync(tmpPath, CONFIG_PATH);
  } catch (e) { console.warn('保存配置失败', e); }
}

let mainWindow;
let loadingOverlay = null;   // 加载遮罩窗口（独立上层，不随页面跳转销毁）

const DEFAULT_DIR = isPackaged
  ? path.join(app.getPath('documents'), '御备团')   // 打包版：Documents
  : path.join(__dirname, 'data');                   // 开发版：项目目录/data

// 打包版确保默认目录存在；开发版不尝试创建（npx 可能无权限创建 Documents 等系统目录）
if (isPackaged) {
  try { fs.mkdirSync(DEFAULT_DIR, { recursive: true }); } catch (_) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '御备团',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
  if (!isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'bottom' });
  }
  mainWindow.maximize();

  // 外部链接统一交给系统默认浏览器打开（如 360），不在 Electron 内部新建窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 主窗口关闭时主动关闭加载遮罩窗口，确保 window-all-closed 能触发 app.quit()
  // （否则残留的 loadingOverlay 作为独立窗口会阻止退出，形成无法关闭的幽灵窗口）
  mainWindow.on('closed', () => {
    if (loadingOverlay && !loadingOverlay.isDestroyed()) {
      loadingOverlay.close();
    }
    loadingOverlay = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  // 每 8 分钟定时快照（方案三）：主进程自扫描工作目录备份所有模组
  setInterval(snapshotAllModules, SNAPSHOT_INTERVAL);
});
app.on('window-all-closed', () => { if (loadingOverlay) loadingOverlay.close(); app.quit(); });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

/* =====================================
 * 加载遮罩窗口（独立 BrowserWindow，覆盖在主窗口之上）
 * 不受页面跳转影响，用于分屏进入/退出时的过渡动画
 * ===================================== */
function showLoadingOverlay(theme) {
  if (loadingOverlay && !loadingOverlay.isDestroyed()) return; // 已存在
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const bounds = mainWindow.getContentBounds();
  loadingOverlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const themeParam = theme || 'default';
  loadingOverlay.loadURL(`file://${__dirname}/loading-overlay.html?theme=${encodeURIComponent(themeParam)}`);

  // 跟随主窗口移动/缩放
  const sync = () => {
    if (!loadingOverlay || loadingOverlay.isDestroyed()) return;
    const b = mainWindow.getContentBounds();
    loadingOverlay.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height });
  };
  mainWindow.on('move', sync);
  mainWindow.on('resize', sync);

  // 主窗口失去焦点时隐藏遮罩，切回时恢复
  const onBlur = () => {
    if (loadingOverlay && !loadingOverlay.isDestroyed()) {
      loadingOverlay.hide();
    }
  };
  const onFocus = () => {
    if (loadingOverlay && !loadingOverlay.isDestroyed()) {
      loadingOverlay.show();
    }
  };
  mainWindow.on('blur', onBlur);
  mainWindow.on('focus', onFocus);

  // 存储清理函数
  loadingOverlay._blurCleanup = () => {
    mainWindow.removeListener('blur', onBlur);
    mainWindow.removeListener('focus', onFocus);
  };
}

function hideLoadingOverlay() {
  if (!loadingOverlay || loadingOverlay.isDestroyed()) return;
  const overlay = loadingOverlay;
  loadingOverlay = null;
  // 清理 blur/focus 事件监听
  if (overlay._blurCleanup) {
    overlay._blurCleanup();
  }
  // 淡出过渡（由 CSS transition 控制），然后关闭
  overlay.webContents.executeJavaScript(`
    document.querySelector('.overlay').style.opacity = '0';
    document.querySelector('.overlay').style.transition = 'opacity 0.5s ease';
  `);
  setTimeout(() => {
    if (!overlay.isDestroyed()) overlay.close();
  }, 600);
}

/* ========== IPC 处理器 ========== */

ipcMain.handle('pick-directory', async () => {
  const cfg = loadConfig();
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: cfg.lastDir || undefined
  });
  if (result.canceled || !result.filePaths.length) return null;
  const dirPath = result.filePaths[0];
  saveConfig({ ...cfg, lastDir: dirPath });
  return dirPath;
});

ipcMain.handle('get-last-dir', () => {
  const cfg = loadConfig();
  const oldDir = path.join(app.getPath('desktop'), '跑团助手');

  // 迁移：将旧 Desktop/跑团助手 路径映射到 Documents/御备团
  // 仅打包版执行（开发版 npx 无写权限，跳过后由 app.js 的 localStorage 逻辑接管）
  if (isPackaged) {
    try {
      if (fs.existsSync(oldDir) && fs.statSync(oldDir).isDirectory()) {
        const files = fs.readdirSync(oldDir).filter(f => f.endsWith('.json'));
        for (const f of files) {
          const src = path.join(oldDir, f);
          const dest = path.join(DEFAULT_DIR, f);
          if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
        }
      }
    } catch (_) {}

    if (cfg.lastDir === oldDir) {
      saveConfig({ ...cfg, lastDir: DEFAULT_DIR });
      return DEFAULT_DIR;
    }
  }

  if (cfg.lastDir) return cfg.lastDir;

  return DEFAULT_DIR;
});

ipcMain.handle('get-default-dir', () => DEFAULT_DIR);

ipcMain.handle('list-json-files', async (_e, dirPath) => {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => e.isFile() && e.name.endsWith('.json'))
      .map(e => e.name);
  } catch { return []; }
});

ipcMain.handle('read-file', async (_e, filePath) => {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
});

// 原子化写入：先写临时文件，成功后再重命名替换，防止覆写中途崩溃导致原存档损坏
async function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp';
  await fs.promises.writeFile(tmpPath, content, 'utf-8');
  await fs.promises.rename(tmpPath, filePath);
}

/* ========== 模组存档备份（防 JSON 暴毙） ========== */
let currentWorkDir = null;                       // 当前工作目录（保存模组时记录）
const BACKUP_DIR_NAME = 'Backups';               // 备份根目录名（位于工作目录内）
const MAX_BACKUPS = 20;                          // 每个模组最多保留的备份数量
const SNAPSHOT_INTERVAL = 8 * 60 * 1000;         // 定时快照间隔：8 分钟

function backupTimestamp(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/* 备份目录：工作目录/Backups/模组名 */
function getBackupDir(filePath) {
  return path.join(path.dirname(filePath), BACKUP_DIR_NAME, path.basename(filePath, '.json'));
}

/* 列出备份目录下所有 .json，按文件名（含时间戳）升序，最旧的在最前 */
function listBackupFiles(backupDir) {
  return fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => path.join(backupDir, f));
}

/* 超过 20 个则删除最旧的 */
function pruneBackups(backupDir) {
  const files = listBackupFiles(backupDir);
  while (files.length > MAX_BACKUPS) {
    try { fs.unlinkSync(files.shift()); } catch {}
  }
}

/* 备份单个模组存档：把磁盘上的旧档复制到备份目录；与最新备份一致则跳过 */
function backupModuleFile(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf-8'); } catch { return; }
  if (!content) return;
  const backupDir = getBackupDir(filePath);
  try { fs.mkdirSync(backupDir, { recursive: true }); } catch { return; }

  const files = listBackupFiles(backupDir);
  if (files.length > 0) {
    try {
      const latest = fs.readFileSync(files[files.length - 1], 'utf-8');
      if (latest === content) return;   // 内容未变化，跳过，避免冗余备份
    } catch {}
  }

  const stamp = backupTimestamp(new Date());
  const backupPath = path.join(backupDir, `${path.basename(filePath, '.json')}_${stamp}.json`);
  try {
    fs.writeFileSync(backupPath, content, 'utf-8');
    console.log('[backup] 备份模组成功:', backupPath);
  } catch (e) {
    console.error('[backup] 备份模组失败:', backupPath, e.message);
    return;
  }
  pruneBackups(backupDir);
}

/* 定时快照：扫描当前工作目录下所有模组 JSON 并备份 */
function snapshotAllModules() {
  if (!currentWorkDir) return;
  let entries;
  try { entries = fs.readdirSync(currentWorkDir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    backupModuleFile(path.join(currentWorkDir, entry.name));
  }
}

ipcMain.handle('write-file', async (_e, filePath, content) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await atomicWrite(filePath, content);
    return true;
  } catch (e) {
    console.error('[write-file] 写入失败:', filePath, '错误:', e.message, 'code:', e.code);
    return false;
  }
});

ipcMain.handle('write-module', async (_e, filePath, module) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    currentWorkDir = path.dirname(filePath);   // 记录工作目录，供定时快照使用
    backupModuleFile(filePath);                // 覆盖旧档前先备份（方案二：保存即备份）
    const content = JSON.stringify(module, null, 2);
    await atomicWrite(filePath, content);
    return true;
  } catch (e) {
    console.error('[write-module] 写入失败:', filePath, '错误:', e.message, 'code:', e.code);
    return false;
  }
});

/* 存档损坏提示：只告知用户备份位置，不做任何自动恢复操作（方案四） */
ipcMain.handle('show-corrupt-module-dialog', async (_e, corruptedNames, workDirPath) => {
  const list = (corruptedNames || []).join('、');
  const backupRoot = path.join(workDirPath || '', BACKUP_DIR_NAME);
  await dialog.showMessageBox({
    type: 'warning',
    title: '检测到模组存档损坏',
    message: '检测到以下模组存档已损坏：',
    detail: `损坏文件：${list}\n\n备份目录：${backupRoot}\n\n请从备份目录中复制对应模组最近的备份文件，粘贴到工作目录并覆盖损坏的 json 文件，然后重启本应用。`,
    buttons: ['知道了']
  });
  return true;
});

ipcMain.handle('delete-file', async (_e, filePath) => {
  try { fs.unlinkSync(filePath); return true; } catch { return false; }
});

ipcMain.handle('check-dir', async (_e, dirPath) => {
  try { return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory(); } catch { return false; }
});

ipcMain.handle('get-app-info', () => ({ isPackaged }));

ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-config', (_e, partialCfg) => {
  const cfg = loadConfig();
  saveConfig({ ...cfg, ...partialCfg });
});

/* 选择图片文件（记住上次目录） */
ipcMain.handle('pick-image-file', async () => {
  const cfg = loadConfig();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择图片',
    properties: ['openFile'],
    defaultPath: cfg.lastImageDir || cfg.lastDir || undefined,
    filters: [
      { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  saveConfig({ ...cfg, lastImageDir: path.dirname(filePath) });
  return filePath;
});

/* 确保目录存在 */
ipcMain.handle('ensure-dir', async (_e, dirPath) => {
  try { fs.mkdirSync(dirPath, { recursive: true }); return true; } catch { return false; }
});

/* 复制文件 */
ipcMain.handle('copy-file', async (_e, srcPath, destPath) => {
  try { fs.copyFileSync(srcPath, destPath); return true; } catch (e) { console.error('[copy-file]', e.message); return false; }
});

/* 显示加载遮罩窗口（分屏进入/退出过渡） */
ipcMain.handle('show-loading', (_e, theme) => { showLoadingOverlay(theme); });

/* 隐藏加载遮罩窗口（分屏进入/退出完成） */
ipcMain.handle('hide-loading', () => { hideLoadingOverlay(); });
