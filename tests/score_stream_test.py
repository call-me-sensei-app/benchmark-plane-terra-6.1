import http.client
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Handler, root

score = root / 'assets' / 'flight-to-the-light.wav'
size = score.stat().st_size
httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
thread = threading.Thread(target=httpd.serve_forever, daemon=True)
thread.start()
try:
    connection = http.client.HTTPConnection('127.0.0.1', httpd.server_port, timeout=5)
    connection.request('GET', '/assets/flight-to-the-light.wav', headers={'Range': 'bytes=0-63'})
    response = connection.getresponse()
    data = response.read()
    assert response.status == 206
    assert response.getheader('Content-Range') == f'bytes 0-63/{size}'
    assert response.getheader('Accept-Ranges') == 'bytes'
    with score.open('rb') as source:
        assert data == source.read(64)
    connection.request('GET', '/assets/flight-to-the-light.wav', headers={'Range': 'bytes=-16'})
    response = connection.getresponse()
    assert response.status == 206 and len(response.read()) == 16
    connection.request('GET', '/assets/flight-to-the-light.wav', headers={'Range': f'bytes={size}-'})
    response = connection.getresponse()
    assert response.status == 416
    assert response.getheader('Content-Range') == f'bytes */{size}'
    response.read()
    connection.close()
finally:
    httpd.shutdown()
    httpd.server_close()
    thread.join()
print('Background music range streaming and seeking: OK')
