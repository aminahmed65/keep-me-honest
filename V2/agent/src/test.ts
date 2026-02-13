import { createAgent } from "./agent.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY");
  process.exit(1);
}

const agent = createAgent(apiKey);

const transcript = `Hi, how's your day going? Uh how's your day going, uh Reta? Is everything going good? Nice, nice, nice. Okay, sure. I I can get that to you um probably next week. So yeah, I'll send you the full Google document on the problem identification system tomorrow if that's good. Okay? Alright, it sounds good, yeah. I mean other than that it should be fine. There shouldn't be anything really to be worried about, right? Alright, yeah, have a great weekend. Thank you. Bye-bye.`;

console.log("Analyzing transcript...\n");

const result = await agent.analyze(transcript);

if (result.promises.length > 0) {
  console.log(`Found ${result.promises.length} promise(s):\n`);
  for (const p of result.promises) {
    console.log(`  -> ${p.promise}`);
    if (p.assigned_to !== "unknown") console.log(`     To: ${p.assigned_to}`);
    if (p.deadline !== "none") console.log(`     By: ${p.deadline}`);
    console.log(`     Quote: "${p.context_quote}"`);
    console.log();
  }
}

console.log(`Summary: ${result.summary}`);
