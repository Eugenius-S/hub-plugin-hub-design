"""What the owner does with the designs he ticked on the start screen: move them to another folder, delete them. Nothing is erased: a deleted
design goes to <state>/hub-design/trash/<date>/<id>/ and a move is recorded as the steps of layout.py (moves.jsonl, by "select"), so the
registry, the posts and the page follow the design to its new place exactly as after layout.py --apply.

Every action is a row of <state>/hub-design/select/log.jsonl ({id, op: move|delete, items: [{src, dst}]}); undo(id) puts it back.

The unit of an action is what lies together: a folder of one design (index.html with its assets, or a task folder when every design in it
is ticked) goes whole; a loose file goes with its hand-edit copies (<name>.r<N>.html). The folder of a direction (<cwd>/design), a folder
named design and the working folder of a session are never moved or deleted as a whole, only what is ticked in them."""
import json
import os
import re
import shutil
import threading
import time

import layout
import registry

DESIGNS = (".html", ".htm", ".pdf", ".svg")
WALK_DEPTH = 6
WALK_FILES = 4000
LOCK = threading.Lock()
SKIP_DIRS = ("assets", "fonts", "node_modules")


class Refused(Exception):
    """The action cannot be done: .code for the http answer, .text for the page (en)."""

    def __init__(self, code, text):
        super().__init__(text)
        self.code, self.text = code, text


class Ctx:
    """What the process knows: allowed(real) - a design we serve; roots - the folders of the sessions and projects (no more than that may be
    moved or deleted as a whole); inside - the folders anything may go into (roots and the design folders)."""

    def __init__(self, allowed, keep, inside):
        self.allowed, self.keep, self.inside = allowed, {registry.key_of(os.path.realpath(k)) for k in keep}, list(inside)


def log_path(state_dir):
    return os.path.join(state_dir, "hub-design", "select", "log.jsonl")


def rows(state_dir):
    out = []
    try:
        with open(log_path(state_dir), encoding="utf-8") as f:
            for line in f:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
    except OSError:
        pass
    return out


