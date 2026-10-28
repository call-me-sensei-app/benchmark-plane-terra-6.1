#!/usr/bin/env python3
"""Write the session meter's final totals to usage-final.json for a hosted build, which has no session server.

Reads the same aggregate records as server.py's /api/usage (counts, active time and the estimate only).
"""
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
import server

usage = server.session_usage()
if usage is None:
    raise SystemExit('Session usage unavailable: set CODEX_THREAD_ID or .session-id to the session that built the scene')
usage['active_turn'] = False
(root / 'usage-final.json').write_text(json.dumps(usage, indent=2) + '\n')
print(f"usage-final.json: {usage['total_tokens']:,} tokens, {usage['active_dev_seconds'] / 3600:.2f} h active, ~${usage['estimated_cost']:.2f}")
