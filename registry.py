"""The registry of designs: every design a session ever made or sent, kept by the plugin process.

The start screen used to know only what the page had seen: the tail of the live session feeds, the history of the sessions that exist
right now and a list in the browser's localStorage. A design of a session that was removed, one deeper than the feed tail, one made
before this browser opened the page - gone from the screen. Here the journal is the source: the process reads it once from the very
start (the archive of the core included) and then follows the live journal with its own offset, and keeps one entry per design file in
<state>/hub-design/registry.json. Nothing in the registry is ever dropped because a session is gone; the page hides only a file that is
no longer on the disk.

What counts as a design: a file of a type the canvas opens (.html .htm .pdf .svg) that a session sent to the owner (owner.file, by
its source path) or created with the Write tool. An Edit only refreshes the time of a design that is already there.
Paths of another OS (C:\\... on a Mac and the other way round) are not kept: this machine cannot show them.

`python3 registry.py --report [state dir]` counts what the journal holds, without writing anything."""
import json
import os
import re
import sys
import threading
import time

KINDS = (".html", ".htm", ".pdf", ".svg")
WRITES = ("Write",)                 # create a design
EDITS = ("Edit", "MultiEdit")       # touch a design that is already known
KEEP = 5000                         # entries kept: the freshest
SKIP_PARTS = {"node_modules", ".git", ".claude", "site-packages", "__pycache__"}
TEMP = re.compile(r"(?:^|/)(?:tmp|temp|var/folders|private/tmp|appdata/local/temp)(?:/|$)", re.I)   # a scratch file of a test is not a design
ARCHIVE = re.compile(r"journal-(\d+)-(\d+)\.jsonl")
WIN_PATH = re.compile(r"^(?:[A-Za-z]:[\\/]|\\\\)")
_EDIT_LINE = re.compile(rb'"name"\s*:\s*"(?:Write|Edit|MultiEdit)"')
_KIND_LINE = re.compile(rb'\.(?:html?|pdf|svg)"', re.I)
TICK = 3   # s between journal reads


def is_win():
    return os.name == "nt"


def native(path):
    """A path this machine can open: a drive or UNC path on Windows, an absolute or ~/ path elsewhere."""
    p = str(path or "")
    return bool(WIN_PATH.match(p)) if is_win() else p.startswith(("/", "~/"))


def key_of(path):
    """One key for a file however its path was written (separators, the drive letter's case)."""
    p = str(path).strip().replace("\\", "/").rstrip("/")
    return p.lower() if WIN_PATH.match(str(path).strip()) else p


def design_path(path):
    """The path if it is a design worth keeping, otherwise None."""
    p = str(path or "").strip()
    if not p or "://" in p or not p.lower().endswith(KINDS) or not native(p):
        return None
    k = key_of(p)
    if TEMP.search(k) or SKIP_PARTS & set(k.split("/")):
        return None
    return p


def broad(directory):
    """A folder too wide to be a design's own: the home folder or above it, a disk root."""
    real = os.path.realpath(directory)
    home = os.path.realpath(os.path.expanduser("~"))
    return os.path.dirname(real) == real or real == home or home.startswith(real.rstrip(os.sep) + os.sep)


def fold(items, ev):
    """Take one journal event into the entries {key: {path, session, ts, last, rank}}. True if something changed."""
    if not isinstance(ev, dict):
        return False
    kind, data, ts = ev.get("type"), ev.get("data") or {}, float(ev.get("ts") or 0)
    if kind == "owner.file":
        path, session, rank = design_path(data.get("source") or data.get("path")), data.get("sender"), 1
    elif kind == "turn.tool" and data.get("name") in WRITES + EDITS:
        inp = data.get("input") or {}
        path, session, rank = design_path(inp.get("file_path")), ev.get("entity"), 2
        if path and data["name"] in EDITS:   # an edit makes no design, it only keeps a known one fresh
            cur = items.get(key_of(path))
            if not cur or cur["last"] >= ts:
                return False
            cur["last"] = ts
            return True
    else:
        return False
    if not path:
        return False
    k = key_of(path)
    cur = items.get(k)
    if not cur:
        items[k] = {"path": path, "session": session or "", "ts": ts, "last": ts, "rank": rank}
        return True
    before = dict(cur)
    cur["last"] = max(cur["last"], ts)
    if rank > cur["rank"] or rank == cur["rank"] and ts >= cur["ts"]:
        cur.update(session=session or cur["session"], ts=ts, rank=rank)
    return cur != before


def candidates(chunk):
    """Lines of the journal worth parsing: a cheap look at the bytes first (the archive is hundreds of megabytes of tool results)."""
    for line in chunk:
        if b"owner.file" in line:
            yield line
        elif b"turn.tool" in line and _EDIT_LINE.search(line) and _KIND_LINE.search(line):
            yield line


def read_lines(path, start=0):
    """(lines, new offset): only whole lines from `start`."""
    try:
        with open(path, "rb") as f:
            f.seek(start)
            data = f.read()
    except OSError:
        return [], start
    end = data.rfind(b"\n")
    if end < 0:
        return [], start
    return data[:end].split(b"\n"), start + end + 1


