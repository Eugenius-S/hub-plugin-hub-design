"""Task folders: every design lies in the folder of its task, every variant and round in a subfolder of its own.

    <direction folder>/design/<task>/<design>/index.html (assets/ inside)   - the design belongs to a direction
    <designer folder>/<task>/<design>/index.html                             - no direction (the designer's own place, ~/design)

<task> is a short Latin slug (poster-bf-sale, story-kyoto); a PDF lies as <task>/<design>/<design>.pdf. The designer saves new designs so
(the line of message() in lib.js names the folder); this module sorts the designs made before: the ones the registry knows (registry.py)
and the html/pdf files found in the design folders.

What moves and where:
- the direction of a design: the direction folder the file lies in, else the direction that made it, else the one that asked for its task,
  else the project folder design/<project>/ or the name that says the direction (peers.project_label - the rule of the start screen);
- only designs: a file in a design folder (<direction>/design/, the designer's folder, a folder named design) or made by a designer;
  a file that lies in a working folder of something else (a template a script reads, a report of a plugin) is never moved;
- the task: the folder the design already lies in under its root (design/<project>/, ~/design/<project>/), else the title of its task;
- a design that is index.html of a folder of its own moves with that folder; a loose file moves alone, the files it names by a relative
  path inside its folder are copied next to it (the original stays for the other designs), any other relative link is rewritten;
- the copies of the hand edits (<name>.r<N>.html beside it, made by the canvas) go along as index.r<N>.html;
- nothing is erased; anything unclear (no direction and no designer, no task, the place is taken) stays and is listed.

The moves are written to <state>/hub-design/layout/moves.jsonl (every step: move, copy, rewrite) - `--undo` puts everything back - and to
<state>/hub-design/layout/moves.json ({old path: new path}): the registry, the posts in Telegram and the page (pins, frames) read it and
follow the designs to their new places.

    python3 layout.py --dry   [state dir]   the plan: <state>/hub-design/layout/plan.txt (and plan.json), nothing is moved
    python3 layout.py --apply [state dir]   do the plan
    python3 layout.py --undo  [state dir]   put back what --apply moved
The hub code must be on PYTHONPATH (the directions and sessions are read from the hub)."""
import hashlib
import json
import os
import re
import shutil
import sys
import time

import peers
import registry

HTML = (".html", ".htm")
KINDS = HTML + (".pdf",)
INDEX = "index.html"
COPY_OF = re.compile(r"^(?P<stem>.+)\.r(?P<n>\d+)(?P<ext>\.html?)$", re.I)
SLUG_MAX = 32
SLUG_WORDS = 4
SCAN_DEPTH = 4
LAYOUT = "layout"
# a link in html or css: src/href/poster/data-src="...", url(...); srcset is split by commas
REF = re.compile(r"""(?P<pre>\b(?:src|href|poster|data-src)\s*=\s*)(?P<q>["'])(?P<url>[^"']*)(?P=q)|(?P<upre>url\(\s*)(?P<uq>["']?)(?P<uurl>[^"')]+)(?P=uq)(?P<upost>\s*\))""", re.I)
STOP = {"the", "a", "an", "of", "for", "to", "in", "on", "and", "with", "v", "i", "na", "po", "dlya", "s", "k", "iz", "ot", "do", "za", "kak", "eto"}
TR = dict(zip("абвгдеёзийклмнопрстуфхъыьэ", ["a", "b", "v", "g", "d", "e", "e", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "", "y", "", "e"]))
TR.update({"ж": "zh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ю": "yu", "я": "ya"})


def slug(title, words=SLUG_WORDS, most=SLUG_MAX):
    """A short Latin folder name of a title: "Постер к Чёрной пятнице" -> "poster-k-chernoy-pyatnitse"... cut to a few words, without the small ones."""
    low = "".join(TR.get(c, c) for c in str(title or "").lower())
    parts = [w for w in re.findall(r"[a-z0-9]+", low) if w not in STOP][:words]
    out = ""
    for w in parts:
        nxt = (out + "-" + w) if out else w
        if len(nxt) > most:
            break
        out = nxt
    return out or (parts[0][:most] if parts else "")


