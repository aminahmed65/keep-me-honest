// @ts-check
/// <reference path="./api.d.ts" />

const SECTIONS = [
  { id: 'general',  icon: '\u2699\uFE0F', label: 'General',  desc: 'Configure hotkeys and basic preferences' },
  { id: 'promises', icon: '\u2705',       label: 'Promises', desc: 'Extract promises from your speech' },
  { id: 'people',   icon: '\uD83D\uDC65', label: 'People',   desc: 'People you regularly talk to' },
];

let currentSection = 'general';
let settings = {};
let people = [];
let isAddingPerson = false;

const sidebarEl = document.getElementById('sidebar');
const contentEl = document.getElementById('content');

// --- Init ---
async function init() {
  settings = await window.api.getSettings();
  people = await window.api.getPeople();
  renderSidebar();
  renderContent();
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
    case 'promises': html += promisesHTML(); break;
    case 'people':   html += peopleHTML(); break;
  }

  contentEl.innerHTML = html;
  attachListeners();
}

// --- General ---
function generalHTML() {
  return `
    <div class="card">
      <div class="card-row">
        <label>Global Hotkey</label>
        <span class="hotkey-display">${settings.hotkey || 'CommandOrControl+Shift+Space'}</span>
      </div>
    </div>
    <div class="card">
      <div class="card-row">
        <label>Transcription Provider</label>
        <select id="provider">
          <option value="groq" ${settings.transcriptionProvider === 'groq' ? 'selected' : ''}>Groq (free)</option>
          <option value="openai" ${settings.transcriptionProvider === 'openai' ? 'selected' : ''}>OpenAI</option>
        </select>
      </div>
      <div class="card-row">
        <label>Groq API Key</label>
        <input type="password" id="groqKey" value="${settings.groqApiKey || ''}" placeholder="gsk_...">
      </div>
      <div class="card-row">
        <label>OpenAI API Key</label>
        <input type="password" id="openaiKey" value="${settings.openaiApiKey || ''}" placeholder="sk-...">
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
          3. Speech is transcribed via Whisper API<br>
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

// --- Attach event listeners ---
function attachListeners() {
  // General
  const providerEl = document.getElementById('provider');
  if (providerEl) {
    providerEl.addEventListener('change', () => save({ transcriptionProvider: providerEl.value }));
  }
  const groqEl = document.getElementById('groqKey');
  if (groqEl) {
    groqEl.addEventListener('change', () => save({ groqApiKey: groqEl.value }));
  }
  const openaiEl = document.getElementById('openaiKey');
  if (openaiEl) {
    openaiEl.addEventListener('change', () => save({ openaiApiKey: openaiEl.value }));
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
