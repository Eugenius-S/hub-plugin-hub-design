"""Designs of the other machines of the same owner: one start screen for several hubs.

Every hub of the owner keeps its own registry of designs (registry.py), so a design made on one machine is not on the start screen of
another. Here the machines meet in a shared folder that something else carries between them (a synced git folder, a cloud folder):
each machine writes <folder>/<its name>/registry.json and a small JPEG shot of every design, and reads the sub-folders of the others.
Only pictures and names travel; the files of the designs stay where they are - the canvas and edits stay on the machine that has them.

The folder: hub.json extensions.<account>:hub-design.peers_dir (the environment variable HUB_DESIGN_PEERS overrides it, "" or false
turns it off). Not set: <hub code>/hub-sync/design, but only when the hub code has a hub-sync/sync.py next to it (a hub that already
syncs itself between machines); otherwise the feature is off and nothing is written anywhere.

<folder>/<machine>/registry.json: {"v": 1, "machine", "os", "hub", "items": [{id, name, file, session, ts, last, stamp, dir, shot}]}; hub - the
name of the hub (hub.json title), dir - the direction the design belongs to (a name, never a path: the start screen of the other machine groups
by it and must not learn the paths of another system); shots are
<folder>/<machine>/shots/<id>.jpg, up to SHOT_WIDTH px wide. A file is rewritten only when its content changed; shots of designs that
are gone are erased."""
import hashlib
import json
import os
import re
import socket
import sys
import time
import unicodedata

FILE = "registry.json"
SHOTS = "shots"
SHOT_WIDTH = 480          # px: a card on the start screen
EXPORT_MAX = 400          # designs exported: the freshest
SHOTS_PER_PASS = 12       # Chrome runs per pass: the first pass over a big registry is spread over several minutes
EVERY = 60                # s between passes
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$")
SHOT_NAME = re.compile(r"^[0-9a-f]{16}\.jpg$")
PEER_MAX = 2000           # items read from one peer
OS_OF = {"darwin": "mac", "win32": "windows", "cygwin": "windows"}


def this_os():
    return OS_OF.get(sys.platform, "linux" if sys.platform.startswith("linux") else sys.platform)


def machine():
    """The name of this machine as a folder name (the host name; anything odd is replaced)."""
    name = re.sub(r"[^A-Za-z0-9._-]", "-", socket.gethostname()).strip(".-") or "machine"
    return name[:80]


def hub_code():
    """The folder of the hub code (the plugin process runs with it on PYTHONPATH), None without a hub."""
    try:
        import core
        return os.path.dirname(os.path.dirname(os.path.abspath(core.__file__)))
    except Exception:
        return None


def folder(config, code=None):
    """The shared folder, None - the feature is off."""
    env = os.environ.get("HUB_DESIGN_PEERS")
    if env is not None:
        path = env.strip()
    else:
        path = None
        for key, val in ((config or {}).get("extensions") or {}).items():
            if isinstance(val, dict) and str(key).rsplit(":", 1)[-1] == "hub-design" and "peers_dir" in val:
                v = val.get("peers_dir")
                path = str(v).strip() if isinstance(v, str) else ""
                break
        if path is None:   # not set: the folder of a hub that syncs itself between machines
            code = code or hub_code()
            sync = os.path.join(code, "hub-sync") if code else ""
            path = os.path.join(sync, "design") if sync and os.path.isfile(os.path.join(sync, "sync.py")) else ""
    return os.path.realpath(os.path.expanduser(path)) if path else None


def _key(p):
    return str(p or "").replace("\\", "/").rstrip("/")


def direction_dirs(sessions, directions):
    """The folders of the directions: [(folder key, label)] - the same rule as directionDirs of lib.js (hub sessions are not directions; several
    directions in one folder - the folder name). sessions: [{name, cwd, role, kind}]; directions: the names of the directions."""
    by = {}
    for s in sessions or []:
        if not isinstance(s, dict) or not s.get("cwd") or s.get("kind") == "hub":
            continue
        if not (s.get("name") in (directions or ()) or s.get("role") == "worker"):
            continue
        by.setdefault(_key(s["cwd"]), []).append(s.get("name") or "")
    out = []
    for key, names in by.items():
        out.append((key, names[0] if len(names) == 1 else (key.rsplit("/", 1)[-1] or names[0])))
    return out


def direction_names(sessions, directions):
    """{folder key: [session names]} of the direction folders (for project_label)."""
    by = {}
    for s in sessions or []:
        if isinstance(s, dict) and s.get("cwd") and s.get("kind") != "hub" and (s.get("name") in (directions or ()) or s.get("role") == "worker"):
            by.setdefault(_key(s["cwd"]), []).append(s.get("name") or "")
    return by