def key(path):
    return registry.key_of(path)


def under(path, folder):
    """The path relative to folder ('a/b.html'), None if it is not inside."""
    p, f = key(path), key(folder)
    return p[len(f) + 1:] if f and p.startswith(f + "/") else None


def kind_ok(path):
    return str(path).lower().endswith(KINDS)


# --- the context: directions, the designer's folder, tasks ---------------------------------------------------------------------------------
class Ctx:
    """dirs: [{key, cwd, label, names}]; designers: {session name: cwd} of the designer sessions; tasks: {id: {title, by, who}}."""

    def __init__(self, dirs=(), designers=None, tasks=None):
        self.dirs = [dict(d) for d in dirs]
        self.designers = dict(designers or {})
        self.tasks = dict(tasks or {})
        self.home = self.designers.get("designer") or next(iter(self.designers.values()), None)
        self.pairs = [(d["key"], d["label"]) for d in self.dirs]
        self.names = {d["key"]: list(d["names"]) for d in self.dirs}

    @classmethod
    def from_sessions(cls, sessions, directions, tasks=None):
        by = {}
        designers = {}
        for s in sessions or []:
            if not isinstance(s, dict) or not s.get("cwd") or s.get("kind") == "hub":
                continue
            if designer_name(s.get("name")):
                designers[s["name"]] = s["cwd"]
            if s.get("name") in (directions or ()) or s.get("role") == "worker":
                d = by.setdefault(peers._key(s["cwd"]), {"key": peers._key(s["cwd"]), "cwd": s["cwd"], "names": []})
                d["names"].append(s.get("name") or "")
        dirs = [{**d, "label": d["names"][0] if len(d["names"]) == 1 else (d["key"].rsplit("/", 1)[-1] or d["names"][0])} for d in by.values()]
        return cls(dirs, designers, tasks)

    def by_label(self, label):
        hits = [d for d in self.dirs if d["label"] == label]
        return hits[0] if len(hits) == 1 else None

    def by_name(self, name):
        return next((d for d in self.dirs if name and name in d["names"]), None)


def designer_name(name):
    """The designer and its helpers: designer, designer-<x> (its executors), hd-edits-<n> (the edit lane of Hub Design)."""
    n = str(name or "")
    return n == "designer" or n.startswith(("designer-", "hd-edits"))


def direction_of(row, ctx):
    """The direction a design surely belongs to (a dict of ctx.dirs) or None: the direction folder it lies in, the direction that made it, the one
    that asked for its task. A guess by the name (the start screen groups so) moves no file."""
    path = row["path"]
    best = None
    for d in ctx.dirs:
        if under(path, d["key"]) is not None and (best is None or len(d["key"]) > len(best["key"])):
            best = d
    if best:
        return best
    d = ctx.by_name(row.get("session"))
    if d:
        return d
    t = ctx.tasks.get(row.get("task") or "") or {}
    for name in (t.get("by"), t.get("who")):
        d = ctx.by_name(name)
        if d:
            return d
    return None


def design_place(path, ctx):
    """Where a design lies now: ('direction', <direction>/design, rel), ('designer', cwd, rel) under the designer's folder,
    ('design', folder, rel) under some folder named design; None - a working folder of something else."""
    for d in sorted(ctx.dirs, key=lambda x: -len(x["key"])):
        rel = under(path, peers._key(d["cwd"]) + "/design")
        if rel is not None:
            return ("direction", peers._key(d["cwd"]) + "/design", rel)
    for cwd in sorted(set(ctx.designers.values()), key=lambda x: -len(x)):
        rel = under(path, cwd)
        if rel is not None:
            return ("designer", cwd, rel)
    parts = key(path).split("/")
    if "design" in parts[:-1]:
        i = len(parts) - 1 - parts[::-1].index("design")
        return ("design", "/".join(parts[:i + 1]), "/".join(parts[i + 1:]))
    return None


def variant_of(path):
    """The name of the design's own folder: index.html is named by its folder, any other file by its name."""
    base = os.path.basename(key(path))
    if base.lower() == INDEX:
        return os.path.basename(os.path.dirname(key(path)))
    return os.path.splitext(base)[0]


