"""Hub Design: the style reference library - a folder of DESIGN.md-like files plus index.json, shown in the style picker.

The folder is set in hub.json (extensions.<account>:hub-design.styles_dir, or any extension key ending in "hub-design"),
the environment variable HUB_DESIGN_STYLES overrides it for tests; by default it is <hub state>/style-library. No such
folder - the feature is simply not there. Nothing outside the folder is ever read or served: files are found only through
an index entry, and every path is checked to stay inside the folder.

index.json: a dict {id: entry} or a list of entries. Entry fields: id (or uuid; for a dict - the key), name, file (a .md file
in the folder), category, tags [..], preview (an image file in the folder, may be in a sub-folder), site, description.
Everything but name and file is optional."""
import json
import os
import re

DEFAULT_DIR = "style-library"
INDEX = "index.json"
PAGE_MAX = 60            # entries in one answer, however many the page asks for
TAGS_SHOWN = 6
MD_MAX = 1024 * 1024     # a style file is read up to this size
INDEX_MAX = 32 * 1024 * 1024
IMAGES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif"}
PALETTE_MAX = 24
FONTS_MAX = 6
_HEX = re.compile(r"#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
_THEME = re.compile(r"^\*\*Theme:\*\*\s*(\w+)", re.M)

_cache = {}   # index path -> (mtime, size, library)


def folder(config, state_dir):
    """The library folder: the setting of the plugin in hub.json, otherwise <state>/style-library; None if there is no such folder."""
    path = (os.environ.get("HUB_DESIGN_STYLES") or "").strip()
    if not path:
        for key, val in ((config or {}).get("extensions") or {}).items():
            if isinstance(val, dict) and str(key).rsplit(":", 1)[-1] == "hub-design" and str(val.get("styles_dir") or "").strip():
                path = str(val["styles_dir"]).strip()
                break
    path = os.path.expanduser(path) if path else os.path.join(state_dir, DEFAULT_DIR)
    real = os.path.realpath(path)
    return real if os.path.isdir(real) else None


def _text(x, limit=0):
    s = x.strip() if isinstance(x, str) else ""
    return s[:limit] if limit else s


def _inside(root, rel):
    """The real path of rel inside root, or None if it points elsewhere (.., absolute, a link out) or is not a file."""
    if not rel or os.path.isabs(rel) or "\\" in rel or ":" in rel:
        return None
    real = os.path.realpath(os.path.join(root, *rel.split("/")))
    try:
        inside = os.path.commonpath([root, real]) == root
    except ValueError:   # another disk
        return None
    return real if inside and os.path.isfile(real) else None


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
    site = _text(raw.get("site"), 300)
    return {"id": sid, "name": name, "file": file, "category": _text(raw.get("category"), 60), "tags": tags, "preview": prev.replace("\\", "/"),
            "site": site if re.match(r"https?://", site) else "", "description": _text(raw.get("description"), 600)}


class Library:
    def __init__(self, root, entries):
        self.root = root
        self.entries = sorted(entries, key=lambda e: e["name"].lower())
        self.by_id = {e["id"]: e for e in self.entries}
        cats = {}
        for e in self.entries:
            if e["category"]:
                cats[e["category"]] = cats.get(e["category"], 0) + 1
        self.cats = [{"name": k, "n": v} for k, v in sorted(cats.items(), key=lambda kv: (-kv[1], kv[0].lower()))]

    def search(self, q="", cat="", offset=0, limit=24):
        """Entries whose name, category or tags contain every word of q (names first); cat - exactly this category."""
        words = [w for w in re.split(r"\s+", (q or "").lower().strip()) if w]
        rows = []
        for e in self.entries:
            if cat and e["category"] != cat:
                continue
            name = e["name"].lower()
            hay = name + " " + e["category"].lower() + " " + " ".join(e["tags"]).lower()
            if all(w in hay for w in words):
                rows.append((0 if words and all(w in name for w in words) else 1, e))
        rows.sort(key=lambda r: r[0])   # stable: names stay alphabetical inside a group
        offset, limit = max(0, int(offset)), max(0, min(int(limit), PAGE_MAX))
        return len(rows), [brief(e) for _, e in rows[offset:offset + limit]]

    def path(self, sid):
        e = self.by_id.get(sid)
        return _inside(self.root, e["file"]) if e else None

    def preview(self, sid):
        e = self.by_id.get(sid)
        return _inside(self.root, e["preview"]) if e and e["preview"] else None


def brief(e):
    return {"id": e["id"], "name": e["name"], "category": e["category"], "tags": e["tags"][:TAGS_SHOWN], "preview": bool(e["preview"])}


def load(root):
    """The library of the folder (cached until index.json changes); None - no index or nothing usable in it."""
    if not root:
        return None
    index = os.path.join(root, INDEX)
    try:
        st = os.stat(index)
        if st.st_size > INDEX_MAX:
            return None
        sig = (st.st_mtime_ns, st.st_size)
        hit = _cache.get(index)
        if hit and hit[0] == sig:
            return hit[1]
        with open(index, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    pairs = data.items() if isinstance(data, dict) else enumerate(data) if isinstance(data, list) else []
    entries, seen = [], set()
    for key, raw in pairs:
        e = _entry(root, str(key), raw)
        if e and e["id"] not in seen:
            seen.add(e["id"])
            entries.append(e)
    lib = Library(root, entries) if entries else None
    _cache[index] = (sig, lib)
    return lib


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


def detail(lib, sid):
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
    return {**brief(e), "tags": e["tags"], "site": e["site"], "description": e["description"], "path": path, **parse(md)}
