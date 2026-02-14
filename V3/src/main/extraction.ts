import { store } from './store';
import { ExtractedCommitment, ExtractionResult } from '../shared/types';

const MODEL = 'x-ai/grok-4.1-fast';
const CHUNK_TARGET_WORDS = 750; // aim for 500-1000 word chunks

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'promise_extraction',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        promises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              promise: { type: 'string', description: 'What was promised' },
              assigned_to: { type: 'string', description: 'Who it was promised to' },
              deadline: { type: 'string', description: "When, or 'none'" },
              context_quote: { type: 'string', description: 'Exact words from transcript' },
            },
            required: ['promise', 'assigned_to', 'deadline', 'context_quote'],
            additionalProperties: false,
          },
        },
        summary: { type: 'string', description: 'Brief summary of this conversation segment' },
      },
      required: ['promises', 'summary'],
      additionalProperties: false,
    },
  },
};

function buildSystemPrompt(): string {
  let prompt = `You extract HIGH-VALUE WORK COMMITMENTS from spoken conversation transcripts. Your bar for what counts is very high — only surface promises that would actually matter if the speaker forgot to follow through.

IMPORTANT — This is messy spoken audio, not clean text. People ramble, repeat themselves, rephrase. Understand the INTENT. If the same commitment is stated multiple ways, merge into ONE promise using the most specific version.

For each commitment found, extract:
- "promise": Short, concrete, actionable description (start with a verb)
- "assigned_to": Who it was promised to (use their name if mentioned, or "unknown")
- "deadline": The most specific deadline mentioned (or "none")
- "context_quote": The key phrase(s) from the transcript

ONLY CAPTURE — things that would hurt professionally if dropped:
- Deliverables: "I'll send you the report", "I'll push the PR today", "I'll draft the proposal"
- Action items: "I'll set up the meeting", "I'll file that ticket", "Let me take that on"
- Deadlines given to others: "You'll have it by Friday", "I can get that done this sprint"
- Decisions with follow-up: "I'll go with option B and update the doc"
- Ownership taken: "I'll own the migration", "Let me handle the deploy"

IGNORE — everything else, even if it sounds like a commitment:
- Casual/social: "I'll talk to you later", "let's grab coffee", "I'll think about it"
- Vague intentions: "I might look into it", "maybe I'll check", "I should probably..."
- Questions/offers not yet accepted: "Should I send that?", "Want me to handle it?"
- Past tense (already done): "I already sent it", "I took care of that yesterday"
- Other people's commitments: "John said he'd do it", "She'll handle that"
- Filler/hedging that never becomes concrete: "I could probably get that to you"
- Low-stakes personal stuff: "I'll grab lunch", "I'll take a break"
- Acknowledgments: "Sure", "Sounds good", "Will do" (unless followed by something specific)

DEDUPLICATION: If you are given context about previously extracted promises, do NOT re-extract the same commitment. Only extract NEW promises from the current segment.

When in doubt, DO NOT extract it. Return fewer, high-confidence promises rather than a noisy list. An empty array is a perfectly valid response — most casual conversations have zero real work commitments.

Always respond with the JSON schema provided.`;

  const people = store.getEnrichedNames();
  if (people.length > 0) {
    prompt += `\n\nPeople you commonly talk to: ${people.join(', ')}. Use these exact name spellings when attributing promises.`;
  }

  return prompt;
}

/**
 * Split transcript into chunks of roughly CHUNK_TARGET_WORDS words,
 * breaking at sentence boundaries when possible.
 */
function chunkTranscript(transcript: string): string[] {
  const words = transcript.split(/\s+/);
  if (words.length <= CHUNK_TARGET_WORDS * 1.3) {
    // Small enough to send as one chunk
    return [transcript];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    let end = Math.min(start + CHUNK_TARGET_WORDS, words.length);

    // Try to break at a sentence boundary (look ahead up to 250 words)
    if (end < words.length) {
      let bestBreak = end;
      for (let i = end; i < Math.min(end + 250, words.length); i++) {
        const word = words[i];
        if (word.endsWith('.') || word.endsWith('?') || word.endsWith('!')) {
          bestBreak = i + 1;
          break;
        }
      }
      end = bestBreak;
    }

    chunks.push(words.slice(start, end).join(' '));
    start = end;
  }

  return chunks;
}

async function callExtraction(
  systemPrompt: string,
  userContent: string,
  apiKey: string,
): Promise<ExtractionResult> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Title': 'KeepMeHonest',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: RESPONSE_FORMAT,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Extraction API error (${response.status}): ${body.slice(0, 200)}`);
  }

  const json = await response.json() as any;
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in extraction response');

  return JSON.parse(content) as ExtractionResult;
}

export async function extractPromises(transcript: string): Promise<ExtractedCommitment[]> {
  const settings = store.getSettings();
  if (!settings.openRouterApiKey || !settings.commitmentExtractionEnabled) return [];
  if (!transcript.trim()) return [];

  const chunks = chunkTranscript(transcript);
  console.log(`[extraction] ${transcript.split(/\s+/).length} words → ${chunks.length} chunk(s), model: ${MODEL}`);

  const systemPrompt = buildSystemPrompt();
  const allPromises: ExtractedCommitment[] = [];
  let rollingContext = '';

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    let userContent = '';
    if (rollingContext) {
      userContent += `CONVERSATION CONTEXT SO FAR:\n${rollingContext}\n\nALREADY EXTRACTED PROMISES (do not re-extract these):\n`;
      if (allPromises.length > 0) {
        userContent += allPromises.map(p => `- ${p.promise}`).join('\n');
      } else {
        userContent += '(none yet)';
      }
      userContent += `\n\n---\n\nNEW SEGMENT (chunk ${i + 1}/${chunks.length}) — extract only NEW promises from this:\n\n${chunk}`;
    } else {
      userContent = `Analyze this transcript for promises (chunk ${i + 1}/${chunks.length}):\n\n${chunk}`;
    }

    console.log(`[extraction] Chunk ${i + 1}/${chunks.length}: ${chunk.split(/\s+/).length} words`);

    try {
      const result = await callExtraction(systemPrompt, userContent, settings.openRouterApiKey);

      if (result.promises.length > 0) {
        allPromises.push(...result.promises);
        console.log(`[extraction] Chunk ${i + 1}: +${result.promises.length} promise(s)`);
      }

      // Build rolling context from the summary for next chunk
      if (rollingContext) {
        rollingContext += ' ' + result.summary;
      } else {
        rollingContext = result.summary;
      }
      // Keep context from getting too long — trim to last ~200 words
      const contextWords = rollingContext.split(/\s+/);
      if (contextWords.length > 200) {
        rollingContext = contextWords.slice(-200).join(' ');
      }
    } catch (e) {
      console.error(`[extraction] Chunk ${i + 1} failed:`, e);
      // Continue with remaining chunks
    }
  }

  console.log(`[extraction] Total: ${allPromises.length} promise(s) from ${chunks.length} chunk(s)`);
  return allPromises;
}