def task_name(row, rel, ctx):
    """The task folder: the folder the design already lies in right under its root (not its own folder), else the slug of its task's title."""
    parts = rel.split("/") if rel else []
    own = len(parts) == 2 and parts[1].lower() == INDEX   # <root>/<x>/index.html: x is the design's own folder, not a task
    if len(parts) >= 2 and not own:
        return parts[0]
    title = (ctx.tasks.get(row.get("task") or "") or {}).get("title") or ""
    return slug(title)


def plan(rows, ctx, extra=()):
    """The plan of moves. rows: the registry ({path, session, task, title}); extra: html/pdf paths found in the design folders.
    -> {"moves": [...], "unclear": [{path, why}], "left": [{path, why}], "placed": n}. A move: {from, to, kind: dir|file, root, task, direction,
    copies: [[from, to]], assets: [[from, to]], rewrite: n}."""
    seen, items = set(), []
    for r in rows:
        p = os.path.expanduser(str(r.get("path") or ""))
        if not p or not kind_ok(p) or key(p) in seen or not os.path.isfile(p):
            continue
        seen.add(key(p))
        items.append({**r, "path": p})
    for p in extra:
        if key(p) not in seen and os.path.isfile(p):
            seen.add(key(p))
            items.append({"path": p, "session": "", "task": None})
    known = {key(r["path"]) for r in items}
    out = {"moves": [], "unclear": [], "left": [], "placed": 0}
    groups = {}
    for r in items:
        place = design_place(r["path"], ctx)
        d = direction_of(r, ctx)
        if place and d and len(place[2].split("/")) >= 2:
            groups.setdefault((place[1], place[2].split("/")[0]), set()).add(d["key"])
    taken, whole_dirs = {}, []
    for r in sorted(items, key=lambda x: key(x["path"])):
        p = r["path"]
        if any(under(p, d) is not None for d in whole_dirs):
            continue   # it lies in a folder that moves whole
        if COPY_OF.match(os.path.basename(p)) and key(re.sub(r"\.r\d+(\.html?)$", r"\1", p, flags=re.I)) in known and not r.get("session"):
            continue   # a copy of the hand edits: it goes with its design
        place = design_place(p, ctx)
        mine = designer_name(r.get("session"))
        if place is None and not mine:
            out["left"].append({"path": p, "why": "not a design folder"})
            continue
        if place is None:   # made by the designer in a working folder of something else (a template a script reads): never moved
            out["left"].append({"path": p, "why": "working folder"})
            continue
        d = direction_of(r, ctx)
        if not d and len(place[2].split("/")) >= 2:   # its project folder holds designs of one direction: the folder goes there whole
            hits = groups.get((place[1], place[2].split("/")[0])) or set()
            d = next((x for x in ctx.dirs if x["key"] in hits), None) if len(hits) == 1 else None
        if d:
            root = peers._key(d["cwd"]) + "/design"
        elif place[0] == "designer" or mine:
            root = peers._key(ctx.home or (place[1] if place[0] == "designer" else ""))
        else:
            root = ""
        if not root:
            out["unclear"].append({"path": p, "why": "no direction and no designer"})
            continue
        rel = under(p, root)
        if rel is None:   # it moves to another root: the task folder it had there (design/<project>/, ~/design/<project>/) keeps its name
            rel = place[2]
        task = task_name(r, rel, ctx)
        if not task:
            out["unclear"].append({"path": p, "why": "no task"})
            continue
        variant = variant_of(p)
        ext = os.path.splitext(p)[1].lower()
        folder = root + "/" + task + "/" + variant
        target = folder + "/" + (INDEX if ext in HTML else os.path.basename(p))
        if key(target) == key(p):
            out["placed"] += 1
            continue
        src_dir = os.path.dirname(p)
        if os.path.basename(p).lower() == INDEX and key(os.path.dirname(src_dir)) in (key(root), key(place[1])):
            out["unclear"].append({"path": p, "why": "a folder of its own right in the root (a project or a design?)"})
            continue
        whole = os.path.basename(p).lower() == INDEX and own_folder(src_dir, p, known, ctx, root)
        if (whole and os.path.exists(folder)) or (not whole and os.path.exists(target)) or key(folder) in taken:
            out["unclear"].append({"path": p, "why": "the place is taken: " + folder})
            continue
        taken[key(folder)] = p
        m = {"from": p, "to": target, "kind": "dir" if whole else "file", "root": root, "task": task,
             "direction": d["label"] if d else "", "copies": [], "assets": [], "rewrite": 0}
        if whole:
            m["dir_from"], m["dir_to"] = src_dir, folder
            whole_dirs.append(src_dir)
        else:
            stem, ext0 = os.path.splitext(os.path.basename(p))
            for n in sorted(os.listdir(src_dir)):
                c = COPY_OF.match(n)
                if c and c["stem"] == stem and c["ext"].lower() == ext0.lower() and key(os.path.join(src_dir, n)) not in {key(x["path"]) for x in items if x.get("session")}:
                    m["copies"].append([os.path.join(src_dir, n), folder + "/" + "index.r" + c["n"] + c["ext"]])
            if ext in HTML:
                for f in [p] + [c[0] for c in m["copies"]]:
                    a, w = links(f, folder)
                    m["assets"] += [x for x in a if x not in m["assets"] and key(x[0]) != key(x[1])]
                    m["rewrite"] += w
        out["moves"].append(m)
    return out


