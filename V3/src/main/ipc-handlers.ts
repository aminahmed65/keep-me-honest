import { ipcMain, clipboard, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { store } from './store';
import { transcribeAudio } from './transcription';
import { extractPromises } from './extraction';
import { IPC } from '../shared/types';

let isRecording = false;
let popoverWindow: BrowserWindow | null = null;
let onTrayUpdate: ((recording: boolean) => void) | null = null;

export function registerIpcHandlers(
  getPopover: () => BrowserWindow | null,
  trayCallback: (recording: boolean) => void,
): void {
  popoverWindow = getPopover();
  onTrayUpdate = trayCallback;

  // --- Commitments ---
  ipcMain.handle(IPC.GET_COMMITMENTS, () => store.getCommitments());
  ipcMain.handle(IPC.TOGGLE_DONE, (_, id: string) => {
    store.toggleDone(id);
    broadcastCommitments();
  });
  ipcMain.handle(IPC.DISMISS_COMMITMENT, (_, id: string) => {
    store.dismissCommitment(id);
    broadcastCommitments();
  });
  ipcMain.handle(IPC.CLEAR_ALL, () => {
    store.clearAll();
    broadcastCommitments();
  });
  ipcMain.handle(IPC.CLEAR_DONE, () => {
    store.clearDone();
    broadcastCommitments();
  });
  ipcMain.handle(IPC.COPY_ALL, () => {
    const text = store.getActiveCommitmentsText();
    if (text) clipboard.writeText(text);
    return text;
  });

  // --- People ---
  ipcMain.handle(IPC.GET_PEOPLE, () => store.getPeople());
  ipcMain.handle(IPC.ADD_PERSON, (_, name: string, role: string, notes: string) => {
    store.addPerson(name, role, notes);
    return store.getPeople();
  });
  ipcMain.handle(IPC.REMOVE_PERSON, (_, id: string) => {
    store.removePerson(id);
    return store.getPeople();
  });

  // --- Settings ---
  ipcMain.handle(IPC.GET_SETTINGS, () => store.getSettings());
  ipcMain.handle(IPC.SAVE_SETTINGS, (_, settings) => {
    store.saveSettings(settings);
    return store.getSettings();
  });

  // --- Recording ---
  ipcMain.handle(IPC.TOGGLE_RECORDING, () => {
    isRecording = !isRecording;
    onTrayUpdate?.(isRecording);
    // Tell renderer to start/stop MediaRecorder
    const win = getPopover();
    win?.webContents.send(IPC.RECORDING_STATE, isRecording);
    return isRecording;
  });

  ipcMain.handle(IPC.SEND_AUDIO, async (_, audioData: ArrayBuffer) => {
    isRecording = false;
    onTrayUpdate?.(false);

    const buffer = Buffer.from(audioData);
    console.log(`[ipc] Received ${buffer.length} bytes of audio`);

    const win = getPopover();

    try {
      // 1. Transcribe
      win?.webContents.send(IPC.TRANSCRIPTION_STATUS, 'Transcribing...');
      const settings = store.getSettings();
      const transcript = await transcribeAudio(buffer, settings);
      console.log(`[ipc] Transcript: ${transcript.slice(0, 80)}...`);

      // 2. Auto-paste
      if (transcript.trim()) {
        clipboard.writeText(transcript);
        exec('osascript -e \'tell application "System Events" to keystroke "v" using command down\'');
      }

      // 3. Extract promises
      if (settings.commitmentExtractionEnabled && settings.openRouterApiKey) {
        win?.webContents.send(IPC.TRANSCRIPTION_STATUS, 'Extracting promises...');
        try {
          const extracted = await extractPromises(transcript);
          if (extracted.length > 0) {
            store.addCommitmentsFromExtraction(extracted);
            broadcastCommitments();
          }
        } catch (e) {
          console.error('[ipc] Extraction failed:', e);
        }
      }

      win?.webContents.send(IPC.TRANSCRIPTION_STATUS, '');
      return { ok: true, transcript };
    } catch (e: any) {
      console.error('[ipc] Transcription pipeline failed:', e);
      win?.webContents.send(IPC.TRANSCRIPTION_STATUS, '');
      return { ok: false, error: e.message };
    }
  });
}

function broadcastCommitments(): void {
  const commitments = store.getCommitments();
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(IPC.COMMITMENTS_UPDATED, commitments);
  });
}