def direction_homes(sessions, directions):
    """{session name: label of its direction folder}: a design made by a direction (or asked for by it) lies in its folder wherever the file is."""
    labels = dict(direction_dirs(sessions, directions))
    homes = {}
    for s in sessions or []:
        if isinstance(s, dict) and s.get("cwd") and s.get("name") and s.get("kind") != "hub" and (s.get("name") in (directions or ()) or s.get("role") == "worker"):
            homes[s["name"]] = labels.get(_key(s["cwd"]), "")
    return homes


def folder_label(path, dirs):
    """The label of the deepest direction folder that holds the file, "" - no direction (the same rule as folderOf of lib.js)."""
    p = _key(path)
    win = len(p) > 1 and p[1] == ":"
    norm = (lambda x: x.lower()) if win else (lambda x: x)
    best, label = "", ""
    for key, name in dirs:
        if norm(p).startswith(norm(key) + "/") and len(key) > len(best):
            best, label = key, name
    return str(label)[:80]


COMMON = {"design", "designs", "template", "templates", "page", "pages", "index", "html", "v1", "v2", "v3", "hub"}


def words_of(s):
    """The words of a name (the same rule as wordsOf of lib.js): lower case, letters and digits, three signs and more, without the words every design folder has."""
    return [w for w in re.findall(r"[^\W_]+", unicodedata.normalize("NFC", str(s or "")).lower()) if len(w) > 2 and w not in COMMON]


def project_of(path):
    """The folder right under "design" in <...>/design/<project>/<file> ("" - the file lies right in "design" or outside it)."""
    parts = [x for x in _key(path).split("/") if x]
    i = max((n for n, x in enumerate(parts) if x == "design"), default=-1)
    return parts[i + 1] if 0 <= i < len(parts) - 2 else ""


def nearest_dir(name, dirs, names=None):
    """The label of the direction a name belongs to (the same rule as nearestDir of lib.js): the words of the name against the words of the direction
    (its label, its folder, its sessions); more shared words win; two directions equally near - "" (no guessing). dirs: [(key, label)], names: {key: [sessions]}."""
    w = set(words_of(name))
    if not w:
        return ""
    best, tie = None, False
    for key, label in dirs:
        own = set()
        for x in list((names or {}).get(key, [])) + [label, key.rsplit("/", 1)[-1]]:
            own.update(words_of(x))
        hit = len(w & own)
        if not hit:
            continue
        score = hit * 100 - (len(own) - hit) - (len(w) - hit)
        if best is None or score > best[0]:
            best, tie = (score, key, label), False
        elif score == best[0] and best[1] != key:
            tie = True
    return str(best[2])[:80] if best and not tie else ""


def project_label(path, title, dirs, names=None):
    """The direction of a design that lies in no direction folder and was made by none: the project folder it was saved in (design/<project>/), else its
    title, else its file name."""
    project = project_of(path)
    label = nearest_dir(project, dirs, names) if project else ""
    if label:
        return label
    base = os.path.splitext(os.path.basename(_key(path)))[0]
    return nearest_dir(title, dirs, names) or nearest_dir(base, dirs, names)


def item_id(path):
    return hashlib.sha1(str(path).replace("\\", "/").lower().encode("utf-8")).hexdigest()[:16]


def read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def write_if_changed(path, text):
    """True if the file was written: the same content is never written again (a synced folder must not churn)."""
    data = text.encode("utf-8")
    try:
        with open(path, "rb") as f:
            if f.read() == data:
                return False
    except OSError:
        pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return True


