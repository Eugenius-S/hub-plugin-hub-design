"""Hub Design: the plugin process serves the design HTML from disk at its own address (localhost, hub page port + 11)
and injects agent.js into it, which draws pins and boxes and talks to the hub page through postMessage.

Its own address, not the hub page: the design scripts run as in a browser (fonts, video, animations) but without the
rights of the hub page. It serves only web files inside the session and project folders of the hub, no hidden ones;
only the hub page may embed it; a request from a foreign site is refused."""
import hashlib
import html
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

import handwrite
import registry
import styles
import tgpost

HERE = os.path.dirname(os.path.abspath(__file__))
WEB_PORT = int(os.environ.get("HUB_WEB_PORT") or 8787)
PORT = int(os.environ.get("HUB_DESIGN_PORT") or os.environ.get("DESIGN_CANVAS_PORT") or WEB_PORT + 11)
TYPES = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".mp4": "video/mp4",
    ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8",
    ".lottie": "application/zip", ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
HTML = (".html", ".htm")
DOCS = (".pdf", ".svg")   # documents: opened on the canvas read-only, as a basis for a new design (the one list of non-HTML file types)
PAGES = HTML + DOCS   # what a frame and a card open: a human page instead of JSON when the file is gone
ROOTS_TTL = 15
WATCH_FILES = 2000   # files in the design folder whose modification time /__canvas/stat watches
CHUNK = 256 * 1024
HAVE_MAX = 60   # paths in one "do the files exist" question
DRIVE = re.compile(r"^[A-Za-z]:$")
PDF_TIMEOUT = 45   # seconds to print one design, then Chrome is killed
PDF_SIZE = (1440, 900)   # the design window if the page did not send its own
PDF_MAX = 20000          # pixels: we do not stretch a PDF page beyond this
WRITE_MAX = 2 * 1024 * 1024   # request body for writing edits
THUMB_SIZE = (1440, 900)   # the window a design is shot in for a card in the feed
DOC_SIZE = (900, 634)       # the window a document is shot in: the same ratio as the card tile
THUMB_SCALE = 0.34         # Chrome shrinks the shot at once: ~490 px wide
THUMB_TIMEOUT = 30
THUMB_KEEP = 300           # shots in the cache: older ones are erased
TG_WIDTH = 1080            # px: the shot of a design for a Telegram post (tgpost.py) - sharp on a phone
TITLE_READ = 64 * 1024     # how far into the file we look for <title>


def state_dir():
    return os.environ.get("HUB_STATE_DIR") or os.path.expanduser("~/.hub-core")


def config():
    """hub.json of this machine; unreadable: {}."""
    try:
        from core import catalog
        path = catalog.config_path(state_dir())
    except Exception:
        path = os.environ.get("HUB_CONFIG") or ""
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


_roots = {"at": 0.0, "list": [], "seen": set()}
REG = None   # registry.Registry of the designs ever made (set in main)


def roots():
    """Folders we may serve from: the working folders of the hub sessions and the project folders from hub.json. Never a disk root."""
    if time.time() - _roots["at"] < ROOTS_TTL:
        return _roots["list"]
    # folders where sessions have been are not forgotten: the journal is not always readable under load - without this, files turned "outside the folders" for 15 s
    found = _roots["seen"]
    try:
        from core import journal
        for s in journal.load_state(state_dir()).get("sessions", {}).values():
            if s.get("cwd"):
                found.add(s["cwd"])
    except Exception:   # no hub nearby (tests, an old version) or the journal was not read: what we saw before, and projects
        pass
    extra = {os.path.expanduser(p["path"]) for p in (config().get("projects") or {}).values() if isinstance(p, dict) and p.get("path")}
    # the folders of the designs ever made: a session that made one may be gone, the design must still open (not a wide folder - registry.broad)
    extra |= set(REG.folders() if REG else [])
    out = []
    for r in found | extra:
        real = os.path.realpath(r)
        if os.path.isdir(real) and os.path.dirname(real) != real:
            out.append(real)
    _roots.update(at=time.time(), list=sorted(out))
    return out


def allowed(real):
    """A web file inside the allowed folders, with no hidden path parts inside them (.git, .env)."""
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
    """The latest modification time in the design folder (the file itself, styles, images): the signal to reload the preview."""
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


def file_state(path):
    """ok: we serve it; missing: no such file on disk; denied: it exists but is outside the session and project folders of the hub or hidden: nothing to show."""
    real = os.path.realpath(path)
    if allowed(real):
        return "ok"
    return "denied" if os.path.exists(real) else "missing"


