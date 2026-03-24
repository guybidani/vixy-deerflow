"""Debug script: tests DeerFlow config loading, serves error via HTTP if it fails."""
import os
import sys
import traceback

os.chdir("/app/backend")
sys.path.insert(0, ".")

error_msg = None

try:
    from deerflow.config.app_config import get_app_config
    cfg = get_app_config()
    print(f"CONFIG_OK: {len(cfg.models)} models loaded", flush=True)
    sys.exit(0)  # Config OK - exit so the normal uvicorn can take over
except Exception as e:
    error_msg = f"CONFIG_FAIL: {e}\n\n{traceback.format_exc()}"
    print(error_msg, file=sys.stderr, flush=True)

# If we get here, config failed - serve the error via HTTP
from http.server import BaseHTTPRequestHandler, HTTPServer

body = error_msg.encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(500)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # suppress access log


print("Serving config error on :8001", flush=True)
HTTPServer(("0.0.0.0", 8001), Handler).serve_forever()