def own_folder(folder, path, known, ctx, root):
    """A folder of one design: index.html with its assets, no other design in it, and not a folder of something bigger."""
    k = key(folder)
    if k in {key(root)} | {key(c) for c in ctx.designers.values()} | {d["key"] for d in ctx.dirs} or os.path.basename(k) == "design":
        return False
    for other in known:
        if other != key(path) and other.startswith(k + "/") and not COPY_OF.match(os.path.basename(other)):
            return False
    return True


def read(path):
    with open(path, "rb") as f:
        return f.read().decode("utf-8", "replace")


def relative(url):
    """A relative link to a file (not an address, not an anchor, not data:, not from the root)."""
    u = url.strip()
    return bool(u) and not re.match(r"^(?:[a-z][a-z0-9+.-]*:|//|/|#|\{)", u, re.I)


def links(path, new_folder):
    """The relative links of an html moved to new_folder: [[asset, its copy]] for files inside its folder, and the number of links to rewrite
    (outside its folder: ../x)."""
    folder = os.path.dirname(path)
    assets, rewrite = [], 0
    for m in REF.finditer(read(path)):
        url = (m["url"] if m["url"] is not None else m["uurl"]) or ""
        if not relative(url):
            continue
        clean = re.split(r"[?#]", url, maxsplit=1)[0]
        if not clean:
            continue
        src = os.path.normpath(os.path.join(folder, clean))
        inside = under(src, folder)
        if inside is not None and ".." not in clean.replace("\\", "/").split("/"):
            if os.path.exists(src):
                pair = [src, new_folder + "/" + inside]
                if pair not in assets:
                    assets.append(pair)
        elif os.path.exists(src):
            rewrite += 1
    return assets, rewrite


def rewritten(text, old_folder, new_folder):
    """The html with the links that point outside its old folder made relative to the new one."""
    def fix(url):
        clean, tail = (re.split(r"([?#].*)", url, maxsplit=1) + ["", ""])[:2]
        if not relative(url) or not clean:
            return url
        src = os.path.normpath(os.path.join(old_folder, clean))
        if under(src, old_folder) is not None and ".." not in clean.split("/"):
            return url
        if not os.path.exists(src):
            return url
        return os.path.relpath(src, new_folder).replace(os.sep, "/") + tail

    def sub(m):
        if m["url"] is not None:
            return m["pre"] + m["q"] + fix(m["url"]) + m["q"]
        return m["upre"] + m["uq"] + fix(m["uurl"]) + m["uq"] + m["upost"]
    return REF.sub(sub, text)


# --- doing the plan, the record, undo -----------------------------------------------------------------------------------------------------
def folder_of(state_dir):
    return os.path.join(state_dir, "hub-design", LAYOUT)


