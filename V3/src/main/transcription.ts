import { spawn, execFile, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// --- Python venv discovery ---

const VENV_LOCATIONS = [
  path.join(os.homedir(), 'Library/Application Support/FluidVoice/python_project/.venv'),
  path.join(os.homedir(), '.config/FluidVoice/python_project/.venv'),
];

function findPythonPath(): string {
  for (const venv of VENV_LOCATIONS) {
    const py = path.join(venv, 'bin/python3');
    if (fs.existsSync(py)) return py;
  }
  throw new Error(
    'Parakeet Python venv not found. Run the V2 FluidVoice app first to set up the environment, ' +
    'or ensure ~/.config/FluidVoice/python_project/.venv exists.'
  );
}

// --- Daemon management ---

let daemonProcess: ChildProcess | null = null;
let daemonReady = false;
let pendingResolve: ((resp: any) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let outputBuffer = '';

function getDaemonScript(): string {
  // Look in scripts/ relative to project root
  const candidates = [
    path.join(__dirname, '../../scripts/parakeet_daemon.py'),
    path.join(__dirname, '../../../scripts/parakeet_daemon.py'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('parakeet_daemon.py not found');
}

export async function ensureDaemon(): Promise<void> {
  if (daemonProcess && daemonReady) return;

  const pythonPath = findPythonPath();
  const daemonScript = getDaemonScript();

  console.log(`[parakeet] Starting daemon: ${pythonPath} ${daemonScript}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, [daemonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    daemonProcess = proc;
    outputBuffer = '';

    proc.stdout!.on('data', (chunk: Buffer) => {
      outputBuffer += chunk.toString();
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop() || ''; // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const status = msg.status;

          if (status === 'ready' || status === 'listening') {
            daemonReady = true;
            console.log(`[parakeet] Daemon ready`);
            resolve();
          } else if (status === 'success' || status === 'error' || status === 'pong') {
            if (pendingResolve) {
              pendingResolve(msg);
              pendingResolve = null;
              pendingReject = null;
            }
          } else {
            console.log(`[parakeet] ${status}: ${msg.message || ''}`);
          }
        } catch {
          console.log(`[parakeet stdout] ${line}`);
        }
      }
    });

    proc.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[parakeet stderr] ${text}`);
    });

    proc.on('exit', (code) => {
      console.log(`[parakeet] Daemon exited with code ${code}`);
      daemonProcess = null;
      daemonReady = false;
      if (pendingReject) {
        pendingReject(new Error(`Daemon exited unexpectedly (code ${code})`));
        pendingResolve = null;
        pendingReject = null;
      }
    });

    // Timeout for startup
    setTimeout(() => {
      if (!daemonReady) {
        reject(new Error('Daemon startup timed out (15s)'));
        proc.kill();
      }
    }, 15000);
  });
}

function sendDaemonCommand(cmd: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!daemonProcess || !daemonReady) {
      reject(new Error('Daemon not running'));
      return;
    }
    pendingResolve = resolve;
    pendingReject = reject;

    const json = JSON.stringify(cmd) + '\n';
    daemonProcess.stdin!.write(json);

    // Timeout per request
    setTimeout(() => {
      if (pendingReject === reject) {
        pendingResolve = null;
        pendingReject = null;
        reject(new Error('Transcription timed out (60s)'));
      }
    }, 60000);
  });
}

export function stopDaemon(): void {
  if (daemonProcess) {
    try {
      daemonProcess.stdin!.write(JSON.stringify({ command: 'shutdown' }) + '\n');
    } catch { /* ignore */ }
    setTimeout(() => daemonProcess?.kill(), 2000);
  }
}

// --- Audio conversion ---

/**
 * Convert WebM audio buffer to raw float32 PCM (16kHz mono).
 * Uses a small Python script with soundfile (available in the Parakeet venv).
 */
async function webmToRawPcm(webmBuffer: Buffer): Promise<string> {
  const tmpDir = os.tmpdir();
  const webmPath = path.join(tmpDir, `kmh_${Date.now()}.webm`);
  const pcmPath = path.join(tmpDir, `kmh_${Date.now()}.raw`);

  fs.writeFileSync(webmPath, webmBuffer);

  const pythonPath = findPythonPath();

  // Python one-liner: read audio with soundfile, resample to 16kHz mono, write raw float32
  const script = `
import soundfile as sf
import numpy as np
import sys

audio, sr = sf.read(sys.argv[1], dtype='float32')
# Mono mixdown if stereo
if audio.ndim > 1:
    audio = audio.mean(axis=1)
# Resample to 16kHz if needed
if sr != 16000:
    # Simple linear interpolation resample
    duration = len(audio) / sr
    target_len = int(duration * 16000)
    indices = np.linspace(0, len(audio) - 1, target_len)
    audio = np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)
audio.tofile(sys.argv[2])
`;

  return new Promise((resolve, reject) => {
    execFile(pythonPath, ['-c', script, webmPath, pcmPath], { timeout: 10000 }, (err, stdout, stderr) => {
      // Clean up webm temp file
      try { fs.unlinkSync(webmPath); } catch { /* ignore */ }

      if (err) {
        reject(new Error(`Audio conversion failed: ${stderr || err.message}`));
      } else {
        resolve(pcmPath);
      }
    });
  });
}

// --- Public API ---

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  // 1. Convert WebM to raw PCM
  console.log(`[transcription] Converting ${audioBuffer.length} bytes of audio...`);
  const pcmPath = await webmToRawPcm(audioBuffer);

  try {
    // 2. Ensure daemon is running
    await ensureDaemon();

    // 3. Send PCM path to daemon
    console.log(`[transcription] Sending to Parakeet daemon...`);
    const response = await sendDaemonCommand({ pcm_path: pcmPath });

    if (response.status === 'success') {
      console.log(`[transcription] Success: ${(response.text || '').slice(0, 80)}...`);
      return response.text || '';
    } else {
      throw new Error(`Parakeet error: ${response.message || 'unknown'}`);
    }
  } finally {
    // Clean up PCM temp file
    try { fs.unlinkSync(pcmPath); } catch { /* ignore */ }
  }
}
