#!/bin/bash
cd "$(dirname "$0")"
source .env
export OPENROUTER_API_KEY
npx tsx src/headless.ts
