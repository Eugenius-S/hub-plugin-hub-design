"""Hub Design: the style reference library - a folder of DESIGN.md-like files plus index.json, shown in the style picker.

The folder is set in hub.json (extensions.<account>:hub-design.styles_dir, or any extension key ending in "hub-design"),
the environment variable HUB_DESIGN_STYLES overrides it for tests; by default it is <hub state>/style-library. No such
folder - the feature is simply not there. Nothing outside the folder is ever read or served: files are found only through
an index entry, and every path is checked to stay inside the folder.

index.json: a dict {id: entry} or a list of entries. Entry fields: id (or uuid; for a dict - the key), name, file (a .md file
in the folder), category, tags [..], preview (an image file in the folder, may be in a sub-folder), site, description.
Everything but name and file is optional.

The default style (optional): extensions.<account>:hub-design.default_style is a folder with a DESIGN.md (and a preview.png beside it). It is a
library of one style that does not depend on the main one: the style window shows it first, marked "default", and a message to the designer
with no style chosen carries its DESIGN.md. Not set, or no DESIGN.md there - nothing of this exists.

tags.json (next to index.json, optional): {id: {theme: "dark", style: [..], mood: [..], industry: [..], medium: [..], density: [..]}} - the labels of every style, written by an
auto-tagger from the label dictionary style-vocab.json. With it the search understands "dark fintech" and "like <style>" (stylesearch.py), the panel
gets filter chips and a style shows its labels. Without it the search is by name, category and tags, as before."""
import json
import os
import threading
import re

import stylesearch

DEFAULT_DIR = "style-library"
DEFAULT_ID = "__default"   # the id of the default style in /style, /style-preview and /style-md
DEFAULT_FILE = "DESIGN.md"
INDEX = "index.json"
TAGS = "tags.json"
LABELS_SHOWN = 3         # labels on a card of the list
LABELS_PER_AXIS = 8
FACETS_TOP = {"medium": 8, "theme": 3, "style": 10, "mood": 8, "industry": 8, "density": 3}   # chips of the panel: how many of the most frequent labels of each axis
# The kinds of the picker (what a style is made for): the segments over the filters. Refero (no "set" in index.json) is web; a set of
# import_sets.py has its kind by the category of its entries. A category not listed here is "other"; a kind with no entries is not shown.
KINDS = ("web", "apps", "slides", "email", "banner", "systems", "other")
KIND_OF_CATEGORY = {"iOS-приложение": "apps", "Мобильное приложение": "apps", "Слайды": "slides", "Раскладка слайда": "slides", "Email": "email",
                    "Баннер": "banner", "Дизайн-система": "systems", "Направление стиля": "systems"}
PAGE_MAX = 60            # entries in one answer, however many the page asks for
TAGS_SHOWN = 6
MD_MAX = 1024 * 1024     # a style file is read up to this size
PREVIEW_MAX = 8 * 1024 * 1024   # a preview picture is served up to this size
INDEX_MAX = 32 * 1024 * 1024
COVER_MAX = 6 * 1024 * 1024     # a moving cover (a short mp4) is fetched and served up to this size
COVERS = {".mp4": "video/mp4", ".webm": "video/webm"}
IMAGES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif"}
PALETTE_MAX = 24
FONTS_MAX = 6
_HEX = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
_THEME = re.compile(r"^\*\*Theme:\*\*\s*(\w+)", re.M)

_cache = {}   # index path -> (signature of index.json and tags.json, library)


def _path(config, state_dir):
    path = (os.environ.get("HUB_DESIGN_STYLES") or "").strip()
    if not path:
        for key, val in ((config or {}).get("extensions") or {}).items():
            if isinstance(val, dict) and str(key).rsplit(":", 1)[-1] == "hub-design" and str(val.get("styles_dir") or "").strip():
                path = str(val["styles_dir"]).strip()
                break
    return os.path.realpath(os.path.expanduser(path) if path else os.path.join(state_dir, DEFAULT_DIR))


def folder(config, state_dir):
    """The library folder: the setting of the plugin in hub.json, otherwise <state>/style-library; None if there is no such folder."""
    real = _path(config, state_dir)
    return real if os.path.isdir(real) else None


def target(config, state_dir):
    """The same folder, for the fetcher that fills it: it may not exist yet (it is made when the first style comes)."""
    return _path(config, state_dir)


