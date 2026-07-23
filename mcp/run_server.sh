#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SPOTICKER_PLAN_DIR="$SCRIPT_DIR/../plan"
exec "$SCRIPT_DIR/../.venv/bin/python3" -m spoticker_mcp.server "$@"
