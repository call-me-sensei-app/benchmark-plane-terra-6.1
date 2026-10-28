import json, os, sys, tempfile, time
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

now = time.time()
def ts(value): return datetime.fromtimestamp(value, timezone.utc).isoformat().replace('+00:00', 'Z')
records = [
    {'type':'event_msg','timestamp':ts(now-100),'payload':{'type':'task_started'}},
    {'type':'token_usage_record','timestamp':ts(now-99),'payload':{'usage':{'input_tokens':1000,'cached_input_tokens':800,'cache_write_input_tokens':0,'output_tokens':100,'total_tokens':1100}}},
    {'type':'event_msg','timestamp':ts(now-70),'payload':{'type':'task_complete'}},
    {'type':'event_msg','timestamp':ts(now-10),'payload':{'type':'task_started'}},
    {'type':'token_usage_record','timestamp':ts(now-9),'payload':{'usage':{'input_tokens':300000,'cached_input_tokens':200000,'cache_write_input_tokens':0,'output_tokens':1000,'total_tokens':301000}}},
    {'type':'event_msg','timestamp':ts(now-5),'payload':{'type':'task_complete'}},
]
with tempfile.NamedTemporaryFile(mode='w', delete=False) as stream:
    for record in records: stream.write(json.dumps(record)+'\n')
    path=stream.name
try:
    server.session_file=path
    result=server.session_usage()
    assert result['total_tokens']==302100 and result['cached_input_tokens']==200800, result
    assert not result['active_turn'] and abs(result['active_dev_seconds']-35)<.01, result
    assert abs(result['estimated_cost']-.22824)<1e-8, result
finally:
    os.unlink(path)
print('Usage aggregation, long-context rates and idle-gap exclusion: OK')
