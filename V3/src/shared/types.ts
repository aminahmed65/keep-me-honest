export interface Person {
  id: string;
  name: string;
  role: string;
  notes: string;
}

export interface Commitment {
  id: string;
  promise: string;
  assignedTo: string | null;
  deadline: string | null;
  contextQuote: string;
  isDone: boolean;
  createdAt: string;
}

export interface Settings {
  hotkey: string;
  transcriptionProvider: 'groq' | 'openai';
  groqApiKey: string;
  openaiApiKey: string;
  openRouterApiKey: string;
  commitmentExtractionEnabled: boolean;
  startAtLogin: boolean;
}

export interface StoreData {
  settings: Settings;
  commitments: Commitment[];
  people: Person[];
}

export interface ExtractedCommitment {
  promise: string;
  assigned_to: string;
  deadline: string;
  context_quote: string;
}

export interface ExtractionResult {
  promises: ExtractedCommitment[];
  summary: string;
}

// IPC channel names
export const IPC = {
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
} as const;
