// @ts-check
/// <reference path="./api.d.ts" />

const SECTIONS = [
  { id: 'general',  icon: '\u2699\uFE0F', label: 'General',  desc: 'Configure hotkeys and basic preferences' },
  { id: 'model',    icon: '\uD83E\uDDE0', label: 'Model',    desc: 'Manage the local speech recognition model' },
  { id: 'promises', icon: '\u2705',       label: 'Promises', desc: 'Extract promises from your speech' },
  { id: 'people',   icon: '\uD83D\uDC65', label: 'People',   desc: 'People you regularly talk to' },
];

let currentSection = 'general';
let settings = {};
let people = [];
let isAddingPerson = false;
let modelState = { status: 'not-downloaded', progress: 0, error: null, modelPath: null };

const sidebarEl = document.getElementById('sidebar');
const contentEl = document.getElementById('content');

// --- Init ---
async function init() {
  settings = await window.api.getSettings();
  people = await window.api.getPeople();
  modelState = await window.api.getModelStatus();
  renderSidebar();
  renderContent();

  // Listen for model status updates
  window.api.onModelStatusUpdated((state) => {
    modelState = state;
    if (currentSection === 'model') renderContent();
  });
}

// --- Sidebar ---
function renderSidebar() {
  sidebarEl.innerHTML = SECTIONS.map(s =>
    `<div class="sidebar-item ${s.id === currentSection ? 'active' : ''}" data-section="${s.id}">
       <span class="icon">${s.icon}</span>${s.label}
     </div>`
  ).join('');

  sidebarEl.querySelectorAll('.sidebar-item').forEach(el => {
    el.addEventListener('click', () => {
      currentSection = el.dataset.section;
      isAddingPerson = false;
      renderSidebar();
      renderContent();
    });
  });
}

// --- Content ---
function renderContent() {
  const section = SECTIONS.find(s => s.id === currentSection);
  let html = `
    <div class="settings-header">
      <div class="section-icon">${section.icon}</div>
      <h2>${section.label}</h2>
      <p>${section.desc}</p>
    </div>`;

  switch (currentSection) {
    case 'general':  html += generalHTML(); break;
    case 'model':    html += modelHTML(); break;
    case 'promises': html += promisesHTML(); break;
    case 'people':   html += peopleHTML(); break;
  }

  contentEl.innerHTML = html;
  attachListeners();
}

let isRecordingHotkey = false;

// --- General ---
function generalHTML() {
  const hotkey = settings.hotkey || 'CommandOrControl+Shift+Space';
  const displayKey = hotkey
    .replace('CommandOrControl', 'Cmd')
    .replace('Command', 'Cmd')
    .replace('Control', 'Ctrl')
    .replace(/\+/g, ' + ');
  const mode = settings.recordingMode || 'toggle';

  return `
    <div class="card">
      <div class="card-row">
        <label>Global Hotkey</label>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="hotkey-display ${isRecordingHotkey ? 'recording' : ''}" id="hotkey-display">
            ${isRecordingHotkey ? 'Press keys...' : displayKey}
          </span>
          <button class="hotkey-change-btn" id="hotkey-change-btn">
            ${isRecordingHotkey ? 'Cancel' : 'Change'}
          </button>
        </div>
      </div>
      <div style="padding: 2px 16px 10px; font-size:10px; color:var(--text-tertiary); line-height:1.4;">
        Any key combo works (e.g. Cmd+Shift+Space). Single keys like F5 or F13 also work.<br>
        Bare modifier keys (Option, Shift alone) are not supported by Electron.
      </div>
    </div>
    <div class="card">
      <div class="card-row">
        <label>Recording Mode</label>
        <select id="recording-mode">
          <option value="toggle" ${mode === 'toggle' ? 'selected' : ''}>Toggle (press to start/stop)</option>
          <option value="push-to-talk" ${mode === 'push-to-talk' ? 'selected' : ''}>Push to Talk (hold to record)</option>
        </select>
      </div>
    </div>`;
}

