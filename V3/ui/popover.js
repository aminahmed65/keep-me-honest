// @ts-check
/// <reference path="./api.d.ts" />

// --- State ---
let commitments = [];
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// --- DOM refs ---
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const badgeEl = document.getElementById('badge');
const recPill = document.getElementById('rec-pill');
const statusBar = document.getElementById('status-bar');
const dropdown = document.getElementById('dropdown');

// --- Init ---
async function init() {
  commitments = await window.api.getCommitments();
  render();

  // Listen for updates from main
  window.api.onCommitmentsUpdated((data) => {
    commitments = data;
    render();
  });

  window.api.onRecordingState((shouldRecord) => {
    if (shouldRecord && !isRecording) startRecording();
    else if (!shouldRecord && isRecording) stopRecording();
  });

  window.api.onTranscriptionStatus((msg) => {
    if (msg) {
      statusBar.textContent = msg;
      statusBar.classList.add('visible');
    } else {
      statusBar.classList.remove('visible');
    }
  });
}

// --- Render ---
function render() {
  const activeCount = commitments.filter(c => !c.isDone).length;

  // Badge
  if (activeCount > 0) {
    badgeEl.style.display = 'inline';
    badgeEl.textContent = String(activeCount);
  } else {
    badgeEl.style.display = 'none';
  }

  // List
  if (commitments.length === 0) {
    emptyEl.style.display = 'flex';
    // Remove any commitment rows
    listEl.querySelectorAll('.commitment-row').forEach(el => el.remove());
    return;
  }

  emptyEl.style.display = 'none';

  // Rebuild list
  const fragment = document.createDocumentFragment();
  for (const c of commitments) {
    const row = document.createElement('div');
    row.className = 'commitment-row' + (c.isDone ? ' done' : '');

    // Checkbox
    const cb = document.createElement('div');
    cb.className = 'checkbox' + (c.isDone ? ' done' : '');
    cb.textContent = c.isDone ? '\u2713' : '';
    cb.onclick = () => window.api.toggleDone(c.id);

    // Content
    const content = document.createElement('div');
    content.className = 'content';

    const promise = document.createElement('div');
    promise.className = 'promise';
    promise.textContent = c.promise;
    content.appendChild(promise);

    // Meta (assigned to + deadline)
    if (c.assignedTo || c.deadline) {
      const meta = document.createElement('div');
      meta.className = 'meta';
      if (c.assignedTo) {
        const tag = document.createElement('span');
        tag.className = 'meta-tag';
        tag.textContent = '\uD83D\uDC64 ' + c.assignedTo;
        meta.appendChild(tag);
      }
      if (c.deadline) {
        const tag = document.createElement('span');
        tag.className = 'meta-tag deadline';
        tag.textContent = '\uD83D\uDD52 ' + c.deadline;
        meta.appendChild(tag);
      }
      content.appendChild(meta);
    }

    // Quote
    if (c.contextQuote) {
      const quote = document.createElement('div');
      quote.className = 'quote';
      quote.textContent = '"' + c.contextQuote + '"';
      content.appendChild(quote);
    }

    // Dismiss
    const dismiss = document.createElement('span');
    dismiss.className = 'dismiss';
    dismiss.textContent = '\u2715';
    dismiss.onclick = () => window.api.dismissCommitment(c.id);

    row.appendChild(cb);
    row.appendChild(content);
    row.appendChild(dismiss);
    fragment.appendChild(row);
  }

  // Replace content
  listEl.querySelectorAll('.commitment-row').forEach(el => el.remove());
  listEl.appendChild(fragment);
}

// --- Recording ---
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const buffer = await blob.arrayBuffer();
      window.api.sendAudio(buffer);
    };

    mediaRecorder.start(250);
    isRecording = true;
    recPill.classList.add('active');
  } catch (err) {
    console.error('Recording failed:', err);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  recPill.classList.remove('active');
}

// --- Event listeners ---
document.getElementById('settings-btn').onclick = () => window.api.openSettings();
document.getElementById('quit-btn').onclick = () => window.api.quit();

document.getElementById('menu-btn').onclick = (e) => {
  e.stopPropagation();
  dropdown.classList.toggle('open');
};
document.addEventListener('click', () => dropdown.classList.remove('open'));

document.getElementById('copy-btn').onclick = () => { window.api.copyAll(); dropdown.classList.remove('open'); };
document.getElementById('clear-done-btn').onclick = () => { window.api.clearDone(); dropdown.classList.remove('open'); };
document.getElementById('clear-all-btn').onclick = () => { window.api.clearAll(); dropdown.classList.remove('open'); };

// --- Boot ---
init();
