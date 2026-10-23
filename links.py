"""Hub Design: the memory of the style links and what hangs on them.

The links the owner pasted in the settings are kept here (a small file in the hub state folder), not in the browser: they survive a restart and are the same
on every page. Every style of the library knows the links it came from (`source_urls` in its index entry). A link can be deleted with its styles: the
files, the previews and covers, the index entries go, except the styles that also came by another link that stays.

The library folder is the owner's: nothing is deleted without an explicit call of delete(), which the page makes only after the owner confirmed the number.

links.json: {"links": [{"url", "default"}], "seeded": bool, "auto": bool, "declined": [url], "first": str, "ask_posted": bool}
  seeded - the links by default are put once (a removed one does not come back); auto - download them (the covers too) while it is on;
  declined - the links whose styles without a preview the owner does not want to be asked about again;
  first - the question of the first start (what is preinstalled, how long and how big, download or not): "pending" (asked, nothing is downloaded until
  the answer), "yes" | "no" | "settings" (the answer), "config" (hub.json decided: no question), "legacy" (the plugin had downloaded before the question
  existed: no question); "" - not asked yet; ask_posted - the question went to Telegram."""
import json
import os
import re
import shutil
import threading

import fetcher
import sources
import styles

NAME = "hub-design-links.json"
FIRST = ("", "pending", "yes", "no", "settings", "config", "legacy")
PREVIEW_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".avif")
BAK = "index.json.bak-links"

_lock = threading.Lock()


canon = fetcher.canon
_urls = fetcher._urls


