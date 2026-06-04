const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isListening = false;
let isVisible = true;
let currentMode = 'interview';

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 420,
    height: 520,
    x: width - 440,
    y: height - 560,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
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
}

// IPC handlers (messages from renderer)
ipcMain.on('toggle-visibility', () => toggleVisibility());
ipcMain.on('set-mode', (_, mode) => setMode(mode));
ipcMain.on('resize-window', (_, { width, height }) => {
  if (mainWindow) mainWindow.setSize(width, height);
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
  mainWindow.setPosition(-5000, -5000); // Move off-screen instead of hiding

  setTimeout(async () => {
    try {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      });

      if (sources && sources.length > 0) {
        event.reply('screen-captured', sources[0].thumbnail.toDataURL());
      }
    } catch (e) {
      console.error('Capture failed:', e);
    } finally {
      if (mainWindow) {
        mainWindow.setPosition(oldX, oldY); // Move back
        mainWindow.setContentProtection(true);
      }
    }
  }, 200);
});

app.whenReady().then(() => {
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