def gone_page(real, state):
    """Instead of a raw {"error": "no file"} in the frame and on the card: a page with the file name and the reason."""
    why = "File not found" if state == "missing" else "The file is outside the project and session folders of the hub, the plugin will not show it"
    body = ('<!doctype html><meta charset="utf-8"><title>%s</title><body style="margin:0;display:flex;align-items:center;justify-content:center;'
            'height:100vh;font:14px system-ui,sans-serif;color:#555;background:#f4f4f5;text-align:center"><div><p style="font-size:16px;color:#222">%s</p>'
            '<p style="max-width:560px;overflow-wrap:anywhere">%s</p></div>' % (why, why, html.escape(real))).encode()
    return body


def library():
    """The style reference library of this hub (styles.py), None - the feature is off."""
    return styles.load(styles.folder(config(), state_dir()))


def page_origins():
    return [f"http://localhost:{WEB_PORT}", f"http://127.0.0.1:{WEB_PORT}"]


def inject(body):
    """agent.js (with anchor.js before it) goes last in the document: its boxes and pins sit on top of the design."""
    tag = ('<script>window.__canvas={origins:%s}</script><script src="/__canvas/anchor.js"></script><script src="/__canvas/agent.js"></script>'
           % json.dumps(page_origins())).encode()
    low = body.lower()
    at = low.rfind(b"</body>")
    if at < 0:
        at = low.rfind(b"</html>")
    body = body + tag if at < 0 else body[:at] + tag + body[at:]
    return early(body)


# print version of a design (?print=1&w=&h=): the PDF page is the design window; a design taller than the window is one tall page; if it
# holds slides (.slide, [data-slide]), one page per slide. Injected for the Chrome that pdf() launches
PRINT_JS = b"""<script>addEventListener("load",function(){
var q=new URLSearchParams(location.search),W=+q.get("w")||%d,H=+q.get("h")||%d,max=%d;
var sl=[].slice.call(document.querySelectorAll(".slide,[data-slide],section.slide")),css="*{-webkit-print-color-adjust:exact;print-color-adjust:exact}";
if(sl.length>1){var r=sl[0].getBoundingClientRect();W=Math.round(r.width)||W;H=Math.round(r.height)||H;
css+=".slide,[data-slide]{break-after:page;page-break-after:always}";}
else if(!q.get("fixed"))H=Math.max(H,Math.ceil(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)));
H=Math.min(H,max);
var own=false;try{[].slice.call(document.styleSheets).forEach(function(s){[].slice.call(s.cssRules||[]).forEach(function(r){if(r.type===6&&r.style&&r.style.getPropertyValue("size"))own=true;});});}catch(e){}
var st=document.createElement("style");st.textContent=(own?"":"@page{size:"+W+"px "+H+"px;margin:0}")+css;document.head.appendChild(st);
document.documentElement.setAttribute("data-hd-print",W+"x"+H);
if(q.get("auto"))setTimeout(function(){print();},300);});</script>""" % (PDF_SIZE[0], PDF_SIZE[1], PDF_MAX)


def printable(body):
    low = body.lower()
    at = low.rfind(b"</body>")
    return body + PRINT_JS if at < 0 else body[:at] + PRINT_JS + body[at:]


def chrome_path():
    """The browser for printing to PDF: HUB_TEST_CHROME or testchrome.path from hub.json (the same one the hub uses for shots and tests).
    The user's everyday Chrome is never used. None found: None, and the page prints the frame itself."""
    path = (os.environ.get("HUB_TEST_CHROME") or (config().get("testchrome") or {}).get("path") or "").strip()
    path = os.path.expanduser(path)
    return path if path and os.path.isfile(path) else None


def kill_tree(proc):
    """Chrome with its helpers: the process group (on Windows, the tree) by the launch pid."""
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True, timeout=10)
        else:
            os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError, subprocess.SubprocessError):
        pass
    try:
        proc.wait(5)
    except subprocess.SubprocessError:
        pass


_pdf_lock = threading.Lock()


class PdfError(Exception):
    pass


