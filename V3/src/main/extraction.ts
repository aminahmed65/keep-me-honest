import { store } from './store';
import { ExtractedCommitment, ExtractionResult } from '../shared/types';

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
        summary: { type: 'string', description: 'Brief summary of findings' },
      },
      required: ['promises', 'summary'],
      additionalProperties: false,
    },
  },
};

function buildSystemPrompt(): string {
  let prompt = `You analyze speech transcripts to find promises and commitments the speaker made.

IMPORTANT — This is spoken conversation, not written text. People repeat themselves, rephrase, and elaborate on the same commitment. You must understand the INTENT, not just pattern-match on phrases.

DEDUPLICATION RULE: If someone says "I can get that to you next week" and then follows up with "I'll send you the full Google document tomorrow", that is ONE promise (send the document). Always merge related statements into a single promise. Use the most specific version as the promise description, and combine the context into one quote.

For each distinct promise found, extract:
- "promise": Short actionable description (use the most specific/concrete version)
- "assigned_to": Who it was promised to (use their name if mentioned, or "unknown")
- "deadline": The most specific deadline mentioned (or "none")
- "context_quote": The key phrase(s) from the transcript that capture the commitment

What counts as a promise:
- Concrete commitments: "I'll send you X", "I'll get that done", "I can do that by Friday"
- Taking ownership: "Let me take care of that", "I'll handle it"
- Delivery commitments: "I'll get back to you", "You'll have it by Monday"

What does NOT count:
- Vague maybes: "I might look into it", "maybe I'll check"
- Questions: "Should I send that?", "Want me to handle it?"
- Past tense: "I already sent it", "I took care of that"
- Other people's promises: "John said he'd do it"
- Social pleasantries: "I'll talk to you later", "have a great weekend"
- Filler/hedging that gets clarified: if someone says "I can probably get that to you" then immediately clarifies with a concrete promise, only count the concrete one

Think about what the speaker actually committed to DO, not how many times they referenced it. Fewer, accurate promises are better than many duplicates.

Always respond with the JSON schema provided. If no promises found, return an empty promises array with a summary explaining why.`;

  const people = store.getEnrichedNames();
  if (people.length > 0) {
    prompt += `\n\nPeople you commonly talk to: ${people.join(', ')}. Use these exact name spellings when attributing promises.`;
  }

  return prompt;
}

export async function extractPromises(transcript: string): Promise<ExtractedCommitment[]> {
  const settings = store.getSettings();
  if (!settings.openRouterApiKey || !settings.commitmentExtractionEnabled) return [];
  if (!transcript.trim()) return [];

  console.log(`[extraction] Sending ${transcript.length} chars to OpenRouter...`);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openRouterApiKey}`,
      'X-Title': 'KeepMeHonest',
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: `Analyze this transcript for promises:\n\n${transcript}` },
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

  const result: ExtractionResult = JSON.parse(content);
  console.log(`[extraction] Found ${result.promises.length} promise(s): ${result.summary}`);
  return result.promises;
}
