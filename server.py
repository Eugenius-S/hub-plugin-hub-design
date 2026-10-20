"""Канвас дизайна: процесс плагина раздаёт HTML дизайна с диска со своего адреса (localhost, порт страницы хаба + 11)
и подкладывает в него agent.js — тот рисует пины и рамки и говорит со страницей хаба через postMessage.

Свой адрес, а не страница хаба: скрипты дизайна работают как в браузере (шрифты, видео, анимации), но не с правами
страницы хаба. Отдаёт только файлы веба внутри папок сессий и проектов хаба, без скрытых; встраивать себя — только
странице хаба; запрос с чужого сайта — отказ."""
import json
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_PORT = int(os.environ.get("HUB_WEB_PORT") or 8787)
PORT = int(os.environ.get("DESIGN_CANVAS_PORT") or WEB_PORT + 11)
TYPES = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4",
    ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8",
    ".lottie": "application/zip",
}
HTML = (".html", ".htm")
ROOTS_TTL = 15
WATCH_FILES = 2000   # файлов в папке дизайна, чьё время правки смотрит /__canvas/stat
CHUNK = 256 * 1024
DRIVE = re.compile(r"^[A-Za-z]:$")


def state_dir():
    return os.environ.get("HUB_STATE_DIR") or os.path.expanduser("~/.hub-core")


_roots = {"at": 0.0, "list": []}


def roots():
    """Папки, из которых можно отдавать: рабочие папки сессий хаба и папки проектов из hub.json. Не корень диска."""
    if time.time() - _roots["at"] < ROOTS_TTL:
        return _roots["list"]
    found = set()
    try:
        from core import journal
        for s in journal.load_state(state_dir()).get("sessions", {}).values():
            if s.get("cwd"):
                found.add(s["cwd"])
    except Exception:   # хаба нет рядом (тесты, старая версия) — только проекты
        pass
    try:
        from core import catalog
        path = catalog.config_path(state_dir())
    except Exception:
        path = os.environ.get("HUB_CONFIG") or ""
    try:
        with open(path, encoding="utf-8") as f:
            for p in (json.load(f).get("projects") or {}).values():
                if isinstance(p, dict) and p.get("path"):
                    found.add(os.path.expanduser(p["path"]))
    except (OSError, ValueError):
        pass
    out = []
    for r in found:
        real = os.path.realpath(r)
        if os.path.isdir(real) and os.path.dirname(real) != real:
            out.append(real)
    _roots.update(at=time.time(), list=sorted(out))
    return out


def allowed(real):
    """Файл веба внутри разрешённых папок, без скрытых частей пути внутри них (.git, .env)."""
    if os.path.splitext(real)[1].lower() not in TYPES or not os.path.isfile(real):
        return False
    for r in roots():
        if real.startswith(r.rstrip(os.sep) + os.sep):
            rel = real[len(r.rstrip(os.sep)) + 1:]
            if not any(part.startswith(".") for part in re.split(r"[\\/]", rel) if part):
                return True
    return False


def from_url(path):
    """/f/Users/me/site/index.html → /Users/me/site/index.html; /f/C:/site/a.html → C:/site/a.html."""
    rest = unquote(path[len("/f/"):])
    first = rest.split("/", 1)[0]
    real = rest if DRIVE.match(first) else "/" + rest
    return os.path.realpath(real)


def newest(html):
    """Самое свежее время правки в папке дизайна (сам файл, стили, картинки) — сигнал перезагрузить предпросмотр."""
    top = os.path.dirname(html)
    best, seen = os.path.getmtime(html), 0
    for base, dirs, files in os.walk(top):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__")]
        if base.count(os.sep) - top.count(os.sep) >= 2:
            dirs[:] = []
        for name in files:
            if name.startswith(".") or os.path.splitext(name)[1].lower() not in TYPES:
                continue
            seen += 1
            try:
                best = max(best, os.path.getmtime(os.path.join(base, name)))
            except OSError:
                pass
            if seen >= WATCH_FILES:
                return best
    return best