class Links:
    """The memory of the links, one file; every change is written at once (atomically)."""

    def __init__(self, path):
        self.path = path
        self.data = self._read()

    def _read(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                d = json.load(f)
        except (OSError, ValueError):
            d = None
        d = d if isinstance(d, dict) else None
        fresh = d is None
        d = d or {}
        links = [x for x in d.get("links", []) if isinstance(x, dict) and isinstance(x.get("url"), str)] if isinstance(d.get("links"), list) else []
        seeded = bool(d.get("seeded")) and not fresh
        first = d.get("first") if d.get("first") in FIRST else ""
        if seeded and not first:   # written before the question existed: it had downloaded already - nothing to ask
            first = "legacy"
        return {"links": links, "seeded": seeded, "auto": d.get("auto") is not False, "first": first, "ask_posted": bool(d.get("ask_posted")),
                "declined": [x for x in d.get("declined", []) if isinstance(x, str)] if isinstance(d.get("declined"), list) else []}

    def _write(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.path)

    def exists(self):
        return os.path.isfile(self.path)

    def urls(self):
        with _lock:
            return [x["url"] for x in self.data["links"]]

    def items(self):
        with _lock:
            return [{"url": x["url"], "default": bool(x.get("default"))} for x in self.data["links"]]

    def has(self, url):
        return url in self.urls()

    def add(self, url, default=False):
        """-> True if the link is new."""
        with _lock:
            if any(x["url"] == url for x in self.data["links"]):
                return False
            self.data["links"].append({"url": url, **({"default": True} if default else {})})
            self._write()
            return True

    def remove(self, url):
        with _lock:
            self.data["links"] = [x for x in self.data["links"] if x["url"] != url]
            self.data["declined"] = [x for x in self.data["declined"] if x != url]
            self._write()

    def seed(self, defaults):
        """The links by default, once. -> the links that were put."""
        with _lock:
            if self.data["seeded"]:
                return []
            put = []
            for url in defaults:
                if not any(x["url"] == url for x in self.data["links"]):
                    self.data["links"].append({"url": url, "default": True})
                    put.append(url)
            self.data["seeded"] = True
            self._write()
            return put

    @property
    def seeded(self):
        return self.data["seeded"]

    @property
    def auto(self):
        return self.data["auto"]

    @property
    def first(self):
        return self.data["first"]

    def set_first(self, value):
        with _lock:
            self.data["first"] = value if value in FIRST else ""
            if value in ("", "pending"):
                self.data["ask_posted"] = False
            self._write()

    @property
    def ask_posted(self):
        return self.data["ask_posted"]

    def set_ask_posted(self, on=True):
        with _lock:
            self.data["ask_posted"] = bool(on)
            self._write()

    def set_auto(self, on):
        with _lock:
            self.data["auto"] = bool(on)
            self._write()

    def declined(self):
        with _lock:
            return list(self.data["declined"])

    def decline(self, urls):
        with _lock:
            for u in urls:
                if u not in self.data["declined"]:
                    self.data["declined"].append(u)
            self._write()


# --- the library side: the entries that hang on a link ---

def counts(root):
    """{link: how many styles came by it} - from the index entries."""
    try:
        data, kind = fetcher.read_index(root)
    except fetcher.Stop:
        return {}
    out = {}
    for _id, e in fetcher.entries(data, kind):
        for u in _urls(e):
            out[u] = out.get(u, 0) + 1
    return out


def bind_existing(root, saved, source_list=None):
    """The styles that are in the library from before the links were remembered get their link, when it is remembered: a Refero style (no "set") - the
    link of that site, a style of a set - the link of its repository. Nothing is deleted or downloaded; the index is copied once to index.json.bak-links
    before the first change. -> how many entries got a link."""
    try:
        with fetcher.INDEX_LOCK:
            data, kind = fetcher.read_index(root)
            todo = []
            for _id, e in fetcher.entries(data, kind):
                if _urls(e):
                    continue
                if e.get("set") and e.get("source"):
                    link = canon("https://github.com/" + str(e["source"]), source_list)
                elif re.match(r"https://styles\.refero\.design/", str(e.get("url") or "")):
                    link = canon("https://styles.refero.design/", source_list)
                else:
                    continue
                if link in saved:
                    todo.append((e, link))
            if not todo:
                return 0
            bak = os.path.join(root, BAK)
            if not os.path.exists(bak):
                shutil.copyfile(os.path.join(root, styles.INDEX), bak)
            for e, link in todo:
                e["source_urls"] = [link]
            fetcher.write_index(root, data)
            return len(todo)
    except fetcher.Stop:
        return 0


def _holders(data, kind, link):
    """[entry] that came by link."""
    return [e for e in (data.values() if kind == "dict" else data) if isinstance(e, dict) and link in _urls(e)]


def preview_delete(root, link):
    """{"n": styles that go with the link, "kept": styles that stay (another link holds them)} - nothing is touched."""
    try:
        data, kind = fetcher.read_index(root)
    except fetcher.Stop:
        return {"n": 0, "kept": 0}
    held = _holders(data, kind, link)
    gone = [e for e in held if set(_urls(e)) <= {link}]
    return {"n": len(gone), "kept": len(held) - len(gone)}


def _drop_file(root, rel):
    real = styles._inside(root, str(rel or "").replace("\\", "/")) if rel else None
    if real:
        try:
            os.remove(real)
        except OSError:
            pass


def delete(root, link, source_list=None):
    """The link's styles leave the library: the style file, the preview and the cover, the index entry; a style held by another link only loses this one.
    -> {"n": deleted, "kept": styles that stayed}. The source may clean up its own traces (a clone of a repository)."""
    with fetcher.INDEX_LOCK:
        try:
            data, kind = fetcher.read_index(root)
        except fetcher.Stop:
            return {"n": 0, "kept": 0}
        held = _holders(data, kind, link)
        gone = [e for e in held if set(_urls(e)) <= {link}]
        for e in held:
            if e not in gone:
                e["source_urls"] = [u for u in _urls(e) if u != link]
        for e in gone:
            for field in ("file", "preview", "cover_video"):
                _drop_file(root, e.get(field))
        drop = {id(e) for e in gone}
        if kind == "dict":
            data = {k: v for k, v in data.items() if id(v) not in drop}
        else:
            data[:] = [v for v in data if id(v) not in drop]
        if held:
            fetcher.write_index(root, data)
    s = sources.for_url(link, source_list)
    if s is not None and hasattr(s, "remove_traces"):
        s.remove_traces(root, link)
    return {"n": len(gone), "kept": len(held) - len(gone)}


# --- previews: the styles that have none, and the ones a designer brought ---

def preview_name(sid):
    """The file name (without the extension) of a preview of a style under previews/: the id with what a file name cannot hold replaced."""
    return re.sub(r"[^A-Za-z0-9_.-]+", "--", str(sid))[:120]


def adopt_previews(root):
    """A style without a preview whose picture lies in previews/<preview_name(id)>.<ext> (a designer put it there) gets it in its entry. -> how many."""
    pdir = os.path.join(root, "previews")
    try:
        names = {n.lower(): n for n in os.listdir(pdir)}
    except OSError:
        return 0
    try:
        with fetcher.INDEX_LOCK:
            data, kind = fetcher.read_index(root)
            n = 0
            for sid, e in fetcher.entries(data, kind):
                if e.get("preview") or not isinstance(e.get("file"), str):
                    continue
                base = preview_name(sid).lower()
                for ext in PREVIEW_EXTS:
                    hit = names.get(base + ext)
                    if hit and os.path.getsize(os.path.join(pdir, hit)) > 0:
                        e["preview"] = f"previews/{hit}"
                        n += 1
                        break
            if n:
                fetcher.write_index(root, data)
            return n
    except fetcher.Stop:
        return 0


def without_preview(root, skip=()):
    """[(id, entry, [links])] of the styles with no preview that came by a link not in skip (the ones that were declined). A style that no link holds is not
    asked about: it is not from a download of ours."""
    try:
        data, kind = fetcher.read_index(root)
    except fetcher.Stop:
        return []
    out = []
    for sid, e in fetcher.entries(data, kind):
        if e.get("preview") or not isinstance(e.get("file"), str):
            continue
        ls = [u for u in _urls(e) if u not in skip]
        if ls:
            out.append((sid, e, ls))
    return out
