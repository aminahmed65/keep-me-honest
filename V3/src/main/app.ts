// Set DYLD_LIBRARY_PATH for sherpa-onnx native libs before any imports
import * as path from 'path';
const nodeModulesPath = path.join(__dirname, '../../node_modules');
const sherpaLibPath = path.join(nodeModulesPath, 'sherpa-onnx-darwin-arm64');
if (!process.env.DYLD_LIBRARY_PATH?.includes(sherpaLibPath)) {
  process.env.DYLD_LIBRARY_PATH = sherpaLibPath + (process.env.DYLD_LIBRARY_PATH ? ':' + process.env.DYLD_LIBRARY_PATH : '');
}

import {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  globalShortcut,
  ipcMain,
  screen,
} from 'electron';
import * as fs from 'fs';
import { store } from './store';
import { registerIpcHandlers } from './ipc-handlers';
import { stopDaemon, initRecognizer } from './transcription';
import { modelManager } from './model-manager';
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
let popoverAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

function showPopoverBriefly(): void {
  if (!popoverWindow) return;
  // Position and show
  const bounds = tray?.getBounds();
  if (bounds) {
    const winBounds = popoverWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const x = Math.round(bounds.x + bounds.width / 2 - winBounds.width / 2);
    const y = bounds.y + bounds.height + 4;
    const maxX = display.workArea.x + display.workArea.width - winBounds.width;
    popoverWindow.setPosition(Math.min(x, maxX), y, false);
  }
  popoverWindow.showInactive(); // show without stealing focus from the active app

  // Cancel any pending auto-hide
  if (popoverAutoHideTimer) clearTimeout(popoverAutoHideTimer);
  popoverAutoHideTimer = null;
}

function autoHidePopover(): void {
  // Hide after a short delay so the user sees "Transcribing..."
  if (popoverAutoHideTimer) clearTimeout(popoverAutoHideTimer);
  popoverAutoHideTimer = setTimeout(() => {
    if (popoverWindow?.isVisible() && !popoverWindow.isFocused()) {
      popoverWindow.hide();
    }
    popoverAutoHideTimer = null;
  }, 1500);
}

function startRecordingViaHotkey(): void {
  hotkeyRecording = true;
  setTrayRecording(true);
  popoverWindow?.webContents.send(IPC.RECORDING_STATE, true);
  showPopoverBriefly();
  console.log('[hotkey] Recording started');
}

function stopRecordingViaHotkey(): void {
  hotkeyRecording = false;
  setTrayRecording(false);
  popoverWindow?.webContents.send(IPC.RECORDING_STATE, false);
  autoHidePopover();
  console.log('[hotkey] Recording stopped, waiting for audio...');
}

function registerHotkey(): void {
  const settings = store.getSettings();
  const hotkey = settings.hotkey || 'CommandOrControl+Shift+Space';
  const mode = settings.recordingMode || 'toggle';

  try {
    globalShortcut.unregisterAll();

    if (mode === 'push-to-talk') {
      // Key down = start, key up = stop
      // Electron doesn't have native keyup for globalShortcut, so we use
      // a rapid re-fire approach: register the shortcut, on first fire start
      // recording, then poll for key release via a short interval.
      // Alternative: use two shortcuts (one for start, one implicitly on next press).
      // Simplest correct approach: treat push-to-talk as "hold = record".
      // We register the shortcut — Electron fires it on keydown.
      // We start a polling interval that checks if the key combo is still held.
      // Unfortunately globalShortcut doesn't expose keyup, so we approximate:
      // After starting, we set a short interval. If the shortcut fires again
      // (auto-repeat), we ignore it. When the interval detects no recent fire,
      // we stop recording.
      let lastFireTime = 0;
      let pttInterval: ReturnType<typeof setInterval> | null = null;

      globalShortcut.register(hotkey, () => {
        lastFireTime = Date.now();

        if (!hotkeyRecording) {
          startRecordingViaHotkey();

          // Poll: if no repeat fire for 300ms, key was released
          pttInterval = setInterval(() => {
            if (Date.now() - lastFireTime > 300) {
              if (pttInterval) clearInterval(pttInterval);
              pttInterval = null;
              if (hotkeyRecording) stopRecordingViaHotkey();
            }
          }, 100);
        }
        // else: auto-repeat fire, just update lastFireTime (already done above)
      });
    } else {
      // Toggle mode: press once to start, press again to stop
      globalShortcut.register(hotkey, () => {
        if (hotkeyRecording) {
          stopRecordingViaHotkey();
        } else {
          startRecordingViaHotkey();
        }
      });
    }

    console.log(`[hotkey] Registered: ${hotkey} (${mode})`);
  } catch (e) {
    console.error(`[hotkey] Failed to register "${hotkey}":`, e);
  }
}

// --- App Lifecycle ---

app.whenReady().then(async () => {
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

  // Re-register hotkey when settings change
  ipcMain.on(IPC.RE_REGISTER_HOTKEY, () => {
    registerHotkey();
  });

  // Pre-initialize recognizer if model is already downloaded (non-blocking)
  if (modelManager.isReady()) {
    initRecognizer().catch(e => {
      console.error('[app] Failed to pre-init recognizer:', e);
    });
  }

  console.log('[app] Keep Me Honest ready');
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopDaemon();
});

app.on('window-all-closed', () => {
  // Don't quit — this is a menu bar app
});
