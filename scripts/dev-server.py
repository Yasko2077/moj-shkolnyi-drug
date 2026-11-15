#!/usr/bin/env python3
"""Private, zero-cost local preview with automatic fast-forward updates from GitHub."""
from __future__ import annotations

import json
import subprocess
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
BRANCH = "test/yntymak-supabase-audit"
POLL_SECONDS = 20
PORT = 8008
_lock = threading.Lock()
_version = "starting"


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(ROOT), *args],
        check=True, capture_output=True, text=True, timeout=30
    )
    return result.stdout.strip()


def current_version() -> str:
    try:
        return git("rev-parse", "HEAD")
    except Exception:
        return "unknown"


def sync_loop() -> None:
    global _version
    _version = current_version()
    while True:
        time.sleep(POLL_SECONDS)
        try:
            with _lock:
                git("fetch", "origin", BRANCH)
                local = git("rev-parse", "HEAD")
                remote = git("rev-parse", f"origin/{BRANCH}")
                if local == remote:
                    continue
                dirty = git("status", "--porcelain")
                if dirty:
                    print("[sync] New GitHub changes found, but local files have edits.")
                    print("[sync] Automatic update paused to protect your local work.")
                    continue
                git("merge", "--ff-only", f"origin/{BRANCH}")
                _version = current_version()
                print(f"[sync] Updated to {_version[:10]}; refresh will happen in Safari.")
        except Exception as exc:
            print(f"[sync] Could not check GitHub: {exc}")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/__yntymak_version":
            body = json.dumps({"version": _version}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path.endswith(".html") or path == "/":
            file_path = Path(self.translate_path(self.path))
            if file_path.is_file():
                data = file_path.read_bytes()
                watcher = b"""<script>
(() => {
  let seen = null;
  setInterval(async () => {
    try {
      const response = await fetch('/__yntymak_version', {cache:'no-store'});
      const state = await response.json();
      if (seen === null) seen = state.version;
      else if (state.version !== seen) location.reload();
    } catch (_) {}
  }, 2500);
})();
</script>"""
                data = data.replace(b"</body>", watcher + b"</body>")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

if __name__ == "__main__":
    if not (ROOT / ".git").exists():
        raise SystemExit(
            "This folder is not a Git clone. Clone the private repository branch first."
        )
    if git("branch", "--show-current") != BRANCH:
        raise SystemExit(f"Switch this clone to branch {BRANCH} before starting.")
    threading.Thread(target=sync_loop, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Ынтымак preview: http://localhost:{PORT}")
    print(f"GitHub sync: every {POLL_SECONDS}s; Safari refreshes after a new commit.")
    print("Stop with Control+C.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPreview stopped.")
    finally:
        server.server_close()
