# Fake API: returns a user page whose name reveals which session cookie it received,
# with a random delay so concurrent SSR requests interleave.
import json, random, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        cookie = self.headers.get('Cookie', '')
        session = next((c.split('=', 1)[1] for c in cookie.split('; ') if c.startswith('session=')), 'anonymous')
        time.sleep(random.uniform(0.05, 0.3))
        body = {"items": [{"id": 1, "email": f"{session}@example.com", "fullName": f"User of {session}", "isActive": True}],
                "total": 1, "limit": 20, "offset": 0}
        data = json.dumps(body).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(data)
    def log_message(self, *a): pass

ThreadingHTTPServer(('127.0.0.1', 8000), H).serve_forever()
