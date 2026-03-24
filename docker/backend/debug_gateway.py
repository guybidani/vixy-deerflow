"""Debug script: tests gateway startup step by step, serves error via HTTP if anything fails."""
import os
import sys
import traceback

os.chdir("/app/backend")
sys.path.insert(0, ".")

error_msg = None
success_info = []


def test(label, fn):
    global error_msg
    if error_msg:
        return  # stop on first error
    try:
        result = fn()
        success_info.append(f"OK: {label}" + (f" -> {result}" if result else ""))
    except Exception as e:
        error_msg = f"FAIL at step [{label}]: {e}\n\n{traceback.format_exc()}"
        print(error_msg, file=sys.stderr, flush=True)


# Step 1: Basic imports
test("import deerflow.config.app_config", lambda: __import__("deerflow.config.app_config"))

# Step 2: Config loading
def load_config():
    from deerflow.config.app_config import get_app_config
    cfg = get_app_config()
    return f"{len(cfg.models)} models"

test("get_app_config()", load_config)

# Step 3: Gateway config
def load_gateway_config():
    from app.gateway.config import get_gateway_config
    cfg = get_gateway_config()
    return f"port={cfg.port}"

test("get_gateway_config()", load_gateway_config)

# Step 4: Router imports
test("import app.gateway.routers.models", lambda: __import__("app.gateway.routers.models", fromlist=["models"]))
test("import app.gateway.routers.threads", lambda: __import__("app.gateway.routers.threads", fromlist=["threads"]))
test("import app.gateway.routers.agents", lambda: __import__("app.gateway.routers.agents", fromlist=["agents"]))
test("import app.gateway.routers.mcp", lambda: __import__("app.gateway.routers.mcp", fromlist=["mcp"]))
test("import app.gateway.routers.memory", lambda: __import__("app.gateway.routers.memory", fromlist=["memory"]))
test("import app.gateway.routers.skills", lambda: __import__("app.gateway.routers.skills", fromlist=["skills"]))

# Step 5: Full app import (may trigger more imports)
test("import app.gateway.app", lambda: __import__("app.gateway.app", fromlist=["app"]))

# Step 6: Create FastAPI app
def create_app():
    from app.gateway.app import create_app as ca
    app = ca()
    return "FastAPI created"

test("create_app()", create_app)

if not error_msg:
    # Everything OK - report success and exit
    report = "ALL_OK\n" + "\n".join(success_info)
    print(report, flush=True)
    # Serve success message briefly so we can read it
    from http.server import BaseHTTPRequestHandler, HTTPServer
    body = report.encode()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *a): pass

    print("Gateway debug: all OK, serving result on :8001 for 60s", flush=True)
    import threading
    httpd = HTTPServer(("0.0.0.0", 8001), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    import time
    time.sleep(60)
    httpd.shutdown()
    sys.exit(0)

# Serve the error
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
        pass


print("Serving gateway error on :8001", flush=True)
HTTPServer(("0.0.0.0", 8001), Handler).serve_forever()
