"""Hub Design: the style fetcher - fills the style library (styles.py) from the links pasted in the settings.

The owner pastes links to a style site, presses "Download"; the styles go to the library folder in the format styles.py reads: <slug>__<id>.md in
the folder, previews/<id>.<ext>, an entry in index.json. The Style window sees a new entry at once (it follows the index.json stamp).
Nothing comes with the plugin: the styles are fetched on this machine, from the site the owner names, and the owner answers for the terms of that site.

One run is one thread: the links are planned (what styles they stand for - sources/<site>.py), the styles already in the library are skipped, the rest
are fetched one at a time with a polite pause. A refusal of the site (403, 429, a captcha) stops the run with a word about it - the next press
continues from the same place, because what is in the library is skipped. A dead page or a broken one is counted and skipped; three in a row
stop the run (the network is gone, or the site changed).

status() is what the settings page shows: {state, total, done, added, skipped, failed, name, code, http, urls, hosts}.
  state: idle | running | stopping | done | stopped (by the owner) | blocked (code: forbidden|rate|captcha) | error (code)."""
import json
import os
import random
import re
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

import sources
import styles

UA = "Mozilla/5.0 (compatible; hub-design-style-fetcher)"
GAP = (1.0, 2.5)          # seconds between two styles
IMAGE_GAP = 0.3           # between the page of a style and its picture
TIMEOUT = 30
RETRIES = 2               # a page that did not come (the site is busy, the network blinked) is asked again this many times
RETRY_WAIT = (4.0, 10.0)
FAILS_IN_A_ROW = 3        # then the run stops: the network is gone or the site changed
LINKS_MAX = 20
LINK_MAX = 500
PAGE_MAX = 6 * 1024 * 1024
MAP_MAX = 32 * 1024 * 1024
CHALLENGE = ("captcha", "cf-challenge", "challenge-platform", "just a moment", "verify you are human")
LOCAL = ("localhost", "127.0.0.1", "::1")


class Stop(Exception):
    """The run ends here: code is a word the page can say (forbidden, rate, captcha, network, index_broken, disk ...)."""
    def __init__(self, code, state="error", http=0, **args):
        super().__init__(code)
        self.code, self.state, self.http, self.args_ = code, state, http, args


class Gone(Exception):
    """This one page is not there / not usable - the run goes on to the next style."""


