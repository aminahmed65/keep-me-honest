import {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  globalShortcut,
  ipcMain,
  screen,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { store } from './store';
import { registerIpcHandlers } from './ipc-handlers';
import { stopDaemon } from './transcription';
import { IPC } from '../shared/types';

let tray: Tray | null = null;
let popoverWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

// --- Tray ---

function createTray(): void {
  const iconPath = path.join(__dirname, '../../assets/trayTemplate.png');
  let icon: Electron.NativeImage;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
  } else {
    // Fallback: create a tiny 1px image and use title text
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Keep Me Honest');

  tray.on('click', (_event, bounds) => {
    togglePopover(bounds);
  });

  // Right-click shows a simple context menu as fallback
  tray.on('right-click', () => {
    togglePopover(tray!.getBounds());
  });
}

function setTrayRecording(isRecording: boolean): void {
  if (!tray) return;
  if (isRecording) {
    const recPath = path.join(__dirname, '../../assets/trayRecording.png');
    if (fs.existsSync(recPath)) {
      const recIcon = nativeImage.createFromPath(recPath);
      tray.setImage(recIcon);
    }
    tray.setTitle('REC');
  } else {
    const iconPath = path.join(__dirname, '../../assets/trayTemplate.png');
    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      icon.setTemplateImage(true);
      tray.setImage(icon);
    }
    tray.setTitle('');
  }
}

// --- Popover Window ---

function createPopoverWindow(): void {
  popoverWindow = new BrowserWindow({
    width: 380,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    vibrancy: 'popover',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popoverWindow.loadFile(path.join(__dirname, '../../ui/popover.html'));

  // DEBUG: pipe renderer console to main stdout
  popoverWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log(`[renderer] ${message}`);
  });

  // Delay blur-hide so button clicks can fire first
  popoverWindow.on('blur', () => {
    setTimeout(() => {
      if (popoverWindow?.isVisible() && !popoverWindow.isFocused()) {
        popoverWindow.hide();
      }
    }, 150);
  });
}

function togglePopover(trayBounds?: Electron.Rectangle): void {
  if (!popoverWindow) return;

  if (popoverWindow.isVisible()) {
    popoverWindow.hide();
    return;
  }

  // Position below tray icon
  const bounds = trayBounds || tray?.getBounds();
  if (bounds) {
    const winBounds = popoverWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const x = Math.round(bounds.x + bounds.width / 2 - winBounds.width / 2);
    const y = bounds.y + bounds.height + 4;

    // Clamp to screen
    const maxX = display.workArea.x + display.workArea.width - winBounds.width;
    popoverWindow.setPosition(Math.min(x, maxX), y, false);
  }

  popoverWindow.show();
  popoverWindow.focus();
}

// --- Settings Window ---

function createSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'Keep Me Honest — Settings',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'window',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, '../../ui/settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// --- Global Hotkey ---

let hotkeyRecording = false;

function registerHotkey(): void {
  const hotkey = store.getSettings().hotkey || 'CommandOrControl+Shift+Space';
  try {
    globalShortcut.unregisterAll();
    globalShortcut.register(hotkey, () => {
      hotkeyRecording = !hotkeyRecording;
      setTrayRecording(hotkeyRecording);
      // Tell renderer to start or stop MediaRecorder
      popoverWindow?.webContents.send(IPC.RECORDING_STATE, hotkeyRecording);
      if (!hotkeyRecording) {
        // Recording stopped — renderer will send audio via SEND_AUDIO IPC
        console.log('[hotkey] Recording stopped, waiting for audio...');
      } else {
        console.log('[hotkey] Recording started');
      }
    });
    console.log(`[hotkey] Registered: ${hotkey}`);
  } catch (e) {
    console.error(`[hotkey] Failed to register "${hotkey}":`, e);
  }
}

// --- App Lifecycle ---

app.whenReady().then(() => {
  // Hide from Dock (menu bar only app)
  app.dock?.hide();

  createTray();
  createPopoverWindow();

  // Register IPC
  registerIpcHandlers(() => popoverWindow, setTrayRecording);

  // Additional IPC for window management
  ipcMain.on(IPC.OPEN_SETTINGS, () => {
    popoverWindow?.hide();
    createSettingsWindow();
  });
  ipcMain.on(IPC.QUIT_APP, () => app.quit());

  // Register global hotkey
  registerHotkey();

  // Reset recording state when audio is received
  ipcMain.on('recording-done', () => { hotkeyRecording = false; });

  console.log('[app] Keep Me Honest ready');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopDaemon();
});

app.on('window-all-closed', () => {
  // Don't quit — this is a menu bar app
});
