import { Settings } from '../shared/types';

const ENDPOINTS: Record<string, { url: string; model: string; keyField: keyof Settings }> = {
  groq: {
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo',
    keyField: 'groqApiKey',
  },
  openai: {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    keyField: 'openaiApiKey',
  },
};

export async function transcribeAudio(audioBuffer: Buffer, settings: Settings): Promise<string> {
  const provider = settings.transcriptionProvider;
  const config = ENDPOINTS[provider];
  if (!config) throw new Error(`Unknown transcription provider: ${provider}`);

  const apiKey = settings[config.keyField] as string;
  if (!apiKey) throw new Error(`No API key configured for ${provider}. Add one in Settings.`);

  // Build multipart/form-data manually (no external deps)
  const boundary = '----KMHBoundary' + crypto.randomUUID().replace(/-/g, '');

  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="recording.webm"\r\n` +
      `Content-Type: audio/webm\r\n\r\n`
    ),
    audioBuffer,
    Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `${config.model}\r\n` +
      `--${boundary}--\r\n`
    ),
  ];

  const body = Buffer.concat(parts);

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Transcription failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const result = await response.json() as { text: string };
  return result.text;
}