// --- Model ---
function modelHTML() {
  const status = modelState.status;
  let statusContent = '';

  if (status === 'not-downloaded' || status === 'download-failed') {
    statusContent = `
      <div class="card">
        <div style="padding: 16px;">
          <div style="font-size:13px; font-weight:500; margin-bottom:8px;">Parakeet v3 (local)</div>
          <div style="font-size:11px; color:var(--text-secondary); margin-bottom:12px;">
            Download the speech recognition model (~640 MB) to enable transcription.
          </div>
          ${status === 'download-failed' ? `<div style="font-size:11px; color:var(--red); margin-bottom:8px;">Download failed: ${esc(modelState.error || 'Unknown error')}</div>` : ''}
          <button class="download-model-btn" id="download-btn">Download Model</button>
        </div>
      </div>`;
  } else if (status === 'downloading') {
    const pct = modelState.progress || 0;
    statusContent = `
      <div class="card">
        <div style="padding: 16px;">
          <div style="font-size:13px; font-weight:500; margin-bottom:8px;">Downloading model...</div>
          <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div style="font-size:11px; color:var(--text-secondary); margin-top:6px;">${pct}% complete</div>
        </div>
      </div>`;
  } else {
    // ready / loading / loaded
    const label = status === 'loaded' ? 'Loaded and ready' : status === 'loading' ? 'Loading...' : 'Downloaded and ready';
    statusContent = `
      <div class="card">
        <div class="card-row">
          <label>Parakeet v3 (local)</label>
          <span style="font-size:12px; color:var(--green); font-weight:500;">${label}</span>
        </div>
      </div>`;
  }

  return statusContent + `
    <div class="card">
      <div style="padding: 12px 16px;">
        <div style="font-size:11px; color:var(--text-secondary); line-height:1.6;">
          Runs entirely on your Mac. No audio is sent to any server.<br>
          Model: sherpa-onnx Parakeet TDT 0.6B (int8 quantized)
        </div>
      </div>
    </div>`;
}

// --- Promises ---
function promisesHTML() {
  return `
    <div class="card">
      <div class="card-row">
        <label>Enable promise extraction</label>
        <div class="toggle ${settings.commitmentExtractionEnabled ? 'on' : ''}" id="toggle-extraction"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-row">
        <label>OpenRouter API Key</label>
        <input type="password" id="routerKey" value="${settings.openRouterApiKey || ''}" placeholder="sk-or-...">
      </div>
    </div>
    <div class="card">
      <div style="padding: 12px 16px;">
        <div style="font-size:13px; font-weight:500; margin-bottom:8px;">How it works</div>
        <div style="font-size:11px; color:var(--text-secondary); line-height:1.6;">
          1. Press the hotkey to start recording<br>
          2. Speak naturally, press again to stop<br>
          3. Speech is transcribed locally via Parakeet v3<br>
          4. Transcript is pasted into your active app<br>
          5. Promises are extracted via OpenRouter and appear in the popover
        </div>
      </div>
    </div>`;
}

// --- People ---
function peopleHTML() {
  let rows = '';
  if (people.length === 0 && !isAddingPerson) {
    rows = `
      <div class="empty-state" style="padding:24px;">
        <div class="icon">\uD83D\uDC65</div>
        <h3>No people added yet</h3>
        <p>Add people you regularly talk to.<br>Helps attribute promises correctly.</p>
      </div>`;
  } else {
    rows = people.map(p => `
      <div class="person-row" data-id="${p.id}">
        <div class="person-info">
          <div class="name">${esc(p.name)}</div>
          ${p.role ? `<div class="role">${esc(p.role)}</div>` : ''}
          ${p.notes ? `<div class="notes">${esc(p.notes)}</div>` : ''}
        </div>
        <span class="delete-btn" data-id="${p.id}" title="Remove">\u2715</span>
      </div>
    `).join('');
  }

  let form = '';
  if (isAddingPerson) {
    form = `
      <div class="add-form" id="add-form">
        <input type="text" id="new-name" placeholder="Name" autofocus>
        <input type="text" id="new-role" placeholder="Role / Relationship (optional)">
        <input type="text" id="new-notes" placeholder="Notes (optional)">
        <div class="form-actions">
          <button id="cancel-add">Cancel</button>
          <button class="save-btn" id="save-person">Save</button>
        </div>
      </div>`;
  }

  return `
    <div class="card">
      ${rows}
      ${form}
    </div>
    ${!isAddingPerson ? '<button class="add-person-btn" id="add-btn">+ Add Person</button>' : ''}`;
}

