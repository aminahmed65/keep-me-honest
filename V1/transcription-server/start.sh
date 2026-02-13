#!/bin/bash
set -e
cd "$(dirname "$0")"

# Create venv if it doesn't exist
if [ ! -d ".venv" ]; then
    python3.13 -m venv .venv
fi

source .venv/bin/activate
pip install -r requirements.txt
python server.py
