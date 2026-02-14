import { modelManager } from './model-manager';

let recognizer: any = null;
let sherpaOnnx: any = null;

function getSherpaOnnx(): any {
  if (!sherpaOnnx) {
    sherpaOnnx = require('sherpa-onnx-node');
  }
  return sherpaOnnx;
}

export async function initRecognizer(): Promise<void> {
  if (recognizer) return;

  const modelDir = modelManager.getModelDir();
  if (!modelDir) {
    throw new Error('Model not downloaded yet');
  }

  console.log(`[transcription] Loading sherpa-onnx model from ${modelDir}...`);
  const startTime = Date.now();

  const sherpa = getSherpaOnnx();
  recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: `${modelDir}/encoder.int8.onnx`,
        decoder: `${modelDir}/decoder.int8.onnx`,
        joiner: `${modelDir}/joiner.int8.onnx`,
      },
      tokens: `${modelDir}/tokens.txt`,
      numThreads: 2,
      provider: 'cpu',
    },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[transcription] Model loaded in ${elapsed}s`);
}

export async function transcribeAudio(samples: Float32Array, sampleRate: number): Promise<string> {
  if (!recognizer) {
    await initRecognizer();
  }

  console.log(`[transcription] Transcribing ${samples.length} samples at ${sampleRate}Hz...`);
  const startTime = Date.now();

  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  const text = (result.text || '').trim();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[transcription] Done in ${elapsed}s: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);

  return text;
}

export function stopDaemon(): void {
  // No-op — kept for API compatibility with app.ts
  // sherpa-onnx cleans up when the process exits
}