def page_origins():
    return [f"http://localhost:{WEB_PORT}", f"http://127.0.0.1:{WEB_PORT}"]


def inject(body):
    """agent.js — последним в документе: его рамки и пины поверх дизайна."""
    tag = ('<script>window.__canvas={origins:%s}</script><script src="/__canvas/agent.js"></script>'
           % json.dumps(page_origins())).encode()
    low = body.lower()
    at = low.rfind(b"</body>")
    if at < 0:
        at = low.rfind(b"</html>")
    return body + tag if at < 0 else body[:at] + tag + body[at:]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "design-canvas"

    def log_message(self, *a):   # тишина: каждый запрос картинки — не для журнала хаба
        pass

    def head(self, code, kind, length, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "frame-ancestors 'self' " + " ".join(page_origins()))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()

    def say(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.head(code, "application/json; charset=utf-8", len(body))
        if self.command != "HEAD":
            self.wfile.write(body)

    def guard(self):
        """Только localhost по своему порту (не подменённое имя) и не запрос с чужого сайта."""
        host = (self.headers.get("Host") or "").lower()
        if host not in (f"localhost:{PORT}", f"127.0.0.1:{PORT}"):
            return "host"
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            return "cross-site"
        return None

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        bad = self.guard()
        if bad:
            return self.say(403, {"error": bad})
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/__canvas/ping":
            return self.say(200, {"ok": True, "v": version()})
        if url.path == "/__canvas/agent.js":
            with open(os.path.join(HERE, "agent.js"), "rb") as f:
                body = f.read()
            self.head(200, TYPES[".js"], len(body))
            return self.wfile.write(body) if self.command != "HEAD" else None
        if url.path == "/__canvas/stat":
            real = os.path.realpath(q.get("path", ""))
            if not real.lower().endswith(HTML) or not allowed(real):
                return self.say(404, {"error": "no file"})
            return self.say(200, {"mtime": newest(real)})
        if url.path.startswith("/f/"):
            real = from_url(url.path)
            if not allowed(real):
                return self.say(404, {"error": "no file"})
            return self.file(real)
        self.say(404, {"error": "no page"})

    def file(self, real):
        kind = TYPES[os.path.splitext(real)[1].lower()]
        if real.lower().endswith(HTML):
            with open(real, "rb") as f:
                body = inject(f.read())
            self.head(200, kind, len(body))
            return self.wfile.write(body) if self.command != "HEAD" else None
        size = os.path.getsize(real)
        start, end = 0, size - 1
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        if m and size and (m.group(1) or m.group(2)):   # видео — с перемоткой
            if m.group(1):
                start, end = int(m.group(1)), min(int(m.group(2) or size - 1), size - 1)
            else:
                start = max(0, size - int(m.group(2)))
            if start > end:
                self.head(416, kind, 0, {"Content-Range": f"bytes */{size}"})
                return
            self.head(206, kind, end - start + 1, {"Content-Range": f"bytes {start}-{end}/{size}", "Accept-Ranges": "bytes"})
        else:
            self.head(200, kind, size, {"Accept-Ranges": "bytes"})
        if self.command == "HEAD":
            return
        with open(real, "rb") as f:
            f.seek(start)
            left = end - start + 1
            try:
                while left > 0:
                    chunk = f.read(min(CHUNK, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass


def version():
    try:
        with open(os.path.join(HERE, "hub-plugin.json"), encoding="utf-8") as f:
            return json.load(f).get("version")
    except (OSError, ValueError):
        return None


def serve(port=PORT):
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    srv.daemon_threads = True
    return srv


def main():
    try:
        srv = serve()
    except OSError as e:
        print(f"design-canvas: порт {PORT} занят ({e}); задайте DESIGN_CANVAS_PORT", file=sys.stderr, flush=True)
        time.sleep(60)   # не биться о занятый порт каждую секунду: hub-up поднимет снова
        return 1
    print(f"design-canvas: http://localhost:{PORT}/", file=sys.stderr, flush=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        t.join()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
