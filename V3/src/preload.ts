import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './shared/types';

contextBridge.exposeInMainWorld('api', {
  // Commitments
  getCommitments: () => ipcRenderer.invoke(IPC.GET_COMMITMENTS),
  toggleDone: (id: string) => ipcRenderer.invoke(IPC.TOGGLE_DONE, id),
  dismissCommitment: (id: string) => ipcRenderer.invoke(IPC.DISMISS_COMMITMENT, id),
  clearAll: () => ipcRenderer.invoke(IPC.CLEAR_ALL),
  clearDone: () => ipcRenderer.invoke(IPC.CLEAR_DONE),
  copyAll: () => ipcRenderer.invoke(IPC.COPY_ALL),

  // People
  getPeople: () => ipcRenderer.invoke(IPC.GET_PEOPLE),
  addPerson: (name: string, role: string, notes: string) =>
    ipcRenderer.invoke(IPC.ADD_PERSON, name, role, notes),
  removePerson: (id: string) => ipcRenderer.invoke(IPC.REMOVE_PERSON, id),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  saveSettings: (s: any) => ipcRenderer.invoke(IPC.SAVE_SETTINGS, s),

  // Actions
  openSettings: () => ipcRenderer.send(IPC.OPEN_SETTINGS),
  quit: () => ipcRenderer.send(IPC.QUIT_APP),
  toggleRecording: () => ipcRenderer.invoke(IPC.TOGGLE_RECORDING),
  sendAudio: (data: ArrayBuffer) => ipcRenderer.invoke(IPC.SEND_AUDIO, data),

  // Events from main
  onCommitmentsUpdated: (cb: (data: any) => void) => {
    ipcRenderer.on(IPC.COMMITMENTS_UPDATED, (_, d) => cb(d));
  },
  onRecordingState: (cb: (isRec: boolean) => void) => {
    ipcRenderer.on(IPC.RECORDING_STATE, (_, r) => cb(r));
  },
  onTranscriptionStatus: (cb: (msg: string) => void) => {
    ipcRenderer.on(IPC.TRANSCRIPTION_STATUS, (_, m) => cb(m));
  },
});
