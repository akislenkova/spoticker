#!/bin/bash
export SPOTICKER_PLAN_DIR="/Users/annak/Downloads/spoticker/plan"
exec "/Users/annak/Michigan Clubs/misc/spotticker/venv/bin/python3.14" -m spoticker_mcp.server "$@"