def apply(state_dir, p, now=None):
    """Do the moves of the plan; every step goes to moves.jsonl before the next one. -> the number of designs moved."""
    base = folder_of(state_dir)
    os.makedirs(os.path.join(base, "backup"), exist_ok=True)
    log = os.path.join(base, "moves.jsonl")
    run = str(int(now or time.time()))
    done = 0
    with open(log, "a", encoding="utf-8") as out:
        def note(**x):
            out.write(json.dumps({"run": run, **x}, ensure_ascii=False) + "\n")
            out.flush()
        for m in p["moves"]:
            top = m["root"]
            if m["kind"] == "dir":
                if not os.path.isdir(m["dir_from"]) or os.path.exists(m["dir_to"]):
                    continue
                os.makedirs(os.path.dirname(m["dir_to"]), exist_ok=True)
                shutil.move(m["dir_from"], m["dir_to"])
                note(op="move", src=m["dir_from"], dst=m["dir_to"], design=m["from"], to=m["to"], top=top)
                done += 1
                continue
            if not os.path.isfile(m["from"]) or os.path.exists(m["to"]):
                continue
            folder = os.path.dirname(m["to"])
            os.makedirs(folder, exist_ok=True)
            for a, b in m["assets"]:
                if os.path.exists(b) or not os.path.exists(a):
                    continue
                os.makedirs(os.path.dirname(b), exist_ok=True)
                (shutil.copytree if os.path.isdir(a) else shutil.copy2)(a, b)
                note(op="copy", src=a, dst=b, top=top)
            for src, dst in [[m["from"], m["to"]]] + m["copies"]:
                if not os.path.isfile(src) or os.path.exists(dst):
                    continue
                shutil.move(src, dst)
                note(op="move", src=src, dst=dst, design=m["from"] if src == m["from"] else None, to=dst, top=top)
                if dst.lower().endswith(HTML) and m["rewrite"]:
                    text = read(dst)
                    new = rewritten(text, os.path.dirname(src), folder)
                    if new != text:
                        keep = os.path.join(base, "backup", "%s-%s.html" % (run, hashlib.sha1(dst.encode("utf-8")).hexdigest()[:12]))
                        with open(keep, "w", encoding="utf-8") as f:
                            f.write(text)
                        with open(dst, "w", encoding="utf-8") as f:
                            f.write(new)
                        note(op="rewrite", dst=dst, backup=keep)
            done += 1
    write_map(state_dir)
    return done


def steps(state_dir):
    rows = []
    try:
        with open(os.path.join(folder_of(state_dir), "moves.jsonl"), encoding="utf-8") as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    return rows