class _Guard(urllib.request.HTTPRedirectHandler):
    """A redirect leads only where the source allows (the site and its picture host): not to a foreign address."""
    def __init__(self, allowed):
        self.allowed = allowed

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not self.allowed(newurl):
            raise Gone("redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _opener(allowed, proxy):
    handlers = [_Guard(allowed)]
    if not proxy:
        handlers.append(urllib.request.ProxyHandler({}))
    return urllib.request.build_opener(*handlers)


def fetch(url, allowed, limit, binary=False):
    """The body of url -> (bytes, content type). 404/410 - Gone; 401/403/429 - Stop (the site refuses us); other 4xx - Gone; 5xx and the network - OSError.
    The corporate proxy that breaks Python's TLS is bypassed: if the first try fails on the network, the second goes straight."""
    if not allowed(url):
        raise Gone("address")
    direct = (urlparse(url).hostname or "") in LOCAL
    last = None
    for proxy in ((False,) if direct else (True, False)):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*" if binary else "text/html,application/xml,text/xml;q=0.9,*/*;q=0.5"})
        try:
            with _opener(allowed, proxy).open(req, timeout=TIMEOUT) as r:
                data = r.read(limit + 1)
                if len(data) > limit:
                    raise Gone("size")
                return data, r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            e.close()
            if e.code in (404, 410):
                raise Gone(str(e.code))
            if e.code in (401, 403):
                raise Stop("forbidden", "blocked", e.code)
            if e.code == 429:
                raise Stop("rate", "blocked", e.code)
            if 400 <= e.code < 500:
                raise Gone(str(e.code))
            raise OSError(f"HTTP {e.code}")   # 5xx: the site is busy - the caller asks again
        except (urllib.error.URLError, OSError, ValueError) as e:   # the network; a bad link
            if isinstance(e, ValueError):
                raise Gone("address")
            last = e
    raise OSError(str(last))


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return (s or "style")[:60]


def _stamp():
    return time.strftime("%Y-%m-%d")


def read_index(root):
    """index.json of the folder -> (data, kind): a dict {id: entry} or a list of entries; no file - ({}, "dict"). A broken file is not ours to overwrite."""
    path = os.path.join(root, styles.INDEX)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return {}, "dict"
    except (OSError, ValueError):
        raise Stop("index_broken")
    if isinstance(data, dict):
        return data, "dict"
    if isinstance(data, list):
        return data, "list"
    raise Stop("index_broken")


def known(data, kind):
    """{id: file} of the styles already in the index."""
    out = {}
    for key, e in (data.items() if kind == "dict" else enumerate(data)):
        if isinstance(e, dict):
            sid = str(e.get("id") or e.get("uuid") or (key if kind == "dict" else "")).strip()
            if sid and isinstance(e.get("file"), str):
                out[sid] = e["file"]
    return out


def write_index(root, data):
    path = os.path.join(root, styles.INDEX)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


class Fetcher:
    """target() -> the library folder (styles.target); sources - the list of sources (sources.SOURCES); gap - the pause between styles (a pair of seconds);
    sleep - for tests (called with the seconds)."""

    def __init__(self, target, source_list=None, gap=GAP, sleep=None, get=fetch):
        self.target = target
        self.sources = sources.SOURCES if source_list is None else source_list
        self.gap = gap
        self._sleep = sleep
        self._get = get
        self.lock = threading.Lock()
        self.halt = threading.Event()
        self.thread = None
        self.st = {"state": "idle", "total": 0, "done": 0, "added": 0, "skipped": 0, "failed": 0, "name": "", "code": "", "http": 0, "urls": [], "args": {}}

    def hosts(self):
        return sources.names(self.sources)

    def status(self):
        with self.lock:
            return {**self.st, "urls": list(self.st["urls"]), "hosts": self.hosts()}

    def _set(self, **kw):
        with self.lock:
            self.st.update(kw)

    def _count(self, key):
        with self.lock:
            self.st[key] += 1
            self.st["done"] += 1

    def pause(self, seconds=None):
        t = random.uniform(*self.gap) if seconds is None else seconds
        if self._sleep:
            self._sleep(t)
        elif t > 0:
            self.halt.wait(t)

    def start(self, urls):
        """-> (ok, code, link): a run begins. Not ok: busy (a run is on), no_links, too_many, bad_link / no_source (the link is returned: the first one that is
        not a link, or that no source knows)."""
        links = []
        for u in urls if isinstance(urls, list) else []:
            u = u.strip() if isinstance(u, str) else ""
            if u and u not in links:
                links.append(u)
        if not links:
            return False, "no_links", ""
        if len(links) > LINKS_MAX:
            return False, "too_many", ""
        chosen = []
        for u in links:
            if len(u) > LINK_MAX or not re.match(r"https?://[^\s]+$", u):
                return False, "bad_link", u[:LINK_MAX]
            s = sources.for_url(u, self.sources)
            if not s:
                return False, "no_source", u
            chosen.append((u, s))
        with self.lock:
            if self.thread and self.thread.is_alive():
                return False, "busy", ""
            self.halt.clear()
            self.st.update({"state": "running", "total": 0, "done": 0, "added": 0, "skipped": 0, "failed": 0, "name": "", "code": "", "http": 0,
                            "urls": links, "args": {}})
            self.thread = threading.Thread(target=self._run, args=(chosen,), daemon=True)
            self.thread.start()
        return True, "", ""

    def stop(self):
        with self.lock:
            if self.st["state"] == "running":
                self.st["state"] = "stopping"
        self.halt.set()

    def join(self, timeout=30):
        t = self.thread
        if t:
            t.join(timeout)

    # --- the run ---

    def _page(self, source, url, limit=PAGE_MAX):
        """The text of a page; None - it is gone. A page that did not come is asked again; still not - OSError."""
        for attempt in range(RETRIES + 1):
            if self.halt.is_set():
                raise Stop("stopped", "stopped")
            try:
                data, _ = self._get(url, source.allowed, limit)
                return data.decode("utf-8", "replace")
            except Gone:
                return None
            except OSError:
                if attempt == RETRIES:
                    raise
                self.pause(random.uniform(*RETRY_WAIT))

    def _run(self, chosen):
        try:
            root = self.target()
            refs = self._plan(chosen)
            self._set(total=len(refs))
            os.makedirs(os.path.join(root, "previews"), exist_ok=True)
            row = 0   # failures in a row
            for source, ref in refs:
                if self.halt.is_set():
                    raise Stop("stopped", "stopped")
                data, kind = read_index(root)
                if ref["id"] in known(data, kind) and os.path.isfile(os.path.join(root, known(data, kind)[ref["id"]])):
                    self._count("skipped")
                    continue
                self.pause()
                try:
                    self._one(root, source, ref)
                    row = 0
                except (Gone, OSError, sources.SourceError) as e:
                    self._count("failed")
                    row += 1
                    if row >= FAILS_IN_A_ROW:
                        raise Stop("network" if isinstance(e, OSError) else "site_changed")
            self._set(state="stopped" if self.halt.is_set() else "done")
        except Stop as e:
            self._set(state=e.state, code=e.code if e.state != "stopped" else "", http=e.http, args=e.args_)
        except OSError as e:
            self._set(state="error", code="disk", args={"text": (e.strerror or str(e))[:200]})
        except sources.SourceError as e:
            self._set(state="error", code=e.code, args=e.args_)
        except Exception as e:   # a bug must not hang the page on "running"
            self._set(state="error", code="internal", args={"text": f"{type(e).__name__}: {e}"[:200]})

    def _plan(self, chosen):
        """[(source, ref)] of all the links, a style once; the sitemap of a big site is one request."""
        refs, seen = [], set()
        for url, source in chosen:
            if self.halt.is_set():
                raise Stop("stopped", "stopped")

            def get(u, source=source):
                return self._page(source, u, MAP_MAX)
            for ref in source.plan(url, get):
                if ref["id"] not in seen:
                    seen.add(ref["id"])
                    refs.append((source, ref))
        return refs

    def _one(self, root, source, ref):
        page = self._page(source, ref["url"])
        if page is None:
            raise Gone("page")
        try:
            style = source.parse(page, ref)
        except sources.SourceError as e:
            if e.code == "bad_page" and any(w in page.lower() for w in CHALLENGE):
                raise Stop("captcha", "blocked")
            raise
        sid = style["id"]
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", sid):
            raise Gone("id")
        fname = f"{slug(style['name'])}__{sid}.md"
        preview = ""
        if style["image_url"]:
            self.pause(IMAGE_GAP)
            try:
                data, ctype = self._get(style["image_url"], source.allowed, styles.PREVIEW_MAX)
                ext = os.path.splitext(urlparse(style["image_url"]).path)[1].lower()
                if ext not in styles.IMAGES:
                    ext = {"image/png": ".png", "image/webp": ".webp", "image/avif": ".avif"}.get(ctype.split(";")[0].strip().lower(), ".jpg")
                if data:
                    with open(os.path.join(root, "previews", sid + ext), "wb") as f:
                        f.write(data)
                    preview = f"previews/{sid}{ext}"
            except (Gone, OSError):
                pass   # a style without a picture is still a style; only a refusal of the site (Stop) is not caught here
        with open(os.path.join(root, fname), "w", encoding="utf-8", newline="\n") as f:
            f.write(style["md"])
        data, kind = read_index(root)   # read again: another process may have written there while the page came
        entry = {"uuid": sid, "name": style["name"], "url": ref["url"], "file": fname, "category": style["category"], "tags": style["tags"],
                 "collections": [], "preview": preview, "preview_url": style["image_url"], "site": style["site"], "description": style["description"],
                 "lastmod": style["lastmod"] or _stamp(), "bytes": len(style["md"].encode("utf-8"))}
        if kind == "dict":
            data[sid] = entry
        else:
            data[:] = [e for e in data if not (isinstance(e, dict) and str(e.get("id") or e.get("uuid") or "") == sid)] + [{**entry, "id": sid}]
        write_index(root, data)
        self._set(name=style["name"])
        self._count("added")
