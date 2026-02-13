import { tool } from "@openrouter/sdk";
import * as z from "zod/v4";

export const extractPromiseTool = tool({
  name: "extract_promise",
  description:
    "Record a single promise or commitment found in a transcript. Call this once per promise identified.",
  inputSchema: z.object({
    promise: z.string().describe("Short actionable description of what was promised"),
    assigned_to: z.string().describe("Who the promise was made to, or 'unknown' if unclear"),
    deadline: z.string().describe("When they said they'd do it, or 'none' if no deadline"),
    context_quote: z.string().describe("The exact phrase from the transcript"),
  }),
  outputSchema: z.object({
    status: z.string(),
  }),
  execute: async (params) => {
    console.log(`\n  -> Promise: ${params.promise}`);
    if (params.assigned_to !== "unknown") console.log(`     To: ${params.assigned_to}`);
    if (params.deadline !== "none") console.log(`     By: ${params.deadline}`);
    console.log(`     Quote: "${params.context_quote}"`);
    return { status: "saved" };
  },
});

export const timeTool = tool({
  name: "get_current_time",
  description: "Get the current date and time",
  inputSchema: z.object({
    timezone: z.string().describe('Timezone like "America/New_York". Use "local" for local time.'),
  }),
  outputSchema: z.object({
    datetime: z.string(),
    timezone: z.string(),
  }),
  execute: async (params) => {
    const tz = params.timezone === "local"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : params.timezone;
    const now = new Date().toLocaleString("en-US", { timeZone: tz });
    return { datetime: now, timezone: tz };
  },
});

export const allTools = [extractPromiseTool, timeTool] as const;
