"""Hub Design: процесс плагина раздаёт HTML дизайна с диска со своего адреса (localhost, порт страницы хаба + 11)
и подкладывает в него agent.js — тот рисует пины и рамки и говорит со страницей хаба через postMessage.

Свой адрес, а не страница хаба: скрипты дизайна работают как в браузере (шрифты, видео, анимации), но не с правами
страницы хаба. Отдаёт только файлы веба внутри папок сессий и проектов хаба, без скрытых; встраивать себя — только
странице хаба; запрос с чужого сайта — отказ."""
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
    ".lottie": "application/zip",
}
HTML = (".html", ".htm")
ROOTS_TTL = 15
WATCH_FILES = 2000   # файлов в папке дизайна, чьё время правки смотрит /__canvas/stat
CHUNK = 256 * 1024
HAVE_MAX = 60   # путей в одном вопросе «есть ли файлы»
DRIVE = re.compile(r"^[A-Za-z]:$")
PDF_TIMEOUT = 45   # секунд на печать одного макета, потом Chrome гасим
PDF_SIZE = (1440, 900)   # окно макета, если страница не прислала своё
PDF_MAX = 20000          # пикселей: выше PDF-страницу не растягиваем
WRITE_MAX = 2 * 1024 * 1024   # тело запроса на запись правок
THUMB_SIZE = (1440, 900)   # окно, в котором макет снимается для карточки в ленте
THUMB_SCALE = 0.34         # снимок уменьшается Chrome'ом сразу: ~490 px в ширину
THUMB_TIMEOUT = 30
THUMB_KEEP = 300           # снимков в кэше: старые стираются
TITLE_READ = 64 * 1024     # откуда в файле ищем <title>


def state_dir():
    return os.environ.get("HUB_STATE_DIR") or os.path.expanduser("~/.hub-core")


def config():
    """hub.json этой машины; не прочитать — {}."""
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


def roots():
    """Папки, из которых можно отдавать: рабочие папки сессий хаба и папки проектов из hub.json. Не корень диска."""
    if time.time() - _roots["at"] < ROOTS_TTL:
        return _roots["list"]
    # папки, где сессии уже были, не забываем: журнал под нагрузкой читается не всегда — без этого файлы на 15 секунд становились «вне папок»
    found = _roots["seen"]
    try:
        from core import journal
        for s in journal.load_state(state_dir()).get("sessions", {}).values():
            if s.get("cwd"):
                found.add(s["cwd"])
    except Exception:   # хаба нет рядом (тесты, старая версия) или журнал не прочитался — то, что видели раньше, и проекты
        pass
    extra = {os.path.expanduser(p["path"]) for p in (config().get("projects") or {}).values() if isinstance(p, dict) and p.get("path")}
    out = []
    for r in found | extra:
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


def file_state(path):
    """ok — отдадим; missing — файла нет на диске; denied — есть, но вне папок сессий и проектов хаба или скрытый: показать нечем."""
    real = os.path.realpath(path)
    if allowed(real):
        return "ok"
    return "denied" if os.path.exists(real) else "missing"


def gone_page(real, state):
    """Вместо сырого {"error": "no file"} в рамке и на карточке — страница с названием файла и причиной."""
    why = "Файл не найден" if state == "missing" else "Файл вне папок проектов и сессий хаба, плагин его не покажет"
    body = ('<!doctype html><meta charset="utf-8"><title>%s</title><body style="margin:0;display:flex;align-items:center;justify-content:center;'
            'height:100vh;font:14px system-ui,sans-serif;color:#555;background:#f4f4f5;text-align:center"><div><p style="font-size:16px;color:#222">%s</p>'
            '<p style="max-width:560px;overflow-wrap:anywhere">%s</p></div>' % (why, why, html.escape(real))).encode()
    return body


def page_origins():
    return [f"http://localhost:{WEB_PORT}", f"http://127.0.0.1:{WEB_PORT}"]


def inject(body):
    """agent.js (с anchor.js перед ним) — последним в документе: его рамки и пины поверх дизайна."""
    tag = ('<script>window.__canvas={origins:%s}</script><script src="/__canvas/anchor.js"></script><script src="/__canvas/agent.js"></script>'
           % json.dumps(page_origins())).encode()
    low = body.lower()
    at = low.rfind(b"</body>")
    if at < 0:
        at = low.rfind(b"</html>")
    body = body + tag if at < 0 else body[:at] + tag + body[at:]
    return early(body)