def record(state_dir, row):
    os.makedirs(os.path.dirname(log_path(state_dir)), exist_ok=True)
    with open(log_path(state_dir), "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def new_id(now=None):
    return "%x-%s" % (int((now or time.time()) * 1000), os.urandom(2).hex())


def key(path):
    return registry.key_of(path)


def is_copy(name):
    return bool(layout.COPY_OF.match(name))


def designs_under(folder):
    """The designs a folder holds (not the hand-edit copies, not the working files of a design): their keys."""
    found, base = {}, folder.rstrip(os.sep).count(os.sep)
    seen = 0
    for here, subs, files in os.walk(folder):
        subs[:] = [s for s in subs if not s.startswith(".") and s not in SKIP_DIRS and s not in registry.SKIP_PARTS]
        if here.count(os.sep) - base >= WALK_DEPTH:
            subs[:] = []
        for n in files:
            if n.lower().endswith(DESIGNS) and not n.startswith(".") and not is_copy(n):
                found[key(os.path.join(here, n))] = os.path.join(here, n)
        seen += len(files)
        if seen > WALK_FILES:
            break
    return found


def in_design_area(folder):
    parts = key(folder).split("/")
    return "design" in parts[:-1] and parts[-1] != "design"


def units(paths, ctx):
    """[{kind: dir|file, src, files: [the designs of the unit], copies: [...]}] and [{path, why}] of the ones we cannot touch."""
    chosen, bad, out, used = {}, [], [], set()
    for p in paths:
        real = os.path.realpath(os.path.expanduser(str(p or "")))
        if not ctx.allowed(real):
            bad.append({"path": str(p), "why": "denied"})
        else:
            chosen[key(real)] = real
    for k, real in sorted(chosen.items()):
        if k in used:
            continue
        top = None
        d = os.path.dirname(real)
        while in_design_area(d) and key(d) not in ctx.keep:
            found = designs_under(d)
            if not found or any(x not in chosen for x in found):
                break
            top = d
            d = os.path.dirname(d)
        if top:
            files = sorted(designs_under(top).values())
            used |= {key(f) for f in files}
            out.append({"kind": "dir", "src": top, "files": files, "copies": []})
            continue
        stem, ext = os.path.splitext(os.path.basename(real))
        copies = []
        for n in sorted(os.listdir(os.path.dirname(real))):
            c = layout.COPY_OF.match(n)
            if c and c["stem"] == stem and c["ext"].lower() == ext.lower():
                copies.append(os.path.join(os.path.dirname(real), n))
        used.add(k)
        out.append({"kind": "file", "src": real, "files": [real], "copies": copies})
    return out, bad


def free(folder, name, whole=False):
    """name, or name-2, name-3... when the folder has one by that name (whole: a folder, the dot in its name is not an extension)."""
    if not os.path.lexists(os.path.join(folder, name)):
        return name
    stem, ext = (name, "") if whole else os.path.splitext(name)
    n = 2
    while os.path.lexists(os.path.join(folder, "%s-%d%s" % (stem, n, ext))):
        n += 1
    return "%s-%d%s" % (stem, n, ext)


def target(dest, ctx):
    """The folder to move into: inside the folders we serve, no hidden part, made if it is new."""
    text = str(dest or "").strip()
    if not text:
        raise Refused(400, "No folder")
    if not os.path.isabs(os.path.expanduser(text)):
        raise Refused(400, "The folder must be a full path")
    real = os.path.realpath(os.path.expanduser(text))
    for r in ctx.inside:
        base = r.rstrip(os.sep)
        if real == base or real.startswith(base + os.sep):
            rel = real[len(base) + 1:]
            if not any(part.startswith(".") for part in re.split(r"[\\/]", rel) if part):
                return real
    raise Refused(403, "The folder is outside the project and session folders of the hub")


def where(dest, unit, name):
    """Where the unit lands: (new place, the designs of it at the new places)."""
    new = os.path.join(dest, name)
    if unit["kind"] == "dir":
        return new, [os.path.join(new, os.path.relpath(f, unit["src"])) for f in unit["files"]]
    return new, [new]


def move(state_dir, paths, dest, ctx, now=None):
    """Move the ticked designs into dest. -> {id, to, moved: [{from, to}], skipped: [{path, why}], map: {old: new}}"""
    with LOCK:
        place = target(dest, ctx)
        todo, bad = units(paths, ctx)
        if not todo:
            raise Refused(404, "Nothing to move")
        os.makedirs(place, exist_ok=True)
        run, plan, shown, skipped, mapped = new_id(now), [], [], list(bad), {}
        for u in todo:
            src = u["src"]
            if os.path.dirname(src) == place or (u["kind"] == "dir" and (place == src or place.startswith(src + os.sep))):
                skipped.append({"path": src, "why": "same" if os.path.dirname(src) == place else "inside"})
                continue
            name = free(place, os.path.basename(src), u["kind"] == "dir")
            if u["kind"] == "dir":
                new, news = where(place, u, name)
                plan.append({"kind": "dir", "root": place, "dir_from": src, "dir_to": new, "from": u["files"][0], "to": news[0], "copies": [], "assets": [], "rewrite": 0})
                mapped.update({f: n for f, n in zip(u["files"], news)})
                shown.append((src, new))
                continue
            new = os.path.join(place, name)
            stem = os.path.splitext(name)[0]
            copies = []
            for c in u["copies"]:
                m = layout.COPY_OF.match(os.path.basename(c))
                copies.append([c, os.path.join(place, "%s.r%s%s" % (stem, m["n"], m["ext"]))])
            assets, rewrite = ([], 0)
            if src.lower().endswith(layout.HTML):
                assets, rewrite = layout.links(src, place)
                assets = [a for a in assets if layout.key(a[0]) != layout.key(a[1])]
            plan.append({"kind": "file", "root": place, "from": src, "to": new, "copies": copies, "assets": assets, "rewrite": rewrite})
            mapped[src] = new
            shown.append((src, new))
        if not plan:
            return {"id": None, "to": place, "moved": [], "skipped": skipped, "map": {}}
        layout.apply(state_dir, {"moves": plan}, by="select", run=run)
        moved = [{"from": a, "to": b} for a, b in shown if os.path.exists(b)]
        skipped += [{"path": a, "why": "failed"} for a, b in shown if not os.path.exists(b)]
        if moved:
            record(state_dir, {"id": run, "ts": int(now or time.time()), "op": "move", "run": run, "dest": place, "items": [{"src": m["from"], "dst": m["to"]} for m in moved]})
        return {"id": run if moved else None, "to": place, "moved": moved, "skipped": skipped, "map": {a: b for a, b in mapped.items() if os.path.exists(b)}}


def trash_folder(state_dir, run, now=None):
    return os.path.join(state_dir, "hub-design", "trash", time.strftime("%Y-%m-%d", time.localtime(now or time.time())), run)


def delete(state_dir, paths, ctx, now=None):
    """Put the ticked designs into the trash. -> {id, deleted: [{from, to}], skipped}"""
    with LOCK:
        todo, bad = units(paths, ctx)
        if not todo:
            raise Refused(404, "Nothing to delete")
        run, items, skipped = new_id(now), [], list(bad)
        box = trash_folder(state_dir, run, now)
        os.makedirs(box, exist_ok=True)
        for n, u in enumerate(todo):
            for src in [u["src"]] + u["copies"]:
                dst = os.path.join(box, "%d-%s" % (n, os.path.basename(src)))
                try:
                    shutil.move(src, dst)
                except OSError:
                    skipped.append({"path": src, "why": "failed"})
                    continue
                items.append({"src": src, "dst": dst, "main": src == u["src"]})
        if items:
            record(state_dir, {"id": run, "ts": int(now or time.time()), "op": "delete", "items": items})
        else:
            try:
                os.rmdir(box)
            except OSError:
                pass
        return {"id": run if items else None, "deleted": [{"from": i["src"], "to": i["dst"]} for i in items if i["main"]], "skipped": skipped}


def undo(state_dir, id):
    """Put an action back. -> {id, op, restored: n, conflicts: [path]}; Refused if the id is unknown or already undone."""
    with LOCK:
        every = rows(state_dir)
        row = next((r for r in every if r.get("id") == id and r.get("op") in ("move", "delete")), None)
        if not row:
            raise Refused(404, "No such action")
        if any(r.get("op") == "undone" and r.get("id") == id for r in every):
            raise Refused(409, "Already undone")
        if row["op"] == "move":
            layout.undo(state_dir, run=row["run"])
            conflicts = [i["dst"] for i in row["items"] if os.path.exists(i["dst"])]
            restored = len(row["items"]) - len(conflicts)
            back = [(i["dst"], i["src"]) for i in row["items"] if i["dst"] not in conflicts]
        else:
            restored, conflicts, back = 0, [], []
            for i in reversed(row["items"]):
                if os.path.exists(i["dst"]) and not os.path.lexists(i["src"]):
                    os.makedirs(os.path.dirname(i["src"]), exist_ok=True)
                    shutil.move(i["dst"], i["src"])
                    restored += 1
                elif os.path.lexists(i["dst"]):
                    conflicts.append(i["src"])
            try:
                os.rmdir(os.path.dirname(row["items"][0]["dst"]))
            except OSError:
                pass
        if not conflicts:
            record(state_dir, {"op": "undone", "id": id, "ts": int(time.time())})
        return {"id": id, "op": row["op"], "restored": restored, "conflicts": conflicts, "back": back}
