"""The registry of designs: every design a session ever made or sent, kept by the plugin process.

The start screen used to know only what the page had seen: the tail of the live session feeds, the history of the sessions that exist
right now and a list in the browser's localStorage. A design of a session that was removed, one deeper than the feed tail, one made
before this browser opened the page - gone from the screen. Here the journal is the source: the process reads it once from the very
start (the archive of the core included) and then follows the live journal with its own offset, and keeps one entry per design file in
<state>/hub-design/registry.json. Nothing in the registry is ever dropped because a session is gone; the page hides only a file that is
no longer on the disk.

What counts as a design: a file of a type the canvas opens (.html .htm .pdf .svg) that a session sent to the owner (owner.file, by
its source path) or created with the Write tool. An Edit only refreshes the time of a design that is already there.
A design a script made (a build.py the author ran with Bash, a fork it sent there) never shows in the journal as a file: the folder does. A Bash
command or a fork's brief in the turn of a task that names a path under design/<project>/ makes that folder a work folder of the task; the
files of a design (html, pdf, svg right in it or <name>/index.html) that appeared there after it belong to that task (`adopt`).
Each design also carries the task it was made for (`task`: the id of the root of the chain, d123): the journal says which task a session works
on (the turn of a delegation starts with its number, a reply says "ответ на задачу d123"), and a task raised by a session that works on a
task is its subtask. The dashboard puts all designs of one root task into one folder.
A round of the owner's fix (a note, a dislike) is not a task: the session has none in that turn. The round goes to the task of the design it
fixes: the one the message of the turn names by its path, else the one the file name tells (<name>-2, -3, -2a, .r2, a folder <name>-2/index.html
for <name>.html or <name>/index.html in the same folder).
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
# the core copy of a file sent to the owner (hub send-file): <state>/attachments/<id>/<name>, no assets beside it - never a design, the design is `source`
COPY = re.compile(r"(?:^|/)attachments/[0-9a-f]{12}/[^/]+$", re.I)
WIN_PATH = re.compile(r"^(?:[A-Za-z]:[\\/]|\\\\)")
_EDIT_LINE = re.compile(rb'"name"\s*:\s*"(?:Write|Edit|MultiEdit)"')
_KIND_LINE = re.compile(rb'\.(?:html?|pdf|svg)"', re.I)
_WORK_LINE = re.compile(rb'"name"\s*:\s*"(?:Bash|Agent)"')
_DESIGN_LINE = re.compile(rb'(?:/|\\\\)design(?:/|\\\\)')
_LINE_KIND = re.compile(rb'"(?:delegation\.created|turn\.started)"|"task\.noted".*"title"')
TICK = 3   # s between journal reads
CUR_EVERY = 30   # s: the tasks the sessions work on are saved no oftener (they change with every turn)
VERSION = 4   # 2: the task of a design; 3: a word in the middle of a turn keeps its task; 4: the work folders. An older registry is read again
WORKS = ("Bash", "Agent")   # a command or a fork's brief names the folder a script writes the designs to
KEEP_WORK = 400   # work folders kept: the freshest
SLACK = 120   # s: a file written a little before the command that named its folder was logged
QUOTED = re.compile(r"([\"'])((?:/|~/|[A-Za-z]:[\\/])[^\"'\n]*?)\1")
BARE = re.compile(r"(?:^|[\s=:(])((?:/|~/|[A-Za-z]:[\\/])[^\s\"'`;|&<>(),]+)")
KEEP_TASKS = 1500   # tasks kept besides the roots of the designs
# the task a turn works on, named in the head of its prompt: a reply to a task, an addition, the task itself
TASK_IN_HEAD = re.compile(r"(?:ответ на задачу|к задаче|задач[аеуи]|task)\s+(d\d+)", re.I)
ANY_TASK = re.compile(r"\b(d\d+)\b")   # a bare task id in a message ("to d10 (...)", "pack (d10)"): it names that task if one is known
MID_TURN = re.compile(r"пришл[оа] посреди твоего хода|came in the middle of your turn", re.I)   # the core's note: the same turn goes on
DIR_IN_TEXT = re.compile(r"(?:направлени[еяюи]|direction)\s+[«\"']?([a-z0-9](?:[\w.-]*\w)?)", re.I)   # "Direction <name>. ..." in the words of a task
HEAD = re.compile(r"^\[hub:m\d+(?:x\d+)?\s+от\s")
# a path of a design in the head of a message (no spaces: the head is cut short and a path with spaces is not told from the text)
PATH_IN_HEAD = re.compile(r"(?:[A-Za-z]:[\\/]|/)[^\s\"'<>()]+\.(?:html?|pdf|svg)\b", re.I)
# the end of a name that makes it a round of another file: -2, -12, -2a, _v2, -r2, .r2
ROUND = re.compile(r"(?:[-_.]r|[-_]v|-)\d+[a-z]?$", re.I)
TITLE_MAX = 70


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
    if TEMP.search(k) or COPY.search(k) or SKIP_PARTS & set(k.split("/")):
        return None
    return p


def broad(directory):
    """A folder too wide to be a design's own: the home folder or above it, a disk root."""
    real = os.path.realpath(directory)
    home = os.path.realpath(os.path.expanduser("~"))
    return os.path.dirname(real) == real or real == home or home.startswith(real.rstrip(os.sep) + os.sep)