def archives(state_dir):
    """(first, last, path) of the core archives by the last event number."""
    folder = os.path.join(state_dir, "journal-archive")
    try:
        names = os.listdir(folder)
    except OSError:
        return []
    rows = [(int(m[1]), int(m[2]), os.path.join(folder, n)) for n in names if (m := ARCHIVE.fullmatch(n))]
    return sorted(rows, key=lambda r: r[1])


class Registry:
    """Entries of designs; `ready` - the archive and the live journal were read once (the page shows what there is before that too)."""

    def __init__(self, state_dir):
        self.dir = state_dir
        self.path = os.path.join(state_dir, "hub-design", "registry.json")
        self.journal = os.path.join(state_dir, "journal.jsonl")
        self.lock = threading.Lock()
        self.ready = False
        self.items, self.seq, self.ino, self.offset = {}, 0, None, 0
        try:
            with open(self.path, encoding="utf-8") as f:
                saved = json.load(f)
            self.items = {key_of(v["path"]): v for v in saved.get("items", []) if isinstance(v, dict) and v.get("path")}
            self.seq = int(saved.get("seq") or 0)
        except (OSError, ValueError, TypeError, KeyError):
            pass

    def save(self):
        keep = sorted(self.items.values(), key=lambda v: v["last"], reverse=True)[:KEEP]
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"v": 1, "seq": self.seq, "items": keep}, f, ensure_ascii=False)
        os.replace(tmp, self.path)

    def take(self, lines):
        """Fold the lines of a journal file: only events newer than what was folded. True if the entries changed."""
        changed, top = False, self.seq
        for line in candidates(lines):
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            seq = ev.get("seq") if isinstance(ev, dict) else None
            if not isinstance(seq, int) or seq <= self.seq:
                continue
            top = max(top, seq)
            with self.lock:
                changed |= fold(self.items, ev)
        return changed, top

    def pass_archives(self):
        changed = False
        for first, last, path in archives(self.dir):
            if last <= self.seq:
                continue
            try:
                with open(path, "rb") as f:   # line by line: an archive is tens of megabytes
                    c, top = self.take(f)
            except OSError:
                continue
            changed |= c
            self.seq = max(self.seq, top)   # archives overlap and every one is whole: events up to its last number are folded
            self.seq = max(self.seq, last)
        return changed

    def poll(self):
        """One step: archives we have not read, then what the live journal got since the last step."""
        try:
            st = os.stat(self.journal)
            ino, size = st.st_ino, st.st_size
        except OSError:
            ino, size = None, 0
        changed = False
        if ino != self.ino or size < self.offset:   # the first look or a rotation: what went to the archive is read from there
            changed |= self.pass_archives()
            self.ino, self.offset = ino, 0
            first_look = True
        else:
            first_look = False
        lines, self.offset = read_lines(self.journal, self.offset)
        c, top = self.take(lines)
        changed |= c
        if first_look or top > self.seq:
            self.seq = max(self.seq, top)
        if changed or first_look:
            self.save()
        self.ready = True
        return changed

    def listing(self):
        with self.lock:
            return sorted((dict(v) for v in self.items.values()), key=lambda v: v["last"], reverse=True)

    def folders(self):
        """Folders of the designs kept: the plugin serves their files (the design's pictures and styles lie beside it) even when no session works there any more."""
        with self.lock:
            dirs = {os.path.dirname(os.path.expanduser(v["path"])) for v in self.items.values()}
        return sorted(d for d in dirs if d and os.path.isdir(d) and not broad(d))


def run(registry):
    """The loop of a thread of the process."""
    while True:
        try:
            registry.poll()
        except Exception as e:
            sys.stderr.write(f"hub-design: registry: {e}\n")
        time.sleep(TICK)


def report(state_dir):
    """What the journal and its archive hold: designs by author, how many are on the disk. Writes nothing."""
    reg = Registry.__new__(Registry)
    reg.dir, reg.lock, reg.items, reg.seq = state_dir, threading.Lock(), {}, 0
    reg.journal = os.path.join(state_dir, "journal.jsonl")
    for _, _, path in archives(state_dir):
        with open(path, "rb") as f:
            reg.take(f)
    reg.take(read_lines(reg.journal)[0])
    rows = reg.listing()
    by = {}
    for r in rows:
        by[r["session"]] = by.get(r["session"], 0) + 1
    here = [r for r in rows if os.path.exists(os.path.expanduser(r["path"]))]
    print(f"designs: {len(rows)}, on the disk: {len(here)}")
    for name, n in sorted(by.items(), key=lambda x: -x[1])[:15]:
        print(f"  {name or '?'}: {n}")
    return rows


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    base = args[0] if args else (os.environ.get("HUB_STATE_DIR") or os.path.expanduser("~/.hub-core"))
    if "--report" in sys.argv:
        report(base)
    else:
        print(__doc__)
