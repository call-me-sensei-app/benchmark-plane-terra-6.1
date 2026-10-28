#!/usr/bin/env python3
"""Write screenshots/ledger.json: for every numbered development capture, the active development time and the
cumulative logged tokens at the moment it was saved.

Uses the same session records as the session meter (server.py): active time is the union of running turns, so the
gaps between turns are left out, and tokens are the running total of the token-usage records up to the capture.
A capture's moment is its file creation time, which the copy in this folder keeps from when it was saved.
"""
from datetime import datetime
from pathlib import Path
import bisect, json, os, sys

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
import server

if not server.session_file:
    raise SystemExit('Session records unavailable: set CODEX_THREAD_ID or .session-id to the session that built the scene')

turns, token_times, token_totals = [], [], []
start, total = None, 0
with open(server.session_file, encoding='utf-8') as stream:
    for line in stream:
        try: record = json.loads(line)
        except ValueError: continue
        payload, at = record.get('payload', {}), record.get('timestamp')
        if record.get('type') == 'token_usage_record':
            total += payload.get('usage', {}).get('total_tokens', 0)
            token_times.append(server.timestamp(at)); token_totals.append(total)
        kind = payload.get('type')
        if kind == 'task_started' and start is None: start = server.timestamp(at)
        elif kind in ('task_complete', 'turn_aborted', 'task_aborted') and start is not None:
            turns.append((start, server.timestamp(at))); start = None

def active_seconds(moment):
    return sum(max(0, min(end, moment) - begin) for begin, end in turns if begin < moment)

def tokens_at(moment):
    i = bisect.bisect_right(token_times, moment)
    return token_totals[i - 1] if i else 0

frames = []
for path in sorted((root / 'screenshots').glob('[0-9][0-9][0-9]-*.png')):
    moment = os.stat(path).st_birthtime
    frames.append(dict(file=path.name, saved=datetime.fromtimestamp(moment).astimezone().isoformat(timespec='seconds'),
                       active_seconds=round(active_seconds(moment), 1), total_tokens=tokens_at(moment)))
(root / 'screenshots' / 'ledger.json').write_text(json.dumps(frames, indent=1) + '\n')
print(f'screenshots/ledger.json: {len(frames)} captures, last at {frames[-1]["active_seconds"] / 3600:.2f} h active, {frames[-1]["total_tokens"]:,} tokens')
