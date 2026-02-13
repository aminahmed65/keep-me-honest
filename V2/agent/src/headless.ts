import { createAgent } from "./agent.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Error: Set OPENROUTER_API_KEY environment variable");
  process.exit(1);
}

const agent = createAgent(apiKey);

console.log("Keep Me Honest Agent");
console.log("====================");
console.log("Paste a transcript (multi-line OK), then press Enter twice to analyze.");
console.log('Type "quit" to exit.\n');

// Buffer multi-line paste input — submit when we see a blank line or a pause
let buffer: string[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function processBuffer() {
  const text = buffer.join(" ").trim();
  buffer = [];

  if (!text) {
    process.stdout.write("You: ");
    return;
  }

  if (text.toLowerCase() === "quit") {
    console.log("Bye!");
    process.exit(0);
  }

  try {
    console.log("\nAnalyzing...\n");
    const result = await agent.analyze(text);

    if (result.promises.length > 0) {
      console.log(`Found ${result.promises.length} promise(s):\n`);
      for (const p of result.promises) {
        console.log(`  -> ${p.promise}`);
        if (p.assigned_to !== "unknown") console.log(`     To: ${p.assigned_to}`);
        if (p.deadline !== "none") console.log(`     By: ${p.deadline}`);
        console.log(`     Quote: "${p.context_quote}"`);
        console.log();
      }
    } else {
      console.log("No promises found.\n");
    }

    console.log(`Summary: ${result.summary}\n`);
  } catch (err: any) {
    console.error(`\nError: ${err.message}\n`);
  }

  process.stdout.write("You: ");
}

process.stdin.setEncoding("utf-8");
process.stdout.write("You: ");

process.stdin.on("data", (chunk: string) => {
  const lines = chunk.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      buffer.push(trimmed);
    }
  }

  // Debounce: wait 300ms after last input before processing
  // This lets multi-line paste complete before we analyze
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    processBuffer();
  }, 300);
});