def clean_title(text, words=False):
    """A short name of a task: its title, or (words) the first sentence of its words (`--title` sticks to the context of some)."""
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    if t.startswith("--title "):
        t = t[8:].strip()
    if words and (i := re.search(r"[.!?](?:\s|$)", t)) and i.start() >= 12:
        t = t[:i.start()]
    if len(t) > TITLE_MAX:
        cut = t[:TITLE_MAX]
        for sep in (". ", "! ", "? ", ": ", ", "):
            i = cut.rfind(sep)
            if i >= 25:
                cut = cut[:i]
                break
        else:
            cut = cut.rsplit(" ", 1)[0] if " " in cut else cut
        t = cut.rstrip(" .,:;—-") + "…"
    return t


TASK_MIN = 2   # designs a task needs to get a folder of its own: one design lies where it lay


def task_folders(rows, minimum=TASK_MIN):
    """The ids of the tasks that have a folder: those with at least `minimum` of the designs (rows have a `task`)."""
    count = {}
    for r in rows:
        if r.get("task"):
            count[r["task"]] = count.get(r["task"], 0) + 1
    return {k for k, n in count.items() if n >= minimum}


def round_parents(key):
    """The keys a file could be a round of: its name without the round endings, the nearest first (bf-01-2 -> bf-01 -> bf).
    A design in a folder (<dir>/index.html) is named by the folder: kolo-2/index.html is a round of kolo/index.html."""
    where, _, base = key.rpartition("/")
    stem, ext = os.path.splitext(base)
    folder = stem.lower() == "index" and where.count("/") >= 1
    unit, head = (where.rpartition("/")[2], where.rpartition("/")[0]) if folder else (stem, where)
    out = []
    while (m := ROUND.search(unit)) and m.start() > 0:
        unit = unit[:m.start()]
        out.append(f"{head}/{unit}/{base}" if folder else f"{head}/{unit}{ext}")
    return out


def round_task(items, key):
    """The task of the first version of a round, told by the file name; None if the name is no round or its first version has no task."""
    for parent in round_parents(key):
        if (items.get(parent) or {}).get("task"):
            return items[parent]["task"]
    return None


def inherit_rounds(items):
    """A registry saved before rounds were told: the designs without a task take the one of the file they are a round of."""
    changed = False
    for k, v in items.items():
        if not v.get("task") and (t := round_task(items, k)):
            v["task"] = t
            changed = True
    return changed


def note_edit(items, state, ev):
    """A message (not a task) that names the path of a known design: the session fixes that design in this turn. Any other message ends it;
    a wake-up of the session (a background job ended) keeps it."""
    head = str((ev.get("data") or {}).get("prompt_head") or "")
    session = ev.get("entity") or ""
    if not HEAD.match(head):
        return
    edit = state.setdefault("edit", {})
    for m in PATH_IN_HEAD.finditer(head):
        k = key_of(m[0])
        if k in items:
            edit[session] = k
            return
    edit.pop(session, None)


