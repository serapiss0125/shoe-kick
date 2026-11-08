# 開発用サーバー（キャッシュさせない）  python3 tools/serve.py [port]
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


http.server.SimpleHTTPRequestHandler.extensions_map['.js'] = 'text/javascript'
print(f'http://localhost:{PORT}/', flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), NoCache).serve_forever()