# печатная версия макета (?print=1&w=&h=): страница PDF — окно макета; макет выше окна — одна высокая страница; если в нём
# слайды (.slide, [data-slide]) — страница по слайду и по странице на слайд. Подкладывается Chrome'у, которого запускает pdf()
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
    """Браузер для печати в PDF: HUB_TEST_CHROME или testchrome.path из hub.json (тот же, что у снимков и тестов хаба).
    Обычный Chrome владельца не берём. Нет такого — None, страница печатает рамку сама."""
    path = (os.environ.get("HUB_TEST_CHROME") or (config().get("testchrome") or {}).get("path") or "").strip()
    path = os.path.expanduser(path)
    return path if path and os.path.isfile(path) else None


def kill_tree(proc):
    """Chrome с его помощниками: группа процессов (на Windows — дерево) по pid запуска."""
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
    """PDF макета: свой процесс Chrome (headless, профиль во временной папке) печатает печатную версию с этого же сервера.
    None — Chrome не настроен; PdfError — не вышло. Процесс и папка убираются всегда."""
    chrome = chrome_path()
    if not chrome:
        return None
    size = size_of(real)
    fixed = bool(size and size[1])   # размер задан самим макетом (мета hub-frame, явные width и height): одна страница ровно такого размера
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
                raise PdfError("Chrome не успел напечатать за %d с" % PDF_TIMEOUT)
            try:
                with open(out, "rb") as f:
                    data = f.read()
            except OSError:
                raise PdfError("Chrome не оставил PDF (код %s)" % proc.returncode)
            if not data.startswith(b"%PDF"):
                raise PdfError("Chrome вернул не PDF")
            return data
        finally:
            if proc is not None:
                kill_tree(proc)
            shutil.rmtree(tmp, ignore_errors=True)


FRAME_MIN, FRAME_MAX = 100, 8000    # размер рамки макета, заданного самим макетом, пикселей
SIZE_READ = 256 * 1024              # откуда в файле ищем объявленный размер
_META_FRAME = re.compile(r"<meta\b[^>]*\bname\s*=\s*[\"']hub-frame[\"'][^>]*>", re.I)
_PX_DECL = re.compile(r"(?<![\w-])(width|height)\s*:\s*(\d+(?:\.\d+)?)px\s*(?:!important\s*)?(?=;|$)", re.I)


def _size_ok(w, h):
    return FRAME_MIN <= w <= FRAME_MAX and FRAME_MIN <= h <= FRAME_MAX


def size_of(real):
    """Размер макета, как он задан в самом файле: <meta name="hub-frame" content="1080x1350"> (первым), иначе явные width/height в px
    у html и body (стили документа и style="" на тегах). Не задан — None; задана одна ширина — (w, None)."""
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
        css = re.sub(r"@[\w-]+[^{};]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", "", css)   # @media, @supports, @font-face: не безусловный размер
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
    """<title> макета для карточки в ленте; нет — пустая строка."""
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