def edit_task(items, state, session):
    """The task of the design the session fixes now (or of the file it is a round of)."""
    k = state.get("edit", {}).get(session)
    if not k:
        return None
    return (items.get(k) or {}).get("task") or round_task(items, k)


def new_state():
    """What the fold keeps besides the designs: the tasks {id: {title, by, who, ts, root}}, the task each session works on now, the design
    (key) each session fixes now - the one its last message named - and the work folders {folder: [[task, session, ts], ...]}."""
    return {"tasks": {}, "cur": {}, "edit": {}, "work": {}}


def project_folder(path):
    """<...>/design/<project> of a path under it (the deepest "design"), else "": the folder a design of a script lies in."""
    p = str(path or "").strip().replace("\\", "/")
    if not p or not native(path.strip()):
        return ""
    parts = p.split("/")
    i = max((n for n, x in enumerate(parts) if x == "design"), default=-1)
    if i < 0 or i + 1 >= len(parts) or not parts[i + 1] or parts[i + 1].startswith("."):
        return ""
    if i + 2 == len(parts) and os.path.splitext(parts[i + 1])[1]:   # a file right in design/, not a folder of a project
        return ""
    folder = "/".join(parts[:i + 2])
    k = key_of(folder)
    if TEMP.search(k) or SKIP_PARTS & set(k.split("/")):
        return ""
    return folder


def paths_in(text):
    """The absolute paths a command or a brief names: quoted ones whole (a path may hold spaces), others up to a space."""
    t = str(text or "")
    out = [m[2] for m in QUOTED.finditer(t)]
    out += [m[1] for m in BARE.finditer(QUOTED.sub(" ", t))]
    return out


def note_work(state, ev):
    """A Bash command or a fork's brief in the turn of a task: the design/<project> folders it names are work folders of the task."""
    session = ev.get("entity") or ""
    if session not in state["cur"] or (state["tasks"].get(state["cur"][session]) or {}).get("who") != session:
        return False   # only the one who does the task makes its designs: the one who raised it or checks on it only looks in
    task, ts = root_of(state, state["cur"][session]), float(ev.get("ts") or 0)
    inp = (ev.get("data") or {}).get("input") or {}
    folders = dict.fromkeys(f for f in map(project_folder, paths_in(inp.get("command") or inp.get("prompt"))) if f)
    work, changed = state.setdefault("work", {}), False
    for f in folders:
        rows = work.setdefault(key_of(f), [])
        if rows and rows[-1][0] == task:   # the same task goes on there
            continue
        rows.append([task, session, ts])
        del rows[:-5]
        changed = True
    return changed


def work_task(rows, mtime):
    """[task, session] of the last task that named the folder before the file appeared, else None."""
    best = None
    for task, session, ts in rows:
        if ts - SLACK <= mtime:
            best = [task, session]
    return best


def designs_in(folder):
    """The files of designs in a work folder: html, pdf, svg right in it and <name>/index.html. (path, mtime)."""
    base = os.path.expanduser(folder)
    try:
        names = os.listdir(base)
    except OSError:
        return []
    out = []
    for n in names:
        if n.startswith("."):
            continue
        full = os.path.join(base, n)
        for f in ((full,) if n.lower().endswith(KINDS) else (os.path.join(full, "index.html"),) if os.path.isdir(full) else ()):
            try:
                out.append((f, os.path.getmtime(f)))
            except OSError:
                pass
    return out


def adopt(items, state):
    """The designs a script made in the work folders of tasks: a new entry with the task, or the task for a known one that has none. True if changed."""
    changed = False
    for folder, rows in list((state.get("work") or {}).items()):
        for path, mtime in designs_in(folder):
            got = work_task(rows, mtime)
            if not got:
                continue
            path = design_path(path)
            if not path:
                continue
            k = key_of(path)
            cur = items.get(k)
            if cur:
                if not cur.get("task"):
                    cur["task"] = got[0]
                    changed = True
                continue
            items[k] = {"path": path, "session": got[1], "ts": mtime, "last": mtime, "rank": 2, "task": got[0]}
            changed = True
    return changed


def root_of(state, did):
    t = state["tasks"].get(did)
    return (t or {}).get("root") or did


