import { OpenRouter } from "@openrouter/sdk";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadPeople(): string[] {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const peoplePath = resolve(__dirname, "../.people.json");
    const data = JSON.parse(readFileSync(peoplePath, "utf-8"));
    return Array.isArray(data.people) ? data.people : [];
  } catch {
    return [];
  }
}

function buildSystemInstructions(): string {
  let instructions = BASE_INSTRUCTIONS;
  const people = loadPeople();
  if (people.length > 0) {
    instructions += `\n\nPeople you commonly talk to: ${people.join(", ")}. Use these exact name spellings when attributing promises.`;
  }
  return instructions;
}

const BASE_INSTRUCTIONS = `You analyze speech transcripts to find promises and commitments the speaker made.

IMPORTANT — This is spoken conversation, not written text. People repeat themselves, rephrase, and elaborate on the same commitment. You must understand the INTENT, not just pattern-match on phrases.

DEDUPLICATION RULE: If someone says "I can get that to you next week" and then follows up with "I'll send you the full Google document tomorrow", that is ONE promise (send the document) — the first statement was a vague reference to the same thing they then clarified. Always merge related statements into a single promise. Use the most specific version as the promise description, and combine the context into one quote.

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

const PROMISE_SCHEMA = {
  name: "promise_extraction",
  strict: true,
  schema: {
    type: "object",
    properties: {
      promises: {
        type: "array",
        items: {
          type: "object",
          properties: {
            promise: { type: "string", description: "What was promised" },
            assigned_to: { type: "string", description: "Who it was promised to" },
            deadline: { type: "string", description: "When, or 'none'" },
            context_quote: { type: "string", description: "Exact words from transcript" },
          },
          required: ["promise", "assigned_to", "deadline", "context_quote"],
          additionalProperties: false,
        },
      },
      summary: {
        type: "string",
        description: "Brief natural language summary of findings",
      },
    },
    required: ["promises", "summary"],
    additionalProperties: false,
  },
} as const;

export interface ExtractedPromise {
  promise: string;
  assigned_to: string;
  deadline: string;
  context_quote: string;
}

export interface ExtractionResult {
  promises: ExtractedPromise[];
  summary: string;
}

export function createAgent(apiKey: string, model?: string) {
  const openrouter = new OpenRouter({ apiKey });
  const modelId = model || "google/gemini-3-flash-preview";
  const systemInstructions = buildSystemInstructions();

  return {
    async analyze(transcript: string): Promise<ExtractionResult> {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "KeepMeHonest",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: systemInstructions },
            { role: "user", content: `Analyze this transcript for promises:\n\n${transcript}` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: PROMISE_SCHEMA,
          },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("No content in response");
      }

      return JSON.parse(content) as ExtractionResult;
    },

    async chat(input: string): Promise<string> {
      const result = openrouter.callModel({
        model: modelId,
        instructions: systemInstructions,
        input,
        temperature: 0.3,
      });

      const text = await result.getText();
      return text || "(no response)";
    },
  };
}

export type Agent = ReturnType<typeof createAgent>;
