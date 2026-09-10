const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

// Load environment variables cleanly
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '../../../.env') });
  dotenv.config({ path: path.join(__dirname, '../../.env') });
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: path.join(app.getAppPath(), '.env') });
} catch (e) {}

// Single Instance Lock (Prevents duplicate instances and EADDRINUSE port conflicts)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('⚠️ Ghost AI is already running. Quitting duplicate instance.');
  app.quit();
  process.exit(0);
}

process.on('uncaughtException', (err) => {
  console.warn('Caught main process exception:', err ? err.message : err);
});

let mainWindow = null;
let tray = null;
let isListening = false;
let isVisible = true;
let currentMode = 'interview';

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function startEmbeddedEngine() {
  try {
    const bundledPath = path.join(__dirname, 'core-engine/index.js');
    const devPath = path.join(__dirname, '../../core-engine/dist/index.js');
    
    let enginePath = null;
    if (fs.existsSync(bundledPath)) enginePath = bundledPath;
    else if (fs.existsSync(devPath)) enginePath = devPath;

    if (enginePath) {
      console.log('🚀 Launching Embedded Core Engine server from:', enginePath);
      require(enginePath);
    } else {
      console.warn('⚠️ Bundled core engine not found at:', bundledPath);
    }
  } catch (err) {
    console.error('❌ Failed to launch embedded core engine:', err);
  }
}

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    x: width - 440,
    y: height - 560,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    thickFrame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 🛡️ GUARANTEED PROTECTION (Black Box Mode)
  // This is the only foolproof way to hide content from Google Meet's "Entire Screen" share.
  mainWindow.setContentProtection(true);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Dev: open devtools (comment out for production)
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function createTray() {
  // Use a simple icon (create one or use a default)
  const iconPath = path.join(__dirname, '../assets/icon.png');

  try {
    tray = new Tray(iconPath);
  } catch (e) {
    // If icon not found, create a simple one
    const img = nativeImage.createEmpty();
    tray = new Tray(img);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '👻 Ghost AI',
      enabled: false,
    },
    {
      label: '📱 Mobile Spy Mode (/spy)',
      click: () => {
        const { shell } = require('electron');
        shell.openExternal('http://localhost:3001/spy');
      },
    },
    { type: 'separator' },
    {
      label: '🎤 Start Listening',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('command', 'start-listening');
      },
    },
    {
      label: '🔇 Stop Listening',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('command', 'stop-listening');
      },
    },
    { type: 'separator' },
    {
      label: '🎯 Modes',
      submenu: [
        {
          label: '💼 Interview',
          type: 'radio',
          checked: currentMode === 'interview',
          click: () => setMode('interview'),
        },
        {
          label: '🤝 Meeting',
          type: 'radio',
          checked: currentMode === 'meeting',
          click: () => setMode('meeting'),
        },
        {
          label: '💻 Coding',
          type: 'radio',
          checked: currentMode === 'coding',
          click: () => setMode('coding'),
        },
        {
          label: '🌐 General',
          type: 'radio',
          checked: currentMode === 'general',
          click: () => setMode('general'),
        },
      ],
    },
    { type: 'separator' },
    {
      label: '🗑️ Clear Context',
      click: () => {
        if (mainWindow) mainWindow.webContents.send('command', 'clear-context');
      },
    },
    { type: 'separator' },
    {
      label: '❌ Quit Ghost AI',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Ghost AI — Ctrl+Shift+Space to toggle');
  tray.on('click', () => toggleVisibility());
}

function setMode(mode) {
  currentMode = mode;
  if (mainWindow) {
    mainWindow.webContents.send('mode-changed', mode);
  }
}

let lastPosition = null;

function toggleVisibility() {
  if (!mainWindow) return;
  isVisible = !isVisible;
  if (isVisible) {
    if (lastPosition) {
      mainWindow.setPosition(lastPosition[0], lastPosition[1]);
    } else {
      mainWindow.center();
    }
    mainWindow.setContentProtection(true);
  } else {
    lastPosition = mainWindow.getPosition();
    mainWindow.setContentProtection(false);
    mainWindow.setPosition(-5000, -5000);
  }
}


