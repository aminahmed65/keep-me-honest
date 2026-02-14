// @ts-check
/// <reference path="./api.d.ts" />

// --- State ---
let commitments = [];
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// --- Undo state ---
let pendingDismiss = null; // { id, timer }

// --- Drag state ---
let dragSourceId = null;

// --- DOM refs ---
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const badgeEl = document.getElementById('badge');
const recPill = document.getElementById('rec-pill');
const statusBar = document.getElementById('status-bar');
const dropdown = document.getElementById('dropdown');
const undoToast = document.getElementById('undo-toast');
const undoText = document.getElementById('undo-text');

// --- Audio feedback ---
function playTone(freq, duration, type = 'sine') {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    // Quick fade out to avoid click
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => ctx.close();
  } catch { /* ignore audio errors */ }
}

function playStartSound() {
  // Rising double-beep: friendly "I'm listening"
  playTone(660, 0.08);
  setTimeout(() => playTone(880, 0.1), 100);
}

function playStopSound() {
  // Falling single tone: "got it"
  playTone(440, 0.12);
}

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
    // Skip the item that's pending dismissal (visually hidden)
    if (pendingDismiss && pendingDismiss.id === c.id) continue;

    const row = document.createElement('div');
    row.className = 'commitment-row' + (c.isDone ? ' done' : '');
    row.draggable = true;
    row.dataset.id = c.id;

    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '\u2261'; // ≡ hamburger icon

    // Drag events
    row.addEventListener('dragstart', (e) => {
      dragSourceId = c.id;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', c.id);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      dragSourceId = null;
      listEl.querySelectorAll('.commitment-row.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragSourceId && dragSourceId !== c.id) {
        row.classList.add('drag-over');
      }
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (!dragSourceId || dragSourceId === c.id) return;

      // Reorder: move dragSourceId before this item
      const fromIdx = commitments.findIndex(x => x.id === dragSourceId);
      const toIdx = commitments.findIndex(x => x.id === c.id);
      if (fromIdx === -1 || toIdx === -1) return;

      const [moved] = commitments.splice(fromIdx, 1);
      commitments.splice(toIdx, 0, moved);
      render();

      // Persist the new order
      const orderedIds = commitments.map(x => x.id);
      window.api.reorderCommitments(orderedIds);
    });

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
    dismiss.onclick = () => dismissWithUndo(c.id, c.promise);

    row.appendChild(handle);
    row.appendChild(cb);
    row.appendChild(content);
    row.appendChild(dismiss);
    fragment.appendChild(row);
  }

  // Replace content
  listEl.querySelectorAll('.commitment-row').forEach(el => el.remove());
  listEl.appendChild(fragment);
}

// --- Undo dismiss ---
function dismissWithUndo(id, promiseText) {
  // Cancel any previous pending dismiss
  if (pendingDismiss) {
    clearTimeout(pendingDismiss.timer);
    // Finalize the previous one immediately
    window.api.dismissCommitment(pendingDismiss.id);
  }

  // Hide the row visually and show toast
  const shortText = promiseText.length > 30 ? promiseText.slice(0, 30) + '...' : promiseText;
  undoText.textContent = `"${shortText}" dismissed`;
  undoToast.classList.add('visible');

  const timer = setTimeout(() => {
    // Actually dismiss after timeout
    window.api.dismissCommitment(id);
    undoToast.classList.remove('visible');
    pendingDismiss = null;
  }, 4000);

  pendingDismiss = { id, timer };
  render(); // re-render to hide the row
}

document.getElementById('undo-btn').onclick = () => {
  if (pendingDismiss) {
    clearTimeout(pendingDismiss.timer);
    pendingDismiss = null;
    undoToast.classList.remove('visible');
    render(); // re-render to show the row again
  }
};

// --- Recording ---
async function startRecording() {
  try {
    playStartSound();
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
      const arrayBuffer = await blob.arrayBuffer();

      // Decode and resample to 16kHz mono in the renderer via Web Audio API
      try {
        const audioCtx = new AudioContext();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        await audioCtx.close();

        const duration = audioBuffer.duration;
        const targetRate = 16000;
        const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * targetRate), targetRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);
        const rendered = await offlineCtx.startRendering();
        const samples = rendered.getChannelData(0); // Float32Array, 16kHz mono

        window.api.sendAudio({ sampleRate: targetRate, samples: Array.from(samples) });
      } catch (err) {
        console.error('Audio decode/resample failed:', err);
      }
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
  playStopSound();
}

// --- Event listeners ---
document.getElementById('settings-btn').onclick = () => {
  console.log('[popover] Settings clicked');
  if (window.api) window.api.openSettings();
  else console.error('window.api not available!');
};
document.getElementById('quit-btn').onclick = () => {
  console.log('[popover] Quit clicked');
  if (window.api) window.api.quit();
  else console.error('window.api not available!');
};

document.getElementById('menu-btn').onclick = (e) => {
  e.stopPropagation();
  dropdown.classList.toggle('open');
};
document.addEventListener('click', () => dropdown.classList.remove('open'));

document.getElementById('copy-btn').onclick = () => { window.api.copyAll(); dropdown.classList.remove('open'); };
document.getElementById('clear-done-btn').onclick = () => { window.api.clearDone(); dropdown.classList.remove('open'); };
document.getElementById('clear-all-btn').onclick = () => { window.api.clearAll(); dropdown.classList.remove('open'); };

// --- Add task ---
const addTaskForm = document.getElementById('add-task-form');
const taskInput = document.getElementById('task-input');
const deadlineInput = document.getElementById('deadline-input');

document.getElementById('add-task-btn').onclick = (e) => {
  e.stopPropagation();
  addTaskForm.classList.toggle('visible');
  if (addTaskForm.classList.contains('visible')) {
    taskInput.value = '';
    deadlineInput.value = '';
    taskInput.focus();
  }
};

document.getElementById('task-cancel').onclick = () => {
  addTaskForm.classList.remove('visible');
};

document.getElementById('task-save').onclick = async () => {
  const promise = taskInput.value.trim();
  if (!promise) return;
  const deadline = deadlineInput.value.trim() || null;
  await window.api.addCommitment(promise, deadline);
  addTaskForm.classList.remove('visible');
};

taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('task-save').click();
  } else if (e.key === 'Escape') {
    addTaskForm.classList.remove('visible');
  }
});

deadlineInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('task-save').click();
  } else if (e.key === 'Escape') {
    addTaskForm.classList.remove('visible');
  }
});

// --- Boot ---
init();
