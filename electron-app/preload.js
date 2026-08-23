const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickDirectory: () => ipcRenderer.invoke('pick-directory'),
  getLastDir: () => ipcRenderer.invoke('get-last-dir'),
  listJsonFiles: (dir) => ipcRenderer.invoke('list-json-files', dir),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  writeModuleFile: (filePath, module) => ipcRenderer.invoke('write-module', filePath, module),
  showCorruptModuleDialog: (corruptedNames, workDirPath) => ipcRenderer.invoke('show-corrupt-module-dialog', corruptedNames, workDirPath),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  checkDir: (dirPath) => ipcRenderer.invoke('check-dir', dirPath),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  pickImageFile: () => ipcRenderer.invoke('pick-image-file'),
  ensureDir: (dirPath) => ipcRenderer.invoke('ensure-dir', dirPath),
  copyFile: (srcPath, destPath) => ipcRenderer.invoke('copy-file', srcPath, destPath),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  showLoading: (theme) => ipcRenderer.invoke('show-loading', theme),
  hideLoading: () => ipcRenderer.invoke('hide-loading')
});