def pdf(real, w, h):
    """PDF of a design: our own Chrome process (headless, profile in a temp folder) prints the print version from this same server.
    None: Chrome is not configured; PdfError: it failed. The process and the folder are always cleaned up."""
    chrome = chrome_path()
    if not chrome:
        return None
    size = size_of(real)
    fixed = bool(size and size[1])   # the size is set by the design itself (hub-frame meta, explicit width and height): one page of exactly that size
    if fixed:
        w, h = size
    w, h = max(200, min(int(w), PDF_MAX)), max(200, min(int(h), PDF_MAX))
    url = "http://127.0.0.1:%d/f/%s?%s" % (PORT, "/".join(quote(x) for x in real.replace("\\", "/").lstrip("/").split("/")),
                                           "print=1&w=%d&h=%d%s" % (w, h, "&fixed=1" if fixed else ""))
    with _pdf_lock:
        tmp = tempfile.mkdtemp(prefix="hub-design-pdf-")
        out = os.path.join(tmp, "out.pdf")
        cmd = [chrome, "--headless", "--disable-gpu", "--hide-scrollbars", "--no-pdf-header-footer", "--user-data-dir=" + os.path.join(tmp, "profile"),
               "--window-size=%d,%d" % (w, h), "--virtual-time-budget=4000", "--print-to-pdf=" + out, url]
        kw = {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)} if os.name == "nt" else {"start_new_session": True}
        proc = None
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)
            try:
                proc.wait(PDF_TIMEOUT)
            except subprocess.TimeoutExpired:
                raise PdfError("Chrome did not finish printing in %d s" % PDF_TIMEOUT)
            try:
                with open(out, "rb") as f:
                    data = f.read()
            except OSError:
                raise PdfError("Chrome left no PDF (code %s)" % proc.returncode)
            if not data.startswith(b"%PDF"):
                raise PdfError("Chrome returned something that is not a PDF")
            return data
        finally:
            if proc is not None:
                kill_tree(proc)
            shutil.rmtree(tmp, ignore_errors=True)


FRAME_MIN, FRAME_MAX = 100, 8000    # frame size of a design that sets its own, pixels
SIZE_READ = 256 * 1024              # how far into the file we look for the declared size
_META_FRAME = re.compile(r"<meta\b[^>]*\bname\s*=\s*[\"']hub-frame[\"'][^>]*>", re.I)
_PX_DECL = re.compile(r"(?<![\w-])(width|height)\s*:\s*(\d+(?:\.\d+)?)px\s*(?:!important\s*)?(?=;|$)", re.I)


def _size_ok(w, h):
    return FRAME_MIN <= w <= FRAME_MAX and FRAME_MIN <= h <= FRAME_MAX


def size_of(real):
    """The design size as the file itself sets it: <meta name="hub-frame" content="1080x1350"> (first), otherwise an explicit width/height in px
    on html and body (document styles and style="" on the tags). Not set - None; only a width - (w, None)."""
    try:
        with open(real, "rb") as f:
            text = f.read(SIZE_READ).decode("utf-8", "replace")
    except OSError:
        return None
    for tag in _META_FRAME.findall(text):
        m = re.search(r"content\s*=\s*[\"']\s*(\d+)\s*[x×X*]\s*(\d+)", tag)
        if m and _size_ok(int(m.group(1)), int(m.group(2))):
            return (int(m.group(1)), int(m.group(2)))
    got = {}

    def take(decls):
        for k, v in _PX_DECL.findall(decls):
            got[k.lower()] = round(float(v))

    for css in re.findall(r"<style[^>]*>(.*?)</style>", text, re.S | re.I):
        css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
        css = re.sub(r"@[\w-]+[^{};]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", "", css)   # @media, @supports, @font-face: not an unconditional size
        for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
            if any(x.strip().lower() in ("html", "body", "html body") for x in sel.split(",")):
                take(body)
    for tag in re.findall(r"<(?:html|body)\b[^>]*>", text, re.I):
        m = re.search(r"\bstyle\s*=\s*[\"']([^\"']*)", tag, re.I)
        if m:
            take(m.group(1))
    w, h = got.get("width"), got.get("height")
    if w and FRAME_MIN <= w <= FRAME_MAX:
        return (w, h if h and FRAME_MIN <= h <= FRAME_MAX else None)
    return None


def title_of(real):
    """The design <title> for a card in the feed; none - an empty string."""
    try:
        with open(real, "rb") as f:
            head = f.read(TITLE_READ).decode("utf-8", "replace")
    except OSError:
        return ""
    m = re.search(r"<title[^>]*>(.*?)</title>", head, re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(m.group(1))).strip() if m else ""


def thumb_dir():
    return os.path.join(state_dir(), "hub-design", "thumbs")


def thumb_path(real, stamp):
    return os.path.join(thumb_dir(), hashlib.sha1(("%s|%s" % (real, stamp)).encode("utf-8")).hexdigest()[:24] + ".png")


_thumb_lock = threading.Lock()


