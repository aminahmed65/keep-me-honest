import { ipcMain, clipboard, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { store } from './store';
import { transcribeAudio, initRecognizer } from './transcription';
import { extractPromises } from './extraction';
import { modelManager } from './model-manager';
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

  ipcMain.handle(IPC.ADD_COMMITMENT, (_, promise: string, deadline: string | null) => {
    store.addManualCommitment(promise, deadline);
    broadcastCommitments();
  });

  ipcMain.handle(IPC.REORDER_COMMITMENTS, (_, orderedIds: string[]) => {
    store.reorderCommitments(orderedIds);
    broadcastCommitments();
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

  // --- Model management ---
  ipcMain.handle(IPC.GET_MODEL_STATUS, () => modelManager.getState());
  ipcMain.handle(IPC.DOWNLOAD_MODEL, async () => {
    try {
      await modelManager.download();
      // Auto-initialize recognizer after download
      try {
        await initRecognizer();
      } catch (e) {
        console.error('[ipc] Failed to init recognizer after download:', e);
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
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

  ipcMain.handle(IPC.SEND_AUDIO, async (_, audioData: { sampleRate: number; samples: number[] }) => {
    isRecording = false;
    onTrayUpdate?.(false);

    const samples = new Float32Array(audioData.samples);
    console.log(`[ipc] Received ${samples.length} samples at ${audioData.sampleRate}Hz`);

    const win = getPopover();

    try {
      // 1. Transcribe via local sherpa-onnx
      win?.webContents.send(IPC.TRANSCRIPTION_STATUS, 'Transcribing...');
      const transcript = await transcribeAudio(samples, audioData.sampleRate);
      console.log(`[ipc] Transcript: ${transcript.slice(0, 80)}...`);

      // 2. Auto-paste
      if (transcript.trim()) {
        clipboard.writeText(transcript);
        exec('osascript -e \'tell application "System Events" to keystroke "v" using command down\'');
      }

      // 3. Extract promises
      const currentSettings = store.getSettings();
      if (currentSettings.commitmentExtractionEnabled && currentSettings.openRouterApiKey) {
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