def fold_task(state, ev):
    """The events about tasks: a task is raised, gets a title, a turn starts on it. True if something changed."""
    kind, data, ts = ev.get("type"), ev.get("data") or {}, float(ev.get("ts") or 0)
    tasks, cur = state["tasks"], state["cur"]
    if kind == "delegation.created":
        did = f"d{ev.get('seq')}"
        by, who = data.get("for_session") or "", data.get("session") or ""
        parent = cur.get(by) if by else None
        about = DIR_IN_TEXT.search(str(data.get("context") or ""))   # raised by the hub for a direction: the direction is in its words
        tasks[did] = {"title": clean_title(data.get("title")) or clean_title(data.get("context"), words=True), "by": by, "who": who, "ts": ts,
                      "root": root_of(state, parent) if parent else did, **({"dir": about[1]} if about else {})}
        return True
    if kind == "task.noted":
        title = clean_title(data.get("title"))
        t = tasks.get(ev.get("entity") or "")
        if title and t and t["title"] != title:
            t["title"] = title
            return True
        return False
    if kind == "turn.started":
        session = ev.get("entity") or ""
        marker, head = str(data.get("marker") or ""), str(data.get("prompt_head") or "")
        did = "d" + marker[1:] if re.fullmatch(r"m\d+", marker) else ""
        if did not in tasks:
            m = TASK_IN_HEAD.search(head)
            did = m[1].lower() if m else ""
        if did not in tasks:
            did = next((x.lower() for x in ANY_TASK.findall(head) if x.lower() in tasks), "")
        if did in tasks:
            new = did
        elif MID_TURN.search(head):   # a word that came in the middle of a turn: the turn and its task go on
            return False
        elif HEAD.match(head):   # some other message (the owner, the schedule, the core): not a task of this session
            new = None
        else:   # the session woke by itself (a background job ended): the same task goes on
            return False
        if new:
            cur[session] = new
        else:
            cur.pop(session, None)
        return False   # the designs did not change; the page does not need to know where a session works
    return False


def fold(items, ev, state=None):
    """Take one journal event into the entries {key: {path, session, ts, last, rank, task}}. True if something changed."""
    if not isinstance(ev, dict):
        return False
    kind, data, ts = ev.get("type"), ev.get("data") or {}, float(ev.get("ts") or 0)
    if state is None:
        state = new_state()
    if kind in ("delegation.created", "task.noted", "turn.started"):
        if kind == "turn.started":
            note_edit(items, state, ev)
        return fold_task(state, ev)
    if kind == "turn.tool" and data.get("name") in WORKS:
        note_work(state, ev)
        return False
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
    task = root_of(state, state["cur"][session]) if session in state["cur"] else None
    cur = items.get(k)
    if not task and not (cur or {}).get("task"):   # no task of its own in this turn: a round of a design takes the task of that design
        task = edit_task(items, state, session) or round_task(items, k)
    if not cur:
        items[k] = {"path": path, "session": session or "", "ts": ts, "last": ts, "rank": rank, **({"task": task} if task else {})}
        return True
    before = dict(cur)
    cur["last"] = max(cur["last"], ts)
    if rank > cur["rank"] or rank == cur["rank"] and ts >= cur["ts"]:
        cur.update(session=session or cur["session"], ts=ts, rank=rank)
    if task:   # the last task that made or sent the file
        cur["task"] = task
    return cur != before