def export(root, rows, shoot, title=None, stamp=None, me=None, limit=SHOTS_PER_PASS, hub=""):
    """One pass: rows - the registry listing of this machine (only designs whose file is here and may be shown);
    shoot(real, out) writes a JPEG to out (True - done); title(real) - the name of a design; stamp(real) - the edit time of the design.
    Returns {"written": bool, "shot": n, "left": n} - left: designs still without a fresh shot (the next pass takes them)."""
    me = me or machine()
    mine = os.path.join(root, me)
    shots = os.path.join(mine, SHOTS)
    old = {it["id"]: it for it in (read_json(os.path.join(mine, FILE)) or {}).get("items", []) if isinstance(it, dict) and it.get("id")}
    items, shot, left = [], 0, 0
    for r in rows[:EXPORT_MAX]:
        real = os.path.expanduser(r["path"])
        iid = item_id(real)
        try:
            st = stamp(real) if stamp else os.path.getmtime(real)
        except OSError:
            continue
        prev = old.get(iid) or {}
        name = prev.get("name") if prev.get("stamp") == st else None
        if name is None:
            try:
                name = (title(real) if title else "") or ""
            except Exception:
                name = ""
        it = {"id": iid, "name": name, "file": os.path.basename(real), "session": r.get("session") or "", "ts": r.get("ts") or 0,
              "last": r.get("last") or 0, "stamp": st, "dir": str(r.get("dir") or "")[:80], "kind": os.path.splitext(real)[1].lower().lstrip("."), "shot": ""}
        out = os.path.join(shots, iid + ".jpg")
        fresh = prev.get("stamp") == st and prev.get("shot") and os.path.isfile(out)
        if fresh:
            it["shot"] = iid + ".jpg"
        elif prev.get("failed") == st:   # this version could not be shot: no Chrome run every pass for it
            it["failed"] = st
            if prev.get("shot") and os.path.isfile(out):
                it["shot"] = prev["shot"]
        elif shot < limit:
            shot += 1
            os.makedirs(shots, exist_ok=True)
            try:
                ok = shoot(real, out)
            except Exception as e:
                print(f"hub-design: peers: no shot of {real}: {e}", file=sys.stderr, flush=True)
                ok = False
            if ok and os.path.isfile(out):
                it["shot"] = iid + ".jpg"
            else:
                it["failed"] = st
                if prev.get("shot") and os.path.isfile(out):   # the old shot is better than none
                    it["shot"] = prev["shot"]
        else:
            if prev.get("shot") and os.path.isfile(out):
                it["shot"], it["stamp"] = prev["shot"], prev.get("stamp")
            left += 1
        items.append(it)
    keep = {it["shot"] for it in items if it["shot"]}
    try:
        for n in os.listdir(shots):
            if n not in keep and (SHOT_NAME.match(n) or n.endswith(".tmp")):
                os.remove(os.path.join(shots, n))
    except OSError:
        pass
    doc = {"v": 1, "machine": me, "os": this_os(), "hub": str(hub or "")[:80], "items": items}
    written = write_if_changed(os.path.join(mine, FILE), json.dumps(doc, ensure_ascii=False, indent=0, sort_keys=True))
    return {"written": written, "shot": shot, "left": left}


def peers(root, me=None):
    """The other machines in the folder: [{machine, os, items}] - items newest first, each with its shot file name (or "")."""
    me = me or machine()
    out = []
    try:
        names = sorted(os.listdir(root))
    except OSError:
        return out
    for name in names:
        if name == me or not NAME.match(name):
            continue
        doc = read_json(os.path.join(root, name, FILE))
        if not doc or not isinstance(doc.get("items"), list):
            continue
        items = []
        for it in doc["items"][:PEER_MAX]:
            if not isinstance(it, dict) or not isinstance(it.get("id"), str):
                continue
            shot = it.get("shot") if isinstance(it.get("shot"), str) and SHOT_NAME.match(it.get("shot") or "") else ""
            if shot and not os.path.isfile(os.path.join(root, name, SHOTS, shot)):
                shot = ""
            items.append({"id": it["id"][:40], "name": str(it.get("name") or "")[:200], "file": str(it.get("file") or "")[:200],
                          "session": str(it.get("session") or "")[:80], "ts": _num(it.get("ts")), "last": _num(it.get("last")),
                          "kind": str(it.get("kind") or "")[:8], "stamp": _num(it.get("stamp")), "dir": str(it.get("dir") or "")[:80], "shot": shot})
        items.sort(key=lambda x: x["last"] or x["ts"], reverse=True)
        out.append({"machine": name, "os": str(doc.get("os") or "")[:20], "hub": str(doc.get("hub") or "")[:80], "items": items})
    return out


def _num(x):
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else 0


def shot_path(root, name, shot, me=None):
    """The real path of a shot of another machine, None if the names are not ours to serve."""
    if not root or not NAME.match(name or "") or not SHOT_NAME.match(shot or ""):
        return None
    real = os.path.join(root, name, SHOTS, shot)
    return real if os.path.isfile(real) else None


def run(get_root, listing, shoot, title, stamp, ready=lambda: True, every=EVERY, hub=lambda: ""):
    """The loop of a thread of the process: a pass every `every` seconds, sooner while shots are left."""
    while True:
        wait = every
        try:
            root = get_root()
            if root and not ready():
                wait = 5   # the journal is still being read: look again soon, not in a minute
            elif root:
                res = export(root, listing(), shoot, title, stamp, hub=hub())
                if res["left"]:
                    wait = 5
        except Exception as e:
            print(f"hub-design: peers: {e}", file=sys.stderr, flush=True)
        time.sleep(wait)
