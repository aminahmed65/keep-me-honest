const { contextBridge, ipcRenderer } = require('electron');

// IPC channel names inlined (preload sandbox can't resolve sibling modules)
const IPC = {
  GET_COMMITMENTS: 'get-commitments',
  TOGGLE_DONE: 'toggle-done',
  DISMISS_COMMITMENT: 'dismiss-commitment',
  CLEAR_ALL: 'clear-all-commitments',
  CLEAR_DONE: 'clear-done-commitments',
  COPY_ALL: 'copy-all-commitments',
  GET_PEOPLE: 'get-people',
  ADD_PERSON: 'add-person',
  REMOVE_PERSON: 'remove-person',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  OPEN_SETTINGS: 'open-settings',
  QUIT_APP: 'quit-app',
  TOGGLE_RECORDING: 'toggle-recording',
  SEND_AUDIO: 'send-audio',
  COMMITMENTS_UPDATED: 'commitments-updated',
  RECORDING_STATE: 'recording-state',
  TRANSCRIPTION_STATUS: 'transcription-status',
};

contextBridge.exposeInMainWorld('api', {
  getCommitments: () => ipcRenderer.invoke(IPC.GET_COMMITMENTS),
  toggleDone: (id: string) => ipcRenderer.invoke(IPC.TOGGLE_DONE, id),
  dismissCommitment: (id: string) => ipcRenderer.invoke(IPC.DISMISS_COMMITMENT, id),
  clearAll: () => ipcRenderer.invoke(IPC.CLEAR_ALL),
  clearDone: () => ipcRenderer.invoke(IPC.CLEAR_DONE),
  copyAll: () => ipcRenderer.invoke(IPC.COPY_ALL),

  getPeople: () => ipcRenderer.invoke(IPC.GET_PEOPLE),
  addPerson: (name: string, role: string, notes: string) =>
    ipcRenderer.invoke(IPC.ADD_PERSON, name, role, notes),
  removePerson: (id: string) => ipcRenderer.invoke(IPC.REMOVE_PERSON, id),

  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  saveSettings: (s: any) => ipcRenderer.invoke(IPC.SAVE_SETTINGS, s),

  openSettings: () => ipcRenderer.send(IPC.OPEN_SETTINGS),
  quit: () => ipcRenderer.send(IPC.QUIT_APP),
  toggleRecording: () => ipcRenderer.invoke(IPC.TOGGLE_RECORDING),
  sendAudio: (data: ArrayBuffer) => ipcRenderer.invoke(IPC.SEND_AUDIO, data),

  onCommitmentsUpdated: (cb: (data: any) => void) => {
    ipcRenderer.on(IPC.COMMITMENTS_UPDATED, (_: any, d: any) => cb(d));
  },
  onRecordingState: (cb: (isRec: boolean) => void) => {
    ipcRenderer.on(IPC.RECORDING_STATE, (_: any, r: boolean) => cb(r));
  },
  onTranscriptionStatus: (cb: (msg: string) => void) => {
    ipcRenderer.on(IPC.TRANSCRIPTION_STATUS, (_: any, m: string) => cb(m));
  },
});