def thumb(real, big=False):
    """A shot of the design for a card: our own headless Chrome (the one that prints PDF) opens the file as on disk and shoots a 1440×900 window,
    shrunk while shooting. The cache is by path and the edit time of the design folder. None - Chrome is not set up; PdfError - it failed.
    big - TG_WIDTH px wide (a Telegram post) instead of a card's ~490."""
    out = thumb_path(real, "%s|tg" % newest(real) if big else newest(real))
    try:
        with open(out, "rb") as f:
            return f.read()
    except OSError:
        pass
    if real.lower().endswith(".pdf"):   # the headless Chrome has no PDF viewer ("Couldn't load plugin"): the first page - by the system's own rasterizer
        data = pdf_shot(real, TG_WIDTH if big else None)
        if data:
            keep_thumb(out, data)
        return data
    chrome = chrome_path()
    if not chrome:
        return None
    doc = not real.lower().endswith(HTML)   # a document (pdf, svg): a narrow window - its column fills the tile
    url = "http://127.0.0.1:%d/f/%s?%s" % (PORT, "/".join(quote(x) for x in real.replace("\\", "/").lstrip("/").split("/")), "raw=1&player=1" if real.lower().endswith(DOCS) else "raw=1")
    size = None if doc else size_of(real)
    win = DOC_SIZE if doc else THUMB_SIZE if not size else (size[0], size[1] or THUMB_SIZE[1])   # a design with a set size is shot whole
    scale = THUMB_SCALE * THUMB_SIZE[0] / win[0] if doc else THUMB_SCALE
    if big:
        scale = min(2.0, TG_WIDTH / win[0])
    with _thumb_lock:
        tmp = tempfile.mkdtemp(prefix="hub-design-thumb-")
        shot = os.path.join(tmp, "out.png")
        cmd = [chrome, "--headless", "--disable-gpu", "--hide-scrollbars", "--user-data-dir=" + os.path.join(tmp, "profile"),
               "--window-size=%d,%d" % win, "--force-device-scale-factor=%s" % scale, "--virtual-time-budget=3000",
               "--screenshot=" + shot, url]
        kw = {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)} if os.name == "nt" else {"start_new_session": True}
        proc = None
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)
            try:
                proc.wait(THUMB_TIMEOUT)
            except subprocess.TimeoutExpired:
                raise PdfError("Chrome did not shoot the design in %d s" % THUMB_TIMEOUT)
            try:
                with open(shot, "rb") as f:
                    data = f.read()
            except OSError:
                raise PdfError("Chrome left no shot (code %s)" % proc.returncode)
            if not data.startswith(b"\x89PNG"):
                raise PdfError("Chrome returned not an image")
        finally:
            if proc is not None:
                kill_tree(proc)
            shutil.rmtree(tmp, ignore_errors=True)
    keep_thumb(out, data)
    return data