def default_library(config):
    """The default style (the folder of default_style in hub.json, or HUB_DESIGN_DEFAULT_STYLE for tests) as a library of one entry; None - not set
    or there is no DESIGN.md in the folder. The name is the first heading of the file."""
    path = (os.environ.get("HUB_DESIGN_DEFAULT_STYLE") or "").strip()
    if not path:
        for key, val in ((config or {}).get("extensions") or {}).items():
            if isinstance(val, dict) and str(key).rsplit(":", 1)[-1] == "hub-design" and str(val.get("default_style") or "").strip():
                path = str(val["default_style"]).strip()
                break
    root = os.path.realpath(os.path.expanduser(path)) if path else ""
    md = _inside(root, DEFAULT_FILE) if root and os.path.isdir(root) else None
    if not md:
        return None
    prev = next((n for n in ("preview" + ext for ext in IMAGES) if _inside(root, n)), "")
    sig = (md, _stat(md), prev, _stat(os.path.join(root, prev)) if prev else None)
    hit = _cache.get(("default", root))
    if hit and hit[0] == sig:
        return hit[1]
    try:
        with open(md, "rb") as f:
            head = f.read(MD_MAX).decode("utf-8", "replace")
    except OSError:
        return None
    name = next((ln[2:].strip() for ln in head.splitlines() if ln.startswith("# ") and ln[2:].strip()), "") or os.path.basename(root)
    entry = {"id": DEFAULT_ID, "name": name[:120], "file": DEFAULT_FILE, "category": "", "tags": [], "preview": prev, "site": "", "description": "", "labels": {}, "kind": "web"}
    lib = Library(root, [entry])
    _cache[("default", root)] = (sig, lib)
    return lib


def _text(x, limit=0):
    s = x.strip() if isinstance(x, str) else ""
    return s[:limit] if limit else s


def _inside(root, rel):
    """The real path of rel inside root, or None if it points elsewhere (.., absolute, a link out) or is not a file."""
    if not rel or os.path.isabs(rel) or "\\" in rel or ":" in rel or any(ord(c) < 32 for c in rel):   # a newline would break the message line
        return None
    real = os.path.realpath(os.path.join(root, *rel.split("/")))
    try:
        inside = os.path.commonpath([root, real]) == root
    except ValueError:   # another disk
        return None
    return real if inside and os.path.isfile(real) else None


def kind_of(raw_set, category):
    """The kind of an entry: no set - a Refero style (web); in a set - by its category."""
    return KIND_OF_CATEGORY.get(category, "other") if raw_set else "web"


def _entry(root, key, raw):
    if not isinstance(raw, dict):
        return None
    name = _text(raw.get("name"), 120)
    file = _text(raw.get("file"))
    sid = _text(raw.get("id") or raw.get("uuid") or key, 80)
    if not name or not sid or not file.lower().endswith(".md") or "/" in file or _inside(root, file) is None:
        return None
    tags = [_text(t, 60) for t in (raw.get("tags") if isinstance(raw.get("tags"), list) else []) if _text(t)]
    prev = _text(raw.get("preview"))
    if prev and (os.path.splitext(prev)[1].lower() not in IMAGES or _inside(root, prev.replace("\\", "/")) is None):
        prev = ""
    cover = _text(raw.get("cover_video"))
    if cover and (os.path.splitext(cover)[1].lower() not in COVERS or _inside(root, cover.replace("\\", "/")) is None):
        cover = ""
    site = _text(raw.get("site"), 300)
    return {"id": sid, "name": name, "file": file, "category": _text(raw.get("category"), 60), "tags": tags, "preview": prev.replace("\\", "/"), "cover": cover.replace("\\", "/"),
            "site": site if re.match(r"https?://", site) else "", "description": _text(raw.get("description"), 600),
            "kind": kind_of(_text(raw.get("set"), 80), _text(raw.get("category"), 60))}


def _labels(raw):
    """The labels of one style from tags.json: only the known axes, short strings; theme is one word, the others are lists."""
    out = {}
    if not isinstance(raw, dict):
        return out
    theme = _text(raw.get("theme"), 40)
    if theme:
        out["theme"] = theme
    for axis in (a for a in stylesearch.AXES if a != "theme"):
        v = raw.get(axis)
        got = [_text(x, 40) for x in ([v] if isinstance(v, str) else v if isinstance(v, list) else [])]
        got = [x for x in got if x][:LABELS_PER_AXIS]
        if got:
            out[axis] = got
    return out