def write_map(state_dir):
    """moves.json: {old path: new path} of the designs that are where --apply put them (an undone step is not in it)."""
    moves, dirs = {}, {}
    for s in steps(state_dir):
        if s.get("op") == "move" and s.get("design"):
            moves[key(s["design"])] = s["to"]
            if s["src"] != s["design"]:
                dirs[key(s["src"])] = s["dst"]
        elif s.get("op") == "unmove" and s.get("design"):
            moves.pop(key(s["design"]), None)
            dirs.pop(key(s.get("src_dir") or ""), None)
    path = os.path.join(folder_of(state_dir), "moves.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"files": moves, "dirs": dirs}, f, ensure_ascii=False)
    os.replace(tmp, path)
    return moves


def undo(state_dir):
    """Put back what --apply did, newest step first: a moved file or folder goes back (if its old place is free), a copy made by us is
    erased only if it is still the same, a rewritten html gets its text back. -> the number of steps undone."""
    rows = steps(state_dir)
    undone = {(s.get("src"), s.get("dst")) for s in rows if s.get("op", "").startswith("un")}
    n = 0
    log = os.path.join(folder_of(state_dir), "moves.jsonl")
    with open(log, "a", encoding="utf-8") as out:
        for s in reversed(rows):
            op = s.get("op")
            if op not in ("move", "copy", "rewrite") or (s.get("src"), s.get("dst")) in undone:
                continue
            if op == "rewrite":
                if os.path.isfile(s["dst"]) and os.path.isfile(s.get("backup") or ""):
                    shutil.copyfile(s["backup"], s["dst"])
                    out.write(json.dumps({"op": "unrewrite", "src": None, "dst": s["dst"]}, ensure_ascii=False) + "\n")
                    n += 1
                continue
            if op == "copy":
                if os.path.isfile(s["dst"]) and os.path.isfile(s["src"]) and same(s["src"], s["dst"]):
                    os.remove(s["dst"])
                    out.write(json.dumps({"op": "uncopy", "src": s["src"], "dst": s["dst"]}, ensure_ascii=False) + "\n")
                    n += 1
                continue
            if os.path.exists(s["dst"]) and not os.path.exists(s["src"]):
                os.makedirs(os.path.dirname(s["src"]), exist_ok=True)
                shutil.move(s["dst"], s["src"])
                out.write(json.dumps({"op": "unmove", "src": s["src"], "dst": s["dst"], "design": s.get("design"),
                                      "src_dir": s["src"] if s.get("design") and s["src"] != s["design"] else None}, ensure_ascii=False) + "\n")
                n += 1
    for s in rows:   # the folders our moves left empty, up to the root of the task folders
        d, top = os.path.dirname(s.get("dst") or ""), key(s.get("top") or "")
        while d and top and key(d).startswith(top + "/"):
            try:
                os.rmdir(d)
            except OSError:
                break
            d = os.path.dirname(d)
    write_map(state_dir)
    return n


def same(a, b):
    try:
        if os.path.getsize(a) != os.path.getsize(b):
            return False
        with open(a, "rb") as x, open(b, "rb") as y:
            return x.read() == y.read()
    except OSError:
        return False


# --- following the moves: the registry, the posts, the page ------------------------------------------------------------------------------
class Moves:
    """moves.json read again when it changes; remap(path) - the new path of a design that was moved (or the path itself)."""

    def __init__(self, state_dir):
        self.path = os.path.join(folder_of(state_dir), "moves.json")
        self.at, self.files, self.dirs = None, {}, {}

    def fresh(self):
        """True if the file changed since the last look."""
        try:
            at = os.stat(self.path).st_mtime_ns
        except OSError:
            at = None
        if at == self.at:
            return False
        self.at = at
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
            self.files, self.dirs = dict(data.get("files") or {}), dict(data.get("dirs") or {})
        except (OSError, ValueError, AttributeError):
            self.files, self.dirs = {}, {}
        return True

    def remap(self, path):
        if not path:
            return path
        k = key(os.path.expanduser(str(path)))
        if k in self.files:
            return self.files[k]
        for old, new in self.dirs.items():
            if k.startswith(old + "/"):
                return new + k[len(old):]
        return path


# --- gathering: the registry and the hub --------------------------------------------------------------------------------------------------
def scan(folders, depth=SCAN_DEPTH):
    """html and pdf files in the design folders (not in node_modules, .git, shots...)."""
    out = []
    for top in folders:
        top = os.path.expanduser(top)
        if not os.path.isdir(top):
            continue
        base = top.rstrip(os.sep).count(os.sep)
        for here, subs, files in os.walk(top):
            subs[:] = [s for s in subs if not s.startswith(".") and s not in registry.SKIP_PARTS and s not in ("node_modules", "assets", "fonts")]
            if here.count(os.sep) - base >= depth:
                subs[:] = []
            out += [os.path.join(here, f) for f in files if f.lower().endswith(KINDS) and not f.startswith(".")]
    return out


def gather(state_dir):
    """(rows, ctx, extra) from the registry file and the hub state."""
    from core import journal
    try:
        with open(os.path.join(state_dir, "hub-design", "registry.json"), encoding="utf-8") as f:
            saved = json.load(f)
    except (OSError, ValueError):
        saved = {}
    tasks = {k: v for k, v in (saved.get("tasks") or {}).items() if isinstance(v, dict)}
    sessions = list(journal.load_state(state_dir).get("sessions", {}).values())
    try:
        from modules.directions import direction
        from modules.directions.boards import Boards
        names = set(Boards(direction.root(), state_dir=state_dir).slugs())
    except Exception:
        names = set()
    ctx = Ctx.from_sessions(sessions, names, tasks)
    folders = [d["cwd"] + "/design" for d in ctx.dirs] + list(set(ctx.designers.values()))
    return saved.get("items") or [], ctx, shallow(scan(folders), ctx)


def shallow(paths, ctx):
    """The found files that lie right in a design root or in a project folder of it; deeper ones are working files of a design (exports, shots)."""
    out = []
    for f in paths:
        place = design_place(f, ctx)
        if place and len(place[2].split("/")) <= 2:
            out.append(f)
    return out


def text_of(p, home=os.path.expanduser("~")):
    """The plan for a human: a summary by direction, then every move and every design left."""
    short = (lambda x: "~" + x[len(home):] if home and x.startswith(home) else x)
    by = {}
    for m in p["moves"]:
        by[m["direction"] or "(no direction)"] = by.get(m["direction"] or "(no direction)", 0) + 1
    lines = [f"moves: {len(p['moves'])}, already in place: {p['placed']}, unclear: {len(p['unclear'])}, left (not a design folder): {len(p['left'])}"]
    lines += [f"  {k}: {v}" for k, v in sorted(by.items(), key=lambda x: -x[1])]
    lines.append("")
    for m in p["moves"]:
        extra = []
        if m["kind"] == "dir":
            extra.append("with its folder")
        if m["copies"]:
            extra.append(f"{len(m['copies'])} copies")
        if m["assets"]:
            extra.append(f"{len(m['assets'])} assets copied")
        if m["rewrite"]:
            extra.append(f"{m['rewrite']} links rewritten")
        lines.append(f"{short(m['from'])}\n  -> {short(m['to'])}" + (f"  ({', '.join(extra)})" if extra else ""))
    if p["unclear"]:
        lines += ["", "unclear (left as is):"] + [f"  {short(u['path'])} - {u['why']}" for u in p["unclear"]]
    if p["left"]:
        lines += ["", "left (not a design folder):"] + [f"  {short(u['path'])} - {u['why']}" for u in p["left"]]
    return "\n".join(lines) + "\n"


def dry(state_dir, rows=None, ctx=None, extra=None):
    """Make the plan and write it to plan.json and plan.txt. -> the plan."""
    if ctx is None:
        rows, ctx, extra = gather(state_dir)
    p = plan(rows or [], ctx, extra or [])
    base = folder_of(state_dir)
    os.makedirs(base, exist_ok=True)
    with open(os.path.join(base, "plan.json"), "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=1)
    with open(os.path.join(base, "plan.txt"), "w", encoding="utf-8") as f:
        f.write(text_of(p))
    return p


def startup(state_dir, version, auto=False):
    """At the start of the plugin under a hub: the plan (dry) once per version of the plugin; the moves themselves only with
    extensions.hub-design.auto_layout (off by default) - and once per version too, never while designers keep working.
    -> the plan, or None when this version already looked."""
    base = folder_of(state_dir)
    mark = os.path.join(base, "startup.json")
    try:
        with open(mark, encoding="utf-8") as f:
            if json.load(f).get("v") == version:
                return None
    except (OSError, ValueError):
        pass
    p = dry(state_dir)
    moved = apply(state_dir, p) if auto and p["moves"] else 0
    os.makedirs(base, exist_ok=True)
    with open(mark, "w", encoding="utf-8") as f:
        json.dump({"v": version, "moves": len(p["moves"]), "moved": moved, "unclear": len(p["unclear"])}, f)
    return p


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    state = args[0] if args else (os.environ.get("HUB_STATE_DIR") or os.path.expanduser("~/.hub-core"))
    if "--undo" in argv:
        print(f"undone: {undo(state)}")
        return 0
    if "--apply" in argv:
        p = dry(state)
        print(f"moved: {apply(state, p)}; the record: {os.path.join(folder_of(state), 'moves.jsonl')}")
        return 0
    if "--dry" in argv:
        p = dry(state)
        print(text_of(p).split("\n\n")[0])
        print(f"the full plan: {os.path.join(folder_of(state), 'plan.txt')}")
        return 0
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
