const { ipcRenderer } = require('electron');

// Expose safe IPC APIs to renderer
window.ghostAI = {
  sendCommand: (type, payload) => ipcRenderer.send('command', { type, payload }),
  onCommand: (callback) => ipcRenderer.on('command', (_, cmd) => callback(cmd)),
  onModeChanged: (callback) => ipcRenderer.on('mode-changed', (_, mode) => callback(mode)),
  toggleVisibility: () => ipcRenderer.send('toggle-visibility'),
  setMode: (mode) => ipcRenderer.send('set-mode', mode),
};