class Library:
    def __init__(self, root, entries):
        self.root = root
        self.entries = sorted(entries, key=lambda e: e["name"].lower())
        self.by_id = {e["id"]: e for e in self.entries}
        self.labelled = any(e.get("labels") for e in self.entries)
        self._rows = None
        self._count = {}
        n = {}
        for e in self.entries:
            n[e["kind"]] = n.get(e["kind"], 0) + 1
        self.kinds = [{"k": k, "n": n[k]} for k in KINDS if n.get(k)] if len(n) > 1 else []   # one kind only - nothing to switch between
        self.cats = self.cats_of("")

    def kind(self, want=""):
        """The kind the list is about: the asked one if the library has it, else web (or the first one); "" when there is nothing to switch."""
        ks = [x["k"] for x in self.kinds]
        return want if want in ks else "web" if "web" in ks else ks[0] if ks else ""

    def has(self, e, kind):
        return not kind or e["kind"] == kind

    def count(self, kind=""):
        return sum(1 for e in self.entries if self.has(e, kind))

    def cats_of(self, kind=""):
        cats = {}
        for e in self.entries:
            if e["category"] and self.has(e, kind):
                cats[e["category"]] = cats.get(e["category"], 0) + 1
        return [{"name": k, "n": v} for k, v in sorted(cats.items(), key=lambda kv: (-kv[1], kv[0].lower()))]

    def search(self, q="", cat="", offset=0, limit=24, filters=None, lang="en", kind=""):
        """-> (how many, one page of the list). Without labels (no tags.json): the entries whose name, category or tags contain every word of q
        (names first). With labels: ranked by stylesearch (labels, name, category, tags, description), then the entries that only contain the words.
        cat - exactly this category; kind - only this kind (see KINDS); filters {axis: label} - only the entries that have all these labels; the list is alphabetical when q is empty."""
        words = [w for w in re.split(r"\s+", (q or "").lower().strip()) if w]
        keep = {a: k for a, k in (filters or {}).items() if a in stylesearch.AXES and isinstance(k, str) and k}

        def ok(e):
            return self.has(e, kind) and (not cat or e["category"] == cat) and all(k in stylesearch.have(e.get("labels"), a) for a, k in keep.items())

        v = stylesearch.vocab()
        rows = []   # (entry, the labels that matched the query)
        if words and self.labelled:
            if self._rows is None:
                self._rows = stylesearch.prepare(self.entries, v)
            ranked = [(e, hits) for e, hits in stylesearch.rank(self._rows, v, q) if ok(e)]
            seen = {e["id"] for e, _ in ranked}
            rows = ranked + [(e, []) for _, e in self._plain(words) if e["id"] not in seen and ok(e)]
        else:
            rows = [(e, []) for _, e in sorted(self._plain(words), key=lambda r: r[0]) if ok(e)]   # stable: names stay alphabetical inside a group
        offset, limit = max(0, int(offset)), max(0, min(int(limit), PAGE_MAX))
        return len(rows), [brief(e, lang, hits + list(keep.values())) for e, hits in rows[offset:offset + limit]]

    def _plain(self, words):
        """[(0 if every word is in the name else 1, entry)] of the entries that have every word in the name, category or tags."""
        out = []
        for e in self.entries:
            name = e["name"].lower()
            hay = name + " " + e["category"].lower() + " " + " ".join(e["tags"]).lower()
            if all(w in hay for w in words):
                out.append((0 if words and all(w in name for w in words) else 1, e))
        return out

    def facets(self, lang="en", keep=(), kind=""):
        """The chips of the panel {axis: [{k, t, n}]}: the most frequent labels of each axis (and those in `keep`) with the number of styles of this kind;
        {} without labels (a kind with no labelled style gets no rows at all)."""
        if not self.labelled:
            return {}
        if kind not in self._count:
            count = self._count[kind] = {a: {} for a in stylesearch.AXES}
            for e in self.entries:
                if self.has(e, kind):
                    for a, n in count.items():
                        for k in stylesearch.have(e.get("labels"), a):
                            n[k] = n.get(k, 0) + 1
        v = stylesearch.vocab()
        out = {}
        for a, size in FACETS_TOP.items():
            freq = sorted(self._count[kind][a].items(), key=lambda kv: (-kv[1], kv[0]))
            top = freq[:size] + [kv for kv in freq[size:] if kv[0] in keep]
            if top:
                out[a] = [{"k": k, "t": v.name(k, lang), "n": n} for k, n in top]
        return out

    def path(self, sid):
        e = self.by_id.get(sid)
        return _inside(self.root, e["file"]) if e else None

    def preview(self, sid):
        e = self.by_id.get(sid)
        return _inside(self.root, e["preview"]) if e and e["preview"] else None

    def cover(self, sid):
        e = self.by_id.get(sid)
        return _inside(self.root, e["cover"]) if e and e.get("cover") else None


def card_labels(e, lang="en", prefer=(), limit=LABELS_SHOWN):
    """Up to `limit` labels of a style for its card: first those the search was after, then its theme, style and mood, then the rest."""
    t = e.get("labels")
    pool = [k for a in stylesearch.AXES for k in stylesearch.have(t, a)]
    order = [k for k in prefer if k in pool]
    for k in [*stylesearch.have(t, "theme")[:1], *stylesearch.have(t, "style")[:1], *stylesearch.have(t, "mood")[:1], *pool]:
        if k not in order:
            order.append(k)
    v = stylesearch.vocab()
    return [{"k": k, "t": v.name(k, lang)} for k in order[:limit]]