def keep_thumb(out, data):
    try:
        os.makedirs(thumb_dir(), exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        old = sorted((os.path.join(thumb_dir(), n) for n in os.listdir(thumb_dir())), key=os.path.getmtime)
        for p in old[:-THUMB_KEEP]:
            os.remove(p)
    except OSError:
        pass   # the cache was not written - the shot is served anyway


def pdf_shot(real, width=None):
    """The first page of a PDF as a PNG ~490 px wide (or width): macOS has it built in (sips); elsewhere None - the card keeps its icon."""
    sips = shutil.which("sips")
    if not sips:
        return None
    tmp = tempfile.mkdtemp(prefix="hub-design-pdf-")
    try:
        shot = os.path.join(tmp, "out.png")
        try:
            subprocess.run([sips, "-s", "format", "png", "--resampleWidth", str(width or round(THUMB_SIZE[0] * THUMB_SCALE)), real, "--out", shot],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=THUMB_TIMEOUT)
            with open(shot, "rb") as f:
                data = f.read()
        except (OSError, subprocess.SubprocessError):
            return None
        return data if data.startswith(b"\x89PNG") else None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# hand edits go point by point into the file. No state in the process: the source for recomputing is the copy <name>.r<N>.html next to it; its name and the time
# of the file after the previous write come from the page; a file with another time was edited by someone else: refusal "changed", the page starts over
_write_lock = threading.Lock()


class WriteError(Exception):
    def __init__(self, code, text):
        super().__init__(text)
        self.code, self.text = code, text


def read_text(path):
    try:
        with open(path, "rb") as f:
            return f.read().decode("utf-8")
    except UnicodeDecodeError:
        raise WriteError(400, "the file is not UTF-8")


def free_copy(real, start):
    stem, ext = os.path.splitext(real)
    n = max(0, int(start))
    while os.path.exists("%s.r%d%s" % (stem, n, ext)):
        n += 1
    return "%s.r%d%s" % (stem, n, ext)


def write_file(real, data):
    """Replace the file as a whole in one step: watchers and the browser never see a half-written file."""
    tmp = os.path.join(os.path.dirname(real), ".hub-design-%d.tmp" % os.getpid())
    try:
        with open(tmp, "wb") as f:
            f.write(data.encode("utf-8"))
        try:
            shutil.copymode(real, tmp)
        except OSError:
            pass
        os.replace(tmp, real)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def write(real, body):
    """Write the hand edits into real. body: changes, ops, busy, round, copy (the copy name, if one was already made), fmtime (the file time after
    our write). A refusal is a WriteError: 409 busy (the design's author is mid-turn), 409 changed (the file was edited without us)."""
    changes = [c for c in (body.get("changes") or [])[:400] if isinstance(c, dict)]
    ops = [o for o in (body.get("ops") or [])[:60] if isinstance(o, dict)]
    if body.get("busy"):
        raise WriteError(409, "busy")
    stem, ext = os.path.splitext(real)
    copy = os.path.basename(str(body.get("copy") or ""))
    fmtime = int(body.get("fmtime") or 0)
    with _write_lock:
        now = int(os.stat(real).st_mtime * 1000)
        cur = read_text(real)
        copy_path = os.path.join(os.path.dirname(real), copy) if copy else ""
        if copy or fmtime:
            ok = copy and re.fullmatch(re.escape(os.path.basename(stem)) + r"\.r\d+" + re.escape(ext), copy) and os.path.isfile(copy_path) and abs(now - fmtime) <= 1
            if not ok:
                raise WriteError(409, "changed")
            base = read_text(copy_path)
        else:
            base = cur
        out, done, skipped, ops_state, ops_why = handwrite.apply(base, changes, ops)
        touched = out != base
        if not touched:   # nothing to write: the file is as it was before us; our copy is no longer needed
            if copy and cur != base:
                write_file(real, base)
            if copy:
                try:
                    os.remove(copy_path)
                except OSError:
                    pass
            copy_path = ""
        else:
            if not copy_path:   # first write: a copy of the source next to it, and only then the edit
                copy_path = free_copy(real, body.get("round") or 0)
                with open(copy_path, "xb") as f:
                    f.write(base.encode("utf-8"))
            if out != cur:
                write_file(real, out)
        return {"ok": True, "copy": os.path.basename(copy_path), "fmtime": int(os.stat(real).st_mtime * 1000), "stamp": newest(real),
                "done": done, "skipped": skipped, "ops": ops_state, "opsWhy": ops_why}


EARLY_TAG = b'<script src="/__canvas/early.js"></script>'
_open_tags = [re.compile(rb"<head(?:\s[^>]*)?>", re.I), re.compile(rb"<html(?:\s[^>]*)?>", re.I), re.compile(rb"<!doctype[^>]*>", re.I)]


def early(body):
    """The error catcher (early.js) goes as the very first script: after <head> (or <html>, the doctype), and without them at the start."""
    for rx in _open_tags:
        m = rx.search(body)
        if m:
            return body[:m.end()] + EARLY_TAG + body[m.end():]
    return EARLY_TAG + body


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "hub-design"

    def log_message(self, *a):   # silence: every image request does not belong in the hub log
        pass

    def head(self, code, kind, length, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(length))
        if "Cache-Control" not in (extra or {}):
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "frame-ancestors 'self' " + " ".join(page_origins()))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()

    def say(self, code, data, extra=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.head(code, "application/json; charset=utf-8", len(body), extra)
        if self.command != "HEAD":
            self.wfile.write(body)

    def guard(self):
        """Only localhost on its own port (not a spoofed name) and not a request from a foreign site."""
        host = (self.headers.get("Host") or "").lower()
        if host not in (f"localhost:{PORT}", f"127.0.0.1:{PORT}"):
            return "host"
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            return "cross-site"
        return None

    def cors(self):
        origin = self.headers.get("Origin")
        return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in page_origins() else {}

    def do_OPTIONS(self):
        bad = self.guard()
        if bad or not self.cors():
            return self.say(403, {"error": bad or "origin"})
        self.head(204, "text/plain", 0, {**self.cors(), "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type",
                                          "Access-Control-Max-Age": "600"})

    def do_POST(self):
        """/__canvas/write: hand edits into the file. Only from the hub page (Origin) and only a file the process shows anyway."""
        bad = self.guard()
        url = urlparse(self.path)
        if bad or url.path != "/__canvas/write":
            return self.say(403 if bad else 404, {"error": bad or "no page"})
        extra = self.cors()
        if not extra:
            return self.say(403, {"error": "origin"})
        try:
            size = int(self.headers.get("Content-Length") or 0)
            if size <= 0 or size > WRITE_MAX:
                return self.say(413, {"error": "body"}, extra)
            body = json.loads(self.rfile.read(size).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self.say(400, {"error": "body"}, extra)
        real = os.path.realpath(str(body.get("path") or "")) if isinstance(body, dict) else ""
        if not real.lower().endswith(HTML) or not allowed(real):
            return self.say(404, {"error": "no file"}, extra)
        try:
            return self.say(200, write(real, body), extra)
        except WriteError as e:
            return self.say(e.code, {"error": e.text}, extra)
        except OSError as e:
            return self.say(500, {"error": "cannot write: " + (e.strerror or str(e))}, extra)

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
        if url.path in ("/__canvas/agent.js", "/__canvas/anchor.js", "/__canvas/early.js"):
            with open(os.path.join(HERE, url.path.rsplit("/", 1)[1]), "rb") as f:
                body = f.read()
            self.head(200, TYPES[".js"], len(body))
            return self.wfile.write(body) if self.command != "HEAD" else None
        if url.path == "/__canvas/have":
            # do the design files exist: the hub page asks from its own origin (CORS only for it), one word per path
            paths = parse_qs(url.query).get("path", [])[:HAVE_MAX]
            origin = self.headers.get("Origin")
            extra = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in page_origins() else None
            body = json.dumps({p: file_state(p) for p in paths}, ensure_ascii=False).encode()
            self.head(200, "application/json; charset=utf-8", len(body), extra)
            return self.wfile.write(body) if self.command != "HEAD" else None
        if url.path == "/__canvas/registry":
            # the designs ever made on this machine (registry.py) with the state of each file: the start screen lists them whatever sessions exist now
            rows = REG.listing() if REG else []
            out = [{**r, "state": file_state(os.path.expanduser(r["path"]))} for r in rows]
            return self.say(200, {"ready": bool(REG and REG.ready), "items": out}, self.cors())
        if url.path == "/__canvas/times":
            # when the design files were edited (for the start screen cards): only those that can be shown
            paths = parse_qs(url.query).get("path", [])[:HAVE_MAX]
            origin = self.headers.get("Origin")
            extra = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in page_origins() else None
            out = {}
            for p in paths:
                real = os.path.realpath(p)
                try:
                    if real.lower().endswith(HTML) and allowed(real):
                        out[p] = newest(real)
                except OSError:
                    pass
            body = json.dumps(out, ensure_ascii=False).encode()
            self.head(200, "application/json; charset=utf-8", len(body), extra)
            return self.wfile.write(body) if self.command != "HEAD" else None
        if url.path == "/__canvas/size":
            # the design size from the file itself (hub-frame meta or explicit width/height on html/body): {path: [w, h|null]}, none - not included
            paths = parse_qs(url.query).get("path", [])[:HAVE_MAX]
            out = {}
            for p in paths:
                real = os.path.realpath(os.path.expanduser(p))
                try:
                    if real.lower().endswith(HTML) and allowed(real):
                        size = size_of(real)
                        if size:
                            out[p] = list(size)
                except OSError:
                    pass
            return self.say(200, out, self.cors())
        if url.path == "/__canvas/card":
            # a card of a design or a video in the chat feed: file state, title, edit time. Only from the hub page (CORS)
            real = os.path.realpath(os.path.expanduser(q.get("path", "")))
            out = {"state": file_state(real), "title": "", "mtime": 0}
            if out["state"] == "ok":
                out["mtime"] = newest(real) if real.lower().endswith(HTML) else os.path.getmtime(real)
                out["title"] = title_of(real) if real.lower().endswith(HTML) else ""
            return self.say(200, out, self.cors())
        if url.path == "/__canvas/thumb":
            real = os.path.realpath(os.path.expanduser(q.get("path", "")))
            if not real.lower().endswith(PAGES) or not allowed(real):
                return self.say(404, {"error": "no file"}, self.cors())
            try:
                data = thumb(real)
            except PdfError as e:
                return self.say(500, {"error": str(e)}, self.cors())
            if data is None:   # Chrome is not set up - an icon on the card
                return self.say(501, {"error": "no chrome"}, self.cors())
            self.head(200, "image/png", len(data), {**self.cors(), "Cache-Control": "private, max-age=3600"})
            return self.wfile.write(data) if self.command != "HEAD" else None
        if url.path.startswith("/__canvas/style"):
            return self.styles(url.path, q)
        if url.path == "/__canvas/stat":
            real = os.path.realpath(q.get("path", ""))
            if not real.lower().endswith(HTML) or not allowed(real):
                return self.say(404, {"error": "no file"})
            return self.say(200, {"mtime": newest(real)})
        if url.path.startswith("/f/"):
            real = from_url(url.path)
            if not allowed(real):
                if real.lower().endswith(PAGES):   # a document in a frame: a human page, not JSON
                    body = gone_page(real, file_state(real))
                    self.head(404, TYPES[".html"], len(body))
                    return self.wfile.write(body) if self.command != "HEAD" else None
                return self.say(404, {"error": "no file"})
            if q.get("pdf") and real.lower().endswith(HTML):
                return self.pdf(real, q)
            if q.get("player") and not real.lower().endswith(HTML):
                return self.player(real)
            return self.file(real, raw=bool(q.get("raw")), download=bool(q.get("dl")), printing=bool(q.get("print")))
        self.say(404, {"error": "no page"})

    def styles(self, route, q):
        """The style reference library (styles.py): /__canvas/styles - search and categories, /style - one card, /style-preview - its picture,
        /style-md - its file as text. The data answers only to the hub page's origin; the picture and the file are plain GETs (an <img> and a link).
        Only what the library index lists, inside the library folder."""
        extra = self.cors()
        files = route in ("/__canvas/style-preview", "/__canvas/style-md")   # an <img> and a link send no Origin: guard() already refused foreign sites
        if not extra and not files:
            return self.say(403, {"error": "origin"})
        lib = library()
        if route == "/__canvas/styles":
            if not lib:   # no folder or an empty one: the page hides the feature
                return self.say(200, {"ok": False}, extra)
            def num(k, d):
                try:
                    return int(float(q.get(k) or d))
                except (ValueError, OverflowError):
                    return d
            total, items = lib.search(q.get("q", ""), q.get("cat", ""), num("offset", 0), num("limit", 24))
            return self.say(200, {"ok": True, "count": len(lib.entries), "total": total, "items": items, "cats": lib.cats}, extra)
        if not lib:
            return self.say(404, {"error": "no library"}, extra)
        sid = q.get("id", "")
        if route == "/__canvas/style":
            card = styles.detail(lib, sid)
            return self.say(200 if card else 404, card or {"error": "no style"}, extra)
        if route == "/__canvas/style-preview":
            real = lib.preview(sid)
            if not real:
                return self.say(404, {"error": "no preview"}, extra)
            try:
                with open(real, "rb") as f:
                    data = f.read(styles.PREVIEW_MAX + 1)
            except OSError:
                data = b""
            if not data or len(data) > styles.PREVIEW_MAX:   # gone meanwhile, or not a preview but a huge picture
                return self.say(404, {"error": "no preview"}, extra)
            return self.send(200, styles.IMAGES[os.path.splitext(real)[1].lower()], data, {**extra, "Cache-Control": "private, max-age=86400"})
        if route == "/__canvas/style-md":
            real = lib.path(sid)
            if not real:
                return self.say(404, {"error": "no style"}, extra)
            try:
                with open(real, "rb") as f:
                    data = f.read(styles.MD_MAX)
            except OSError:
                return self.say(404, {"error": "no style"}, extra)
            return self.send(200, TYPES[".txt"], data, {**extra, "Content-Disposition": "inline"})
        return self.say(404, {"error": "no page"}, extra)

    def send(self, code, kind, body, extra=None):
        self.head(code, kind, len(body), extra)
        if self.command != "HEAD":
            self.wfile.write(body)

    def player(self, real):
        """?player=1 - a video and a gif on the canvas: a simple player over the whole frame instead of the clip at its natural size; a PDF - its pages; an SVG - a picture in an <img> (its scripts do not run)."""
        src = html.escape(quote(os.path.basename(real)) + "?v=1")
        if real.lower().endswith(".pdf"):   # pages: the browser's own viewer over the whole frame
            body = ('<!doctype html><meta charset="utf-8"><title>%s</title><body style="margin:0;height:100vh;background:#525659">'
                    '<embed src="%s" type="application/pdf" style="width:100%%;height:100%%;border:0"></body>' % (html.escape(os.path.basename(real)), src)).encode()
            self.head(200, TYPES[".html"], len(body))
            return self.wfile.write(body) if self.command != "HEAD" else None
        svg = real.lower().endswith(".svg")
        tag = "img" if svg or real.lower().endswith(".gif") else "video controls autoplay muted loop playsinline"
        body = ('<!doctype html><meta charset="utf-8"><title>%s</title><body style="margin:0;height:100vh;background:%s;display:flex">'
                '<%s src="%s" style="width:100%%;height:100%%;object-fit:contain"></body>' % (html.escape(os.path.basename(real)), "#f4f4f6" if svg else "#000", tag, src)).encode()
        self.head(200, TYPES[".html"], len(body))
        if self.command != "HEAD":
            self.wfile.write(body)

    def pdf(self, real, q):
        """?pdf=1&w=&h=: the design as a PDF file. The hub page asks from its own origin (CORS only for it)."""
        origin = self.headers.get("Origin")
        extra = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in page_origins() else {}
        def num(k, d):
            try:
                return int(float(q.get(k) or d))
            except ValueError:
                return d
        try:
            data = pdf(real, num("w", PDF_SIZE[0]), num("h", PDF_SIZE[1]))
        except PdfError as e:
            return self.say(500, {"error": str(e)}, extra)
        if data is None:   # no Chrome configured for printing: the page prints the frame itself
            return self.say(501, {"error": "no chrome"}, extra)
        name = os.path.splitext(os.path.basename(real))[0] + ".pdf"
        extra["Content-Disposition"] = "attachment; filename*=UTF-8''" + quote(name)
        self.head(200, "application/pdf", len(data), extra)
        if self.command != "HEAD":
            self.wfile.write(data)

    def file(self, real, raw=False, download=False, printing=False):
        """raw: the HTML as on disk, without agent.js (show fullscreen, download); download: also as an attachment;
        printing: like raw, plus the page size for printing to PDF."""
        kind = TYPES[os.path.splitext(real)[1].lower()]
        if real.lower().endswith(HTML):
            with open(real, "rb") as f:
                body = printable(f.read()) if printing else f.read() if raw else inject(f.read())
            extra = {"Content-Disposition": "attachment; filename*=UTF-8''" + quote(os.path.basename(real))} if download else None
            self.head(200, kind, len(body), extra)
            return self.wfile.write(body) if self.command != "HEAD" else None
        size = os.path.getsize(real)
        attach = {"Content-Disposition": "attachment; filename*=UTF-8''" + quote(os.path.basename(real))} if download else {}
        start, end = 0, size - 1
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        if m and size and (m.group(1) or m.group(2)):   # video: with seeking
            if m.group(1):
                start, end = int(m.group(1)), min(int(m.group(2) or size - 1), size - 1)
            else:
                start = max(0, size - int(m.group(2)))
            if start > end:
                self.head(416, kind, 0, {"Content-Range": f"bytes */{size}"})
                return
            self.head(206, kind, end - start + 1, {"Content-Range": f"bytes {start}-{end}/{size}", "Accept-Ranges": "bytes", **self.cors(), **attach})
        else:
            self.head(200, kind, size, {"Accept-Ranges": "bytes", **self.cors(), **attach})   # CORS: the page shoots a video frame for a card in the feed
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


def tg_shot(path):
    """The shot of a design for a Telegram post: only a file we may serve (the shot opens it from our own address); None - no shot."""
    real = os.path.realpath(path)
    if not real.lower().endswith(PAGES) or not allowed(real):   # said aloud: a post without a picture must have a reason in the log
        print(f"hub-design: telegram: no shot of {real}: not a design in the hub's folders", file=sys.stderr, flush=True)
        return None
    try:
        data = thumb(real, big=True)
        if data is None:
            print(f"hub-design: telegram: no shot of {real}: nothing shot it (no Chrome at testchrome.path in hub.json, or PDF rendering failed)", file=sys.stderr, flush=True)
        return data
    except PdfError as e:
        print(f"hub-design: telegram: no shot of {real}: {e}", file=sys.stderr, flush=True)
        return None


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
        print(f"hub-design: port {PORT} is busy ({e}); set HUB_DESIGN_PORT", file=sys.stderr, flush=True)
        time.sleep(60)   # do not hammer a busy port every second: hub-up will start it again
        return 1
    print(f"hub-design: http://localhost:{PORT}/", file=sys.stderr, flush=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    global REG
    if os.environ.get("HUB_STATE_DIR"):   # under a hub: the registry of designs (the journal is read in the background)
        REG = registry.Registry(state_dir())
        threading.Thread(target=registry.run, args=(REG,), daemon=True).start()
    if os.environ.get("HUB_STATE_DIR"):   # under a hub: designs to Telegram as posts (off unless telegram.design_posts)
        threading.Thread(target=tgpost.run, args=(state_dir(), tg_shot, config, lambda p: title_of(os.path.realpath(p))), daemon=True).start()
    try:
        t.join()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