def thumb(real):
    """Снимок макета для карточки: свой headless Chrome (тот же, что печатает PDF) открывает файл как на диске и снимает окно 1440×900,
    уменьшенное при съёмке. Кэш — по пути и времени правки папки макета. None — Chrome не настроен; PdfError — не вышло."""
    chrome = chrome_path()
    if not chrome:
        return None
    out = thumb_path(real, newest(real))
    try:
        with open(out, "rb") as f:
            return f.read()
    except OSError:
        pass
    url = "http://127.0.0.1:%d/f/%s?raw=1" % (PORT, "/".join(quote(x) for x in real.replace("\\", "/").lstrip("/").split("/")))
    size = size_of(real)
    win = THUMB_SIZE if not size else (size[0], size[1] or THUMB_SIZE[1])   # макет с заданным размером снимаем целиком
    with _thumb_lock:
        tmp = tempfile.mkdtemp(prefix="hub-design-thumb-")
        shot = os.path.join(tmp, "out.png")
        cmd = [chrome, "--headless", "--disable-gpu", "--hide-scrollbars", "--user-data-dir=" + os.path.join(tmp, "profile"),
               "--window-size=%d,%d" % win, "--force-device-scale-factor=%s" % THUMB_SCALE, "--virtual-time-budget=3000",
               "--screenshot=" + shot, url]
        kw = {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)} if os.name == "nt" else {"start_new_session": True}
        proc = None
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)
            try:
                proc.wait(THUMB_TIMEOUT)
            except subprocess.TimeoutExpired:
                raise PdfError("Chrome не успел снять макет за %d с" % THUMB_TIMEOUT)
            try:
                with open(shot, "rb") as f:
                    data = f.read()
            except OSError:
                raise PdfError("Chrome не оставил снимок (код %s)" % proc.returncode)
            if not data.startswith(b"\x89PNG"):
                raise PdfError("Chrome вернул не картинку")
        finally:
            if proc is not None:
                kill_tree(proc)
            shutil.rmtree(tmp, ignore_errors=True)
    try:
        os.makedirs(thumb_dir(), exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        old = sorted((os.path.join(thumb_dir(), n) for n in os.listdir(thumb_dir())), key=os.path.getmtime)
        for p in old[:-THUMB_KEEP]:
            os.remove(p)
    except OSError:
        pass   # кэш не записался — снимок всё равно отдадим
    return data


# правки руками — точечно в файл. Без состояния в процессе: исходник для пересчёта — копия <имя>.r<N>.html рядом, её имя и время
# файла после прошлой записи приходят со страницы; файл с другим временем правил кто-то ещё — отказ «changed», страница начинает заново
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
        raise WriteError(400, "файл не в UTF-8")


def free_copy(real, start):
    stem, ext = os.path.splitext(real)
    n = max(0, int(start))
    while os.path.exists("%s.r%d%s" % (stem, n, ext)):
        n += 1
    return "%s.r%d%s" % (stem, n, ext)


def write_file(real, data):
    """Подмена файла целиком за один шаг: вотчеры и браузер не видят полузаписанного."""
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
    """Записать правки руками в real. body: changes, ops, busy, round, copy (имя копии, если уже делали), fmtime (время файла после
    нашей записи). Отказ — WriteError: 409 busy (автор макета в ходе), 409 changed (файл правили без нас)."""
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
        if not touched:   # писать нечего: файл — как был до нас; своя копия больше не нужна
            if copy and cur != base:
                write_file(real, base)
            if copy:
                try:
                    os.remove(copy_path)
                except OSError:
                    pass
            copy_path = ""
        else:
            if not copy_path:   # первая запись: копия исходника рядом, и только потом правка
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
    """Ловец ошибок (early.js) — самым первым скриптом: после <head> (или <html>, doctype), без них — в начало."""
    for rx in _open_tags:
        m = rx.search(body)
        if m:
            return body[:m.end()] + EARLY_TAG + body[m.end():]
    return EARLY_TAG + body


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "hub-design"

    def log_message(self, *a):   # тишина: каждый запрос картинки — не для журнала хаба
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
        """Только localhost по своему порту (не подменённое имя) и не запрос с чужого сайта."""
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
        """/__canvas/write — правки руками в файл. Только со страницы хаба (Origin) и только файл, который процесс и так показывает."""
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
            return self.say(500, {"error": "не записать: " + (e.strerror or str(e))}, extra)

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
            # есть ли файлы макетов: страница хаба спрашивает по своему origin (CORS только для неё), по одному слову на путь
            paths = parse_qs(url.query).get("path", [])[:HAVE_MAX]
            origin = self.headers.get("Origin")
            extra = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if origin in page_origins() else None
            body = json.dumps({p: file_state(p) for p in paths}, ensure_ascii=False).encode()
            self.head(200, "application/json; charset=utf-8", len(body), extra)
            return self.wfile.write(body) if self.command != "HEAD" else None
        if url.path == "/__canvas/times":
            # когда правили файлы макетов (для карточек стартового экрана): только те, что можно показать
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
            # размер макета из самого файла (мета hub-frame или явные width/height у html/body): {путь: [w, h|null]}, нет — не включён
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
            # карточка макета или видео в ленте чата: состояние файла, название, время правки. Только со страницы хаба (CORS)
            real = os.path.realpath(os.path.expanduser(q.get("path", "")))
            out = {"state": file_state(real), "title": "", "mtime": 0}
            if out["state"] == "ok":
                out["mtime"] = newest(real) if real.lower().endswith(HTML) else os.path.getmtime(real)
                out["title"] = title_of(real) if real.lower().endswith(HTML) else ""
            return self.say(200, out, self.cors())
        if url.path == "/__canvas/thumb":
            real = os.path.realpath(os.path.expanduser(q.get("path", "")))
            if not real.lower().endswith(HTML) or not allowed(real):
                return self.say(404, {"error": "no file"}, self.cors())
            try:
                data = thumb(real)
            except PdfError as e:
                return self.say(500, {"error": str(e)}, self.cors())
            if data is None:   # Chrome не настроен — на карточке значок
                return self.say(501, {"error": "no chrome"}, self.cors())
            self.head(200, "image/png", len(data), {**self.cors(), "Cache-Control": "private, max-age=3600"})
            return self.wfile.write(data) if self.command != "HEAD" else None
        if url.path == "/__canvas/stat":
            real = os.path.realpath(q.get("path", ""))
            if not real.lower().endswith(HTML) or not allowed(real):
                return self.say(404, {"error": "no file"})
            return self.say(200, {"mtime": newest(real)})
        if url.path.startswith("/f/"):
            real = from_url(url.path)
            if not allowed(real):
                if real.lower().endswith(HTML):   # документ в рамке: человеческая страница, не JSON
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

    def player(self, real):
        """?player=1 — видео и гифка на холсте: простой проигрыватель на весь фрейм вместо ролика его натурального размера."""
        src = html.escape(quote(os.path.basename(real)) + "?v=1")
        tag = "img" if real.lower().endswith(".gif") else "video controls autoplay muted loop playsinline"
        body = ('<!doctype html><meta charset="utf-8"><title>%s</title><body style="margin:0;height:100vh;background:#000;display:flex">'
                '<%s src="%s" style="width:100%%;height:100%%;object-fit:contain"></body>' % (html.escape(os.path.basename(real)), tag, src)).encode()
        self.head(200, TYPES[".html"], len(body))
        if self.command != "HEAD":
            self.wfile.write(body)

    def pdf(self, real, q):
        """?pdf=1&w=&h= — макет файлом PDF. Страница хаба просит по своему origin (CORS только для неё)."""
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
        if data is None:   # Chrome для печати не настроен — страница печатает рамку сама
            return self.say(501, {"error": "no chrome"}, extra)
        name = os.path.splitext(os.path.basename(real))[0] + ".pdf"
        extra["Content-Disposition"] = "attachment; filename*=UTF-8''" + quote(name)
        self.head(200, "application/pdf", len(data), extra)
        if self.command != "HEAD":
            self.wfile.write(data)

    def file(self, real, raw=False, download=False, printing=False):
        """raw — HTML как на диске, без agent.js (показать во весь экран, скачать); download — ещё и как вложение;
        printing — как raw, плюс размер страницы для печати в PDF."""
        kind = TYPES[os.path.splitext(real)[1].lower()]
        if real.lower().endswith(HTML):
            with open(real, "rb") as f:
                body = printable(f.read()) if printing else f.read() if raw else inject(f.read())
            extra = {"Content-Disposition": "attachment; filename*=UTF-8''" + quote(os.path.basename(real))} if download else None
            self.head(200, kind, len(body), extra)
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
            self.head(206, kind, end - start + 1, {"Content-Range": f"bytes {start}-{end}/{size}", "Accept-Ranges": "bytes", **self.cors()})
        else:
            self.head(200, kind, size, {"Accept-Ranges": "bytes", **self.cors()})   # CORS: страница снимает кадр видео для карточки в ленте
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
        print(f"hub-design: порт {PORT} занят ({e}); задайте HUB_DESIGN_PORT", file=sys.stderr, flush=True)
        time.sleep(60)   # не биться о занятый порт каждую секунду: hub-up поднимет снова
        return 1
    print(f"hub-design: http://localhost:{PORT}/", file=sys.stderr, flush=True)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        t.join()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