def brief(e, lang="en", prefer=()):
    return {"id": e["id"], "name": e["name"], "category": e["category"], "tags": e["tags"][:TAGS_SHOWN], "preview": bool(e["preview"]),
            **({"cover": True} if e.get("cover") else {}), "labels": card_labels(e, lang, prefer)}


def _stat(path):
    try:
        st = os.stat(path)
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def _read_tags(path):
    """tags.json as a dict; missing, too big or broken - empty (the library then has no labels)."""
    try:
        if os.stat(path).st_size > INDEX_MAX:
            return {}
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


_building = set()   # index files being re-read behind a request (one thread each)
_lock = threading.Lock()


def load(root, stale_ok=False):
    """The library of the folder (cached until index.json changes); None - no index or nothing usable in it.
    stale_ok: index.json changed but an earlier library is in the cache - answer with it now and re-read behind (a big index takes seconds,
    and the download of the covers rewrites it all the time: the page must not wait for that)."""
    if not root:
        return None
    index = os.path.join(root, INDEX)
    try:
        st = os.stat(index)
        if st.st_size > INDEX_MAX:
            return None
        sig = (st.st_mtime_ns, st.st_size, _stat(os.path.join(root, TAGS)))
        hit = _cache.get(index)
        if hit and hit[0] == sig:
            return hit[1]
        if hit and stale_ok:
            _reload_behind(root, index)
            return hit[1]
        with open(index, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    tags = _read_tags(os.path.join(root, TAGS))
    pairs = data.items() if isinstance(data, dict) else enumerate(data) if isinstance(data, list) else []
    entries, seen = [], set()
    for key, raw in pairs:
        e = _entry(root, str(key), raw)
        if e and e["id"] not in seen:
            seen.add(e["id"])
            e["labels"] = _labels(tags.get(e["id"]))
            entries.append(e)
    lib = Library(root, entries) if entries else None
    _cache[index] = (sig, lib)
    return lib


def _reload_behind(root, index):
    with _lock:
        if index in _building:
            return
        _building.add(index)

    def run():
        try:
            load(root)
        finally:
            with _lock:
                _building.discard(index)
    threading.Thread(target=run, daemon=True).start()


def warm(root):
    """Read the library into the cache ahead of the first request (the plugin process start)."""
    try:
        load(root)
    except Exception:   # a broken folder is the request's business: here it only means no warm-up
        pass


def _section(lines, word):
    """The lines under the first "## ..." heading that has `word`; none such - all lines."""
    out, on, found = [], False, False
    for ln in lines:
        if ln.startswith("## "):
            on = word in ln.lower()
            found = found or on
            continue
        if on:
            out.append(ln)
    return out if found else lines


def parse(md):
    """What the style card shows, from the file text: the one-line idea, the theme, the palette (rows of the colors table), the fonts."""
    lines = md.splitlines()
    tagline = next((ln[1:].strip() for ln in lines if ln.startswith(">")), "")
    theme = (_THEME.search(md) or [None, ""])[1].lower()
    palette, seen = [], set()
    for ln in _section(lines, "color"):
        cells = [c.strip() for c in ln.strip().strip("|").split("|")] if ln.lstrip().startswith("|") else []
        if len(cells) < 2:
            continue
        hit = next((_HEX.search(c) for c in cells[1:] if _HEX.search(c)), None)
        if not hit or hit.group(0).lower() in seen:
            continue
        seen.add(hit.group(0).lower())
        role = cells[-1] if len(cells) > 2 and not _HEX.search(cells[-1]) and not cells[-1].startswith("`") else ""
        palette.append({"name": cells[0].strip("`* ")[:60], "hex": hit.group(0).lower(), "role": role[:200]})
        if len(palette) >= PALETTE_MAX:
            break
    fonts = []
    for ln in _section(lines, "typography"):
        if ln.startswith("### "):
            name = re.split(r"\s[—–-]\s", ln[4:].strip(), maxsplit=1)[0].strip("`* ")
            if name and name not in fonts:
                fonts.append(name[:60])
        if len(fonts) >= FONTS_MAX:
            break
    return {"tagline": tagline[:300], "theme": theme if theme in ("light", "dark") else "", "palette": palette, "fonts": fonts}


def detail(lib, sid, lang="en"):
    """The card of one style: the entry, the full path of its file (what goes to the designer) and what is read from the file."""
    e = lib.by_id.get(sid)
    path = lib.path(sid)
    if not e or not path:
        return None
    try:
        with open(path, "rb") as f:
            md = f.read(MD_MAX).decode("utf-8", "replace")
    except OSError:
        return None
    return {**brief(e, lang), "labels": card_labels(e, lang, limit=99), "tags": e["tags"], "site": e["site"], "description": e["description"], "path": path, **parse(md)}