def candidates(chunk):
    """Lines of the journal worth parsing: a cheap look at the bytes first (the archive is hundreds of megabytes of tool results)."""
    for line in chunk:
        if b"owner.file" in line or _LINE_KIND.search(line):
            yield line
        elif b"turn.tool" in line and (_EDIT_LINE.search(line) and _KIND_LINE.search(line) or _WORK_LINE.search(line) and _DESIGN_LINE.search(line)):
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
        self.state, self.saved_cur, self.saved_at = new_state(), {}, 0.0
        self.moves = None
        self.adopted_at = 0.0
        try:
            with open(self.path, encoding="utf-8") as f:
                saved = json.load(f)
            self.items = {key_of(v["path"]): v for v in saved.get("items", [])
                          if isinstance(v, dict) and v.get("path") and not COPY.search(key_of(v["path"]))}
            if saved.get("v") == VERSION:
                self.seq = int(saved.get("seq") or 0)
                self.state = {"tasks": {k: v for k, v in (saved.get("tasks") or {}).items() if isinstance(v, dict)},
                              "cur": {k: v for k, v in (saved.get("cur") or {}).items() if isinstance(v, str)},
                              "edit": {k: v for k, v in (saved.get("edit") or {}).items() if isinstance(v, str)},
                              "work": {k: v for k, v in (saved.get("work") or {}).items() if isinstance(v, list)}}
            # an older registry knew no tasks: the journal is read once more from the very start, the designs stay
            inherit_rounds(self.items)
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            pass

    def pruned_tasks(self, keep):
        """The tasks worth keeping: the roots of the designs kept, the tasks sessions work on now and the freshest ones."""
        with self.lock:
            tasks, cur = self.state["tasks"], self.state["cur"]
            need = {v.get("task") for v in keep} | set(cur.values()) | {tasks[c]["root"] for c in cur.values() if c in tasks}
            fresh = sorted(tasks, key=lambda k: tasks[k]["ts"], reverse=True)[:KEEP_TASKS]
            return {k: tasks[k] for k in set(fresh) | need if k in tasks}

    def save(self):
        keep = sorted(self.items.values(), key=lambda v: v["last"], reverse=True)[:KEEP]
        tasks = self.pruned_tasks(keep)
        with self.lock:
            self.state["tasks"] = tasks
            cur, edit = dict(self.state["cur"]), dict(self.state.get("edit") or {})
            work = self.state.get("work") or {}
            work = dict(sorted(work.items(), key=lambda kv: kv[1][-1][2] if kv[1] else 0)[-KEEP_WORK:])
            self.state["work"] = work
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"v": VERSION, "seq": self.seq, "items": keep, "tasks": tasks, "cur": cur, "edit": edit, "work": work}, f, ensure_ascii=False)
        os.replace(tmp, self.path)
        self.saved_cur, self.saved_at = cur, time.time()

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
                changed |= fold(self.items, ev, self.state)
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
        if first_look or c or time.time() - self.adopted_at > CUR_EVERY:   # a script writes without a word in the journal: look now and then
            with self.lock:
                changed |= adopt(self.items, self.state)
            self.adopted_at = time.time()
        changed |= self.relocate()
        if first_look or top > self.seq:
            self.seq = max(self.seq, top)
        if changed or first_look or (self.state["cur"] != self.saved_cur and time.time() - self.saved_at > CUR_EVERY):
            self.save()
        self.ready = True
        return changed

    def relocate(self):
        """The designs layout.py moved to their task folders: an entry follows its file (the journal still names the old place). True if one moved."""
        if self.moves is None:
            import layout
            self.moves = layout.Moves(self.dir)
        self.moves.fresh()
        if not self.moves.files and not self.moves.dirs:
            return False
        changed = False
        with self.lock:
            for k in list(self.items):
                v = self.items[k]
                new = self.moves.remap(v["path"])
                if new == v["path"]:
                    continue
                nk = key_of(new)
                if nk == k:
                    continue
                del self.items[k]
                had = self.items.get(nk)
                if had:   # the journal knows the new place too: one entry, the freshest marks
                    had["last"] = max(had["last"], v["last"])
                    if v.get("task") and not had.get("task"):
                        had["task"] = v["task"]
                else:
                    self.items[nk] = {**v, "path": new}
                changed = True
        return changed

    def listing(self):
        with self.lock:
            return sorted((dict(v) for v in self.items.values()), key=lambda v: v["last"], reverse=True)

    def task_rows(self):
        """The tasks the designs belong to: {id, title, by, who, ts, dir?} - the roots of the chains (dir: the direction the hub named)."""
        with self.lock:
            ids = {v.get("task") for v in self.items.values()}
            return [{"id": k, "title": t.get("title") or "", "by": t.get("by") or "", "who": t.get("who") or "", "ts": t.get("ts") or 0,
                     **({"dir": t["dir"]} if t.get("dir") else {})}
                    for k, t in self.state["tasks"].items() if k in ids]

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
    reg.dir, reg.lock, reg.items, reg.seq, reg.state = state_dir, threading.Lock(), {}, 0, new_state()
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