// --- Hotkey recording ---
let hotkeyListener = null;

function startHotkeyRecording() {
  isRecordingHotkey = true;
  renderContent();

  hotkeyListener = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Escape always cancels
    if (e.key === 'Escape') {
      stopHotkeyRecording();
      return;
    }

    // Ignore bare modifier keys — wait for the actual key
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    const parts = [];
    if (e.metaKey) parts.push('CommandOrControl');
    else if (e.ctrlKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // Map the key
    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key === 'Dead') key = 'Space'; // dead keys on some layouts
    else if (key.length === 1) key = key.toUpperCase();
    else if (key === 'ArrowUp') key = 'Up';
    else if (key === 'ArrowDown') key = 'Down';
    else if (key === 'ArrowLeft') key = 'Left';
    else if (key === 'ArrowRight') key = 'Right';
    // F-keys, Backspace, Delete, Tab, etc. pass through as-is

    parts.push(key);
    const combo = parts.join('+');

    stopHotkeyRecording();
    settings.hotkey = combo;
    save({ hotkey: combo });
    window.api.reRegisterHotkey();
    renderContent();
  };

  document.addEventListener('keydown', hotkeyListener, true);
}

function stopHotkeyRecording() {
  isRecordingHotkey = false;
  if (hotkeyListener) {
    document.removeEventListener('keydown', hotkeyListener, true);
    hotkeyListener = null;
  }
}

// --- Attach event listeners ---
function attachListeners() {
  // General — hotkey change
  const hotkeyBtn = document.getElementById('hotkey-change-btn');
  if (hotkeyBtn) {
    hotkeyBtn.addEventListener('click', () => {
      if (isRecordingHotkey) {
        stopHotkeyRecording();
        renderContent();
      } else {
        startHotkeyRecording();
      }
    });
  }

  // General — recording mode
  const modeSelect = document.getElementById('recording-mode');
  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      settings.recordingMode = modeSelect.value;
      save({ recordingMode: modeSelect.value });
      window.api.reRegisterHotkey();
    });
  }

  // Promises
  const toggleExtract = document.getElementById('toggle-extraction');
  if (toggleExtract) {
    toggleExtract.addEventListener('click', () => {
      settings.commitmentExtractionEnabled = !settings.commitmentExtractionEnabled;
      save({ commitmentExtractionEnabled: settings.commitmentExtractionEnabled });
      renderContent();
    });
  }
  const routerEl = document.getElementById('routerKey');
  if (routerEl) {
    routerEl.addEventListener('change', () => save({ openRouterApiKey: routerEl.value }));
  }

  // Model — download button
  const downloadBtn = document.getElementById('download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      window.api.downloadModel();
    });
  }

  // People — delete buttons
  document.querySelectorAll('.delete-btn[data-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      people = await window.api.removePerson(btn.dataset.id);
      renderContent();
    });
  });

  // People — add button
  const addBtn = document.getElementById('add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => { isAddingPerson = true; renderContent(); });
  }

  // People — form
  const cancelBtn = document.getElementById('cancel-add');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => { isAddingPerson = false; renderContent(); });
  }

  const saveBtn = document.getElementById('save-person');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = document.getElementById('new-name').value.trim();
      if (!name) return;
      const role = document.getElementById('new-role').value.trim();
      const notes = document.getElementById('new-notes').value.trim();
      people = await window.api.addPerson(name, role, notes);
      isAddingPerson = false;
      renderContent();
    });
  }

  // Auto-focus name field
  const nameField = document.getElementById('new-name');
  if (nameField) nameField.focus();
}

async function save(partial) {
  settings = await window.api.saveSettings(partial);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- Boot ---
init();
