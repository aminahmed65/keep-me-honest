import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { execFile } from 'child_process';
import { app, BrowserWindow } from 'electron';
import { ModelState, ModelStatus, IPC } from '../shared/types';

const MODEL_NAME = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8';
const DOWNLOAD_URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2';
const REQUIRED_FILES = ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'];

class ModelManager {
  private modelsDir: string;
  private modelDir: string;
  private state: ModelState;

  constructor() {
    this.modelsDir = path.join(app.getPath('userData'), 'models');
    this.modelDir = path.join(this.modelsDir, MODEL_NAME);
    this.state = {
      status: 'not-downloaded',
      progress: 0,
      error: null,
      modelPath: null,
    };
    this.detectExistingModel();
  }

  private detectExistingModel(): void {
    if (!fs.existsSync(this.modelDir)) return;
    const allPresent = REQUIRED_FILES.every(f =>
      fs.existsSync(path.join(this.modelDir, f))
    );
    if (allPresent) {
      this.state = {
        status: 'ready',
        progress: 100,
        error: null,
        modelPath: this.modelDir,
      };
      console.log(`[model-manager] Model found at ${this.modelDir}`);
    }
  }

  getState(): ModelState {
    return { ...this.state };
  }

  getModelDir(): string | null {
    return this.state.status === 'ready' || this.state.status === 'loaded' || this.state.status === 'loading'
      ? this.modelDir
      : null;
  }

  isReady(): boolean {
    return this.state.status === 'ready' || this.state.status === 'loaded' || this.state.status === 'loading';
  }

  private updateState(partial: Partial<ModelState>): void {
    this.state = { ...this.state, ...partial };
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send(IPC.MODEL_STATUS_UPDATED, this.getState());
    });
  }

  async download(): Promise<void> {
    if (this.state.status === 'downloading') return;

    this.updateState({ status: 'downloading', progress: 0, error: null });

    // Ensure models directory exists
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }

    const archivePath = path.join(this.modelsDir, `${MODEL_NAME}.tar.bz2`);

    try {
      // Download
      await this.downloadFile(DOWNLOAD_URL, archivePath);

      // Extract
      this.updateState({ progress: 95 });
      await this.extractArchive(archivePath);

      // Clean up archive
      try { fs.unlinkSync(archivePath); } catch { /* ignore */ }

      // Verify
      const allPresent = REQUIRED_FILES.every(f =>
        fs.existsSync(path.join(this.modelDir, f))
      );
      if (!allPresent) {
        throw new Error('Extraction completed but model files are missing');
      }

      this.updateState({ status: 'ready', progress: 100, modelPath: this.modelDir });
      console.log('[model-manager] Model downloaded and extracted successfully');
    } catch (err: any) {
      // Clean up partial download
      try { fs.unlinkSync(archivePath); } catch { /* ignore */ }

      console.error('[model-manager] Download failed:', err);
      this.updateState({
        status: 'download-failed',
        progress: 0,
        error: err.message || 'Download failed',
      });
      throw err;
    }
  }

  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const doRequest = (reqUrl: string, redirectCount: number) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'));
          return;
        }

        https.get(reqUrl, (res) => {
          // Follow redirects
          if (res.statusCode === 301 || res.statusCode === 302) {
            const location = res.headers.location;
            if (!location) {
              reject(new Error('Redirect with no location header'));
              return;
            }
            res.resume();
            doRequest(location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;
          const file = fs.createWriteStream(destPath);

          res.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              // Scale progress to 0-94% (95% = extracting)
              const pct = Math.round((downloadedBytes / totalBytes) * 94);
              this.updateState({ progress: pct });
            }
          });

          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
          file.on('error', (err) => { file.close(); reject(err); });
        }).on('error', reject);
      };

      doRequest(url, 0);
    });
  }

  private extractArchive(archivePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // macOS has bzip2 support built-in via tar
      execFile('tar', ['xjf', archivePath, '-C', this.modelsDir], { timeout: 300000 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`Extraction failed: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    });
  }
}

export const modelManager = new ModelManager();
