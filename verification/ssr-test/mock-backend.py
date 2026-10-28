# Fake API for the SSR isolation test. The payload reveals which session and tenant cookies the
# backend received, so a rendered page that shows another pair proves a cross-request leak.
# Cookies: session=<user> (default anonymous), tenant=<tenant> (default t0), slow=1 (adds 1.2 s so
# late responses interleave with faster requests). Random jitter keeps requests overlapping.
import json, os, random, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def cookie_value(header, name, default):
    for part in header.split('; '):
        if part.startswith(f'{name}='):
            return part.split('=', 1)[1]
    return default


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        cookie = self.headers.get('Cookie', '')
        session = cookie_value(cookie, 'session', 'anonymous')
        tenant = cookie_value(cookie, 'tenant', 't0')
        slow = cookie_value(cookie, 'slow', '0') == '1'
        time.sleep(random.uniform(0.05, 0.3) + (1.2 if slow else 0))
        body = {"items": [{"id": 1, "email": f"{session}@{tenant}.example.com",
                           "fullName": f"User of {session} at {tenant}", "isActive": True}],
                "total": 1, "limit": 20, "offset": 0}
        data = json.dumps(body).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(data)

    def log_message(self, *a):
        pass


ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('MOCK_PORT', '8000'))), H).serve_forever()
