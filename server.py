#!/usr/bin/env python3
"""Local preview plus a read-only, aggregate usage meter for this Codex session."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timezone
import glob, json, os, re

root = Path(__file__).resolve().parent
thread_id = os.environ.get('CODEX_THREAD_ID', '')
if not thread_id:
    try: thread_id = (root / '.session-id').read_text().strip()
    except OSError: pass
session_files = glob.glob(str(Path.home() / '.codex' / 'sessions' / '*' / '*' / '*' / ('*' + thread_id + '*.jsonl'))) if thread_id else []
session_file = session_files[0] if session_files else None

def timestamp(text):
    return datetime.fromisoformat(text.replace('Z', '+00:00')).timestamp()

def session_usage():
    if not session_file: return None
    counts = dict(input_tokens=0, cached_input_tokens=0, cache_write_input_tokens=0, output_tokens=0, total_tokens=0)
    cost = 0.0
    active_seconds = 0.0
    active_start = None
    found = False
    try:
        with open(session_file, encoding='utf-8') as stream:
            for line in stream:
                try: record = json.loads(line)
                except ValueError: continue
                payload = record.get('payload', {})
                if record.get('type') == 'token_usage_record':
                    usage = payload.get('usage', {})
                    for key in counts: counts[key] += usage.get(key, 0)
                    inp = usage.get('input_tokens', 0); cached = usage.get('cached_input_tokens', 0); writes = usage.get('cache_write_input_tokens', 0); out = usage.get('output_tokens', 0)
                    long_context = inp > 272000
                    input_rate = 2 if long_context else 1
                    output_rate = 7.5 if long_context else 5
                    cost += (max(0, inp-cached-writes)*input_rate + cached*.05*input_rate + writes*1.25*input_rate + out*output_rate)/1_000_000
                    found = True
                kind = payload.get('type')
                if kind == 'task_started' and active_start is None:
                    active_start = timestamp(record['timestamp'])
                elif kind in ('task_complete', 'turn_aborted', 'task_aborted') and active_start is not None:
                    active_seconds += max(0, timestamp(record['timestamp'])-active_start)
                    active_start = None
    except (OSError, KeyError, ValueError): return None
    if not found: return None
    if active_start is not None: active_seconds += max(0, datetime.now(timezone.utc).timestamp()-active_start)
    counts.update(estimated_cost=cost, active_dev_seconds=active_seconds, active_turn=active_start is not None)
    return counts

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Each refresh should show the latest local iteration, including modules.
        self.send_header('Cache-Control', 'no-store')
        if self.path.split('?')[0] == '/assets/flight-to-the-light.wav':
            self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        if any(part.startswith('.') for part in path.split('/') if part):
            self.send_error(404); return
        if path == '/api/usage':
            usage = session_usage()
            if usage is None:
                self.send_error(503, 'Session usage unavailable'); return
            data=json.dumps(usage).encode()
            self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
        if path == '/assets/flight-to-the-light.wav' and self.headers.get('Range'):
            score = root / 'assets' / 'flight-to-the-light.wav'
            if not score.is_file(): self.send_error(404); return
            size = score.stat().st_size
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers['Range'].strip())
            if not match or not any(match.groups()):
                self.send_error(416); return
            first, last = match.groups()
            if first:
                start = int(first); end = min(int(last) if last else size-1, size-1)
            else:
                length = int(last); start = max(0, size-length); end = size-1
            if start >= size or start > end:
                self.send_response(416); self.send_header('Content-Range', f'bytes */{size}'); self.end_headers(); return
            self.send_response(206); self.send_header('Content-Type','audio/wav'); self.send_header('Content-Range',f'bytes {start}-{end}/{size}'); self.send_header('Content-Length',str(end-start+1)); self.end_headers()
            try:
                with score.open('rb') as source:
                    source.seek(start); remaining=end-start+1
                    while remaining:
                        chunk=source.read(min(65536,remaining))
                        if not chunk: break
                        self.wfile.write(chunk); remaining-=len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass  # A seek can cancel the browser's previous range request.
            return
        super().do_GET()
    def log_message(self, format, *args):
        if '/api/usage' not in str(args): super().log_message(format,*args)

if __name__ == '__main__':
    os.chdir(root)
    print('Alpenglow preview: http://127.0.0.1:4173', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4173), Handler).serve_forever()
