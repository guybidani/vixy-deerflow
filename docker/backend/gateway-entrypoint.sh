#!/bin/sh
# Gateway entrypoint - captures startup errors and serves them via HTTP if uvicorn fails
set -e

cd /app/backend
PYTHONPATH=. uv run uvicorn app.gateway.app:app --host 0.0.0.0 --port 8001 --workers 1 2>&1 &
UVICORN_PID=$!

# Wait for uvicorn to either start listening or crash
sleep 10

# Check if uvicorn is still running
if ! kill -0 $UVICORN_PID 2>/dev/null; then
    # uvicorn crashed - serve the error via simple HTTP
    ERROR_LOG=$(cd /app/backend && PYTHONPATH=. uv run python3 -c "
from deerflow.config.app_config import get_app_config
try:
    get_app_config()
    print('Config OK')
except Exception as e:
    import traceback
    print('CONFIG ERROR:', e)
    traceback.print_exc()
" 2>&1)

    # Serve the error message as HTTP
    PYTHONPATH=. uv run python3 -c "
from http.server import HTTPServer, BaseHTTPRequestHandler
import os

error_msg = '''$ERROR_LOG'''

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(500)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(error_msg.encode())
    def log_message(self, format, *args):
        pass

httpd = HTTPServer(('0.0.0.0', 8001), Handler)
httpd.serve_forever()
"
else
    # uvicorn is running, wait for it
    wait $UVICORN_PID
fi