function registerShortcuts() {
  // Ctrl+Shift+Space → Toggle overlay visibility
  globalShortcut.register('Ctrl+Shift+Space', () => {
    toggleVisibility();
  });

  // Ctrl+Shift+A → Start/Stop listening
  globalShortcut.register('Ctrl+Shift+A', () => {
    isListening = !isListening;
    if (mainWindow) {
      mainWindow.webContents.send(
        'command',
        isListening ? 'start-listening' : 'stop-listening'
      );
    }
  });

  // Ctrl+Shift+C → Clear context
  globalShortcut.register('Ctrl+Shift+C', () => {
    if (mainWindow) mainWindow.webContents.send('command', 'clear-context');
  });

  // Ctrl+Shift+M → Cycle modes
  globalShortcut.register('Ctrl+Shift+M', () => {
    const modes = ['interview', 'meeting', 'coding', 'general'];
    const nextIdx = (modes.indexOf(currentMode) + 1) % modes.length;
    setMode(modes[nextIdx]);
  });

  // Ctrl+Shift+H → Toggle stealth mode (0.1 opacity)
  globalShortcut.register('Ctrl+Shift+H', () => {
    if (mainWindow) mainWindow.webContents.send('command', 'toggle-stealth');
  });

  // Ctrl+Shift+T → Toggle text-only mode (No full box)
  globalShortcut.register('Ctrl+Shift+T', () => {
    if (mainWindow) mainWindow.webContents.send('command', 'toggle-text-only');
  });

  // Ctrl+Shift+K → Toggle Click-Through mode (Mouse pass-through)
  globalShortcut.register('Ctrl+Shift+K', () => {
    if (mainWindow) mainWindow.webContents.send('command', 'toggle-click-through');
  });

  // Ctrl+Shift+S → Screen Capture & Solve (OCR)
  globalShortcut.register('Ctrl+Shift+S', () => {
    if (mainWindow) mainWindow.webContents.send('command', 'capture-screen-trigger');
  });
}

// IPC handlers (messages from renderer)
ipcMain.on('open-external', (_, url) => {
  if (url) {
    const { shell } = require('electron');
    shell.openExternal(url);
  }
});
ipcMain.on('toggle-visibility', () => toggleVisibility());
ipcMain.on('set-mode', (_, mode) => setMode(mode));
ipcMain.on('resize-window', (_, { width, height }) => {
  if (mainWindow) mainWindow.setSize(width, height);
});

ipcMain.on('window-drag-move', (_, { deltaX, deltaY }) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + deltaX, y + deltaY);
});

ipcMain.on('set-click-through', (_, flag) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(flag, { forward: true });
  }
});

ipcMain.on('hide-window', () => {
  if (mainWindow && isVisible) {
    toggleVisibility();
  }
});

ipcMain.on('show-window', () => {
  if (mainWindow && !isVisible) {
    toggleVisibility();
  }
});

ipcMain.on('set-always-on-top', (_, flag) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(flag);
  }
});

ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window']
  });
  return sources.map(s => ({ id: s.id, name: s.name }));
});

ipcMain.on('capture-screen', async (event) => {
  if (!mainWindow) return;
  const [oldX, oldY] = mainWindow.getPosition();
  
  // Temporarily disable content protection & hide window off-screen to capture clean screenshot
  mainWindow.setContentProtection(false);
  mainWindow.setPosition(-5000, -5000);

  setTimeout(async () => {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.size;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.min(1920, width), height: Math.min(1080, height) }
      });

      if (sources && sources.length > 0) {
        const dataUrl = sources[0].thumbnail.toDataURL();
        event.reply('screen-captured', dataUrl);
      } else {
        event.reply('screen-capture-failed', 'No display sources found for screenshot');
      }
    } catch (e) {
      console.error('Screen capture failed:', e);
      event.reply('screen-capture-failed', e.message || 'Capture exception');
    } finally {
      if (mainWindow) {
        mainWindow.setPosition(oldX, oldY);
        mainWindow.setContentProtection(true);
      }
    }
  }, 150);
});

app.whenReady().then(() => {
  startEmbeddedEngine();
  const isHeadless = process.argv.includes('--headless');
  if (!isHeadless) {
    createOverlayWindow();
    createTray();
    registerShortcuts();
    console.log('👻 Ghost AI overlay started');
    console.log('⌨️ Shortcuts:');
    console.log('   Ctrl+Shift+Space → Toggle overlay');
    console.log('   Ctrl+Shift+A     → Start/Stop listening');
    console.log('   Ctrl+Shift+C     → Clear context');
    console.log('   Ctrl+Shift+M     → Cycle modes');
  } else {
    console.log('👻 Ghost AI running in background (headless mode)');
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
