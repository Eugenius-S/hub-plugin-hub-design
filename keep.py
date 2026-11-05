"""Versions of a design: the current one and up to PAST (3) past ones stay, the older ones go to the trash of Hub Design (organize.py:
<state>/hub-design/trash/<date>/<run>/, every action is a row of the select log and can be undone). The trash is emptied for good after a day.

What a version is (the way the plugin already counts them):
- a round of a design: a file or a folder of its own named by the design and an ending (<name>-2, <name>-3f, <name>_v2, <name>-r2) next to the others of
  the same name, <name>/index.html, <name>-2/index.html... Newest by the time of the file is current. An ending of one or two digits (-2, -12) is a
  round only when the design without it lies there too (series bf-post-04, bf-post-05 are different designs; a zero-led number never is a round);
  an ending with a letter (-3f) or v/r (-v2, -r2) is a round on its own;
- a hand-edit copy of the canvas (<name>.r<N>.html beside the design): the 3 newest copies stay;
- a pull of Claude Design (<project>/claude-design/<YYYYMMDD-HHMMSS>/): the 4 newest pulls stay.

A version younger than MIN_AGE is never touched (a designer may be working on it); a file the page does not serve, a folder that is a working folder of a
session and anything outside a folder named design are left alone. It runs when the plugin starts and a while after a new design shows up.

    python3 keep.py --dry   [state dir]   the plan (what goes to the trash, how many MB), nothing is moved
    python3 keep.py --apply [state dir]   do it
    python3 keep.py --purge [state dir]   empty the trash older than a day (--apply does it too)
The hub code must be on PYTHONPATH."""
import json
import os
import re
import shutil
import sys
import time

import layout
import organize
import registry

PAST = 3                 # past versions that stay beside the current one
MIN_AGE = 3 * 3600       # s: a version touched later than this is left alone
TRASH_AGE = 24 * 3600    # s: the trash is emptied after this
ROUND = re.compile(r"(?:-|_v)(?P<n>\d{1,2})(?P<v>[a-z])$", re.I)   # <name>-3f, <name>_v2a: variants of one round (alternatives, not versions)
PULL = re.compile(r"^\d{8}-\d{6}(?:-\d+)?$")
STRONG = re.compile(r"^(?P<root>.+?)(?:[-_]v\d+[a-z]?|[-_]r\d+|-\d{1,2}[a-z])$", re.I)
PLAIN = re.compile(r"^(?P<root>.+?)-(?!0)\d{1,2}$")


def key(path):
    return registry.key_of(path)


def designs_area(path):
    """Only what lies in a folder named design (the rule of layout.py and organize.py): the rest is somebody's working folder."""
    return "design" in key(path).split("/")[:-1]


def mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


def size_of(path):
    if os.path.isfile(path):
        try:
            return os.path.getsize(path)
        except OSError:
            return 0
    total = 0
    for here, _, files in os.walk(path):
        for n in files:
            try:
                total += os.path.getsize(os.path.join(here, n))
            except OSError:
                pass
    return total


def pull_of(path):
    """(the folder claude-design, the pull folder) of a file inside <...>/claude-design/<stamp>/, else None."""
    parts = path.replace("\\", "/").split("/")
    for i in range(len(parts) - 2, 0, -1):
        if parts[i - 1] == "claude-design" and PULL.match(parts[i]):
            return "/".join(parts[:i - 1] + ["claude-design"]), "/".join(parts[:i + 1])
    return None


def unit_of(path, ctx):
    """What a design file is a version of: {kind: dir|file|pull, parent, name, main, src}; None for a copy of the canvas or a file that is no design."""
    base = os.path.basename(path)
    if not base.lower().endswith(organize.DESIGNS) or base.startswith(".") or organize.is_copy(base) or not designs_area(path):
        return None
    pulled = pull_of(path)
    if pulled:
        return {"kind": "pull", "parent": pulled[0], "name": os.path.basename(pulled[1]), "main": pulled[1], "src": pulled[1]}
    folder = os.path.dirname(path)
    if base.lower() == "index.html" and os.path.basename(folder).lower() != "design" and key(folder) not in ctx.keep:
        return {"kind": "dir", "parent": os.path.dirname(folder), "name": os.path.basename(folder), "main": path, "src": folder}
    return {"kind": "file", "parent": folder, "name": os.path.splitext(base)[0], "main": path, "src": path, "ext": os.path.splitext(base)[1].lower()}


def siblings(parent, ctx):
    """Every unit that lies in a folder: the folders with an index.html, the loose designs, the pulls."""
    out = []
    try:
        names = sorted(os.listdir(parent))
    except OSError:
        return out
    for n in names:
        p = os.path.join(parent, n)
        if n.startswith(".") or n in organize.SKIP_DIRS:
            continue
        if os.path.isdir(p):
            if PULL.match(n) and os.path.basename(parent) == "claude-design":
                found = sorted(organize.designs_under(p).values())
                if found:
                    out.append({"kind": "pull", "parent": parent, "name": n, "main": p, "src": p})
                continue
            idx = os.path.join(p, "index.html")
            if os.path.isfile(idx):
                u = unit_of(idx, ctx)
                if u and u["kind"] == "dir":
                    out.append(u)
        elif os.path.isfile(p):
            u = unit_of(p, ctx)
            if u and u["kind"] == "file":
                out.append(u)
    return out


def root_of(unit, names):
    """The name of the design the unit is a round of (its own name when it is the design itself); names: the names of the units beside it (lower)."""
    name = unit["name"]
    m = STRONG.match(name)
    if m:
        return m["root"]
    m = PLAIN.match(name)
    if m and m["root"].lower() in names:
        return m["root"]
    return name


def stamp(unit):
    """When the version was made: the time of its file (of its folder's index.html); a pull - by its name (the time it was pulled)."""
    if unit["kind"] == "pull":
        return mtime(unit["src"])
    return mtime(unit["main"])


def families(units):
    """{(parent, kind, ext, root lower): [units, newest first]}."""
    by_place = {}
    for u in units:
        by_place.setdefault((u["parent"], u["kind"], u.get("ext", "")), []).append(u)
    out = {}
    for (parent, kind, ext), group in by_place.items():
        names = {u["name"].lower() for u in group}
        for u in group:
            out.setdefault((parent, kind, ext, "" if kind == "pull" else root_of(u, names).lower()), []).append(u)
    for members in out.values():
        if members[0]["kind"] == "pull":
            members.sort(key=lambda u: u["name"], reverse=True)
        else:
            members.sort(key=lambda u: (stamp(u), u["name"]), reverse=True)
    return out


def copies_of(unit):
    """The hand-edit copies of a design, newest first: [(n, path)]."""
    if unit["kind"] == "pull":
        return []
    folder = os.path.dirname(unit["main"])
    stem, ext = os.path.splitext(os.path.basename(unit["main"]))
    out = []
    try:
        names = os.listdir(folder)
    except OSError:
        return out
    for n in names:
        c = layout.COPY_OF.match(n)
        if c and c["stem"] == stem and c["ext"].lower() == ext.lower():
            out.append((int(c["n"]), os.path.join(folder, n)))
    return sorted(out, reverse=True)


def designs_of(unit):
    """The design files to tick so that organize puts the unit into the trash whole; None when the folder also holds designs of other units
    (a design inside a design: they would go with it) - such a unit stays."""
    if unit["kind"] == "file":
        return [unit["main"]]
    inner = sorted(organize.designs_under(unit["src"]).values())
    if unit["kind"] == "dir" and any(os.path.dirname(f) != unit["src"] for f in inner):
        return None
    return inner


def protected(members, marks):
    """The units of a family that are never trashed -> {id(unit): reason}: "liked" (the owner pressed ❤️ in Telegram), "sent" (the owner got the file,
    hub send-file); and when the family has lettered variants (-2a, -2b, -3a: alternatives of a round), "round" for the variants of the last round
    while none of them is liked (the owner has not chosen yet). Once one is liked, the other variants of that round are past versions like the rest.
    marks: {design key: {sent, liked}} (the registry)."""
    def has(u, flag):
        return any((marks.get(key(p)) or {}).get(flag) for p in (designs_of(u) or [u["main"]]))
    out = {}
    for u in members:
        for flag in ("liked", "sent"):
            if has(u, flag):
                out[id(u)] = flag
                break
    rounds = {}
    for u in members:
        m = ROUND.search(u["name"])
        if m:
            rounds.setdefault(int(m["n"]), []).append(u)
    if rounds:
        last = rounds[max(rounds)]
        if not any(has(u, "liked") for u in last):
            for u in last:
                out.setdefault(id(u), "round")
    return out


def plan(paths, ctx, past=PAST, now=None, extra_parents=(), min_age=MIN_AGE, marks=None):
    """paths: the design files the plugin knows (the registry); extra_parents: folders to look into besides the ones of the paths.
    marks: {design key: {sent, liked}} - what the owner got or liked is kept (see protected).
    -> {families: n, versions: n, units: [{src, kind, name, keep: [names], size}], paths: [files to tick], bytes, copies: n}"""
    now = now or time.time()
    parents, seen = {}, set()
    for p in paths:
        p = os.path.realpath(os.path.expanduser(str(p)))
        u = unit_of(p, ctx) if os.path.exists(p) else None
        if u:
            parents[(u["parent"], u["kind"] == "pull")] = 1
    for d in extra_parents:
        parents[(d, False)] = 1
    found = []
    for (parent, _) in parents:
        for u in siblings(parent, ctx):
            if (u["parent"], u["name"], u["kind"]) not in seen:
                seen.add((u["parent"], u["name"], u["kind"]))
                found.append(u)
    out = {"families": 0, "versions": 0, "units": [], "paths": [], "bytes": 0, "copies": 0, "kept": {"sent": 0, "liked": 0, "round": 0}}
    marks = marks or {}
    gone = []
    for members in families(found).values():
        if len(members) < 2:
            continue
        out["families"] += 1
        out["versions"] += len(members)
        held = protected(members, marks)
        for u in members[past + 1:]:
            if now - stamp(u) < min_age:
                continue
            if id(u) in held:
                out["kept"][held[id(u)]] += 1
                continue
            tick = designs_of(u)
            if not tick:
                continue
            gone.append(u)
            out["units"].append({"src": u["src"], "kind": u["kind"], "name": u["name"], "keep": [m["name"] for m in members[:past + 1]], "size": size_of(u["src"])
                                 + sum(size_of(c) for _, c in copies_of(u))})
            out["paths"] += tick
    gone_dirs = [u["src"] for u in gone if u["kind"] != "file"]
    gone_files = {u["main"] for u in gone if u["kind"] == "file"}
    for u in found:   # the copies of what stays: the newest few
        if u in gone or u["main"] in gone_files or any(key(u["src"]).startswith(key(d) + "/") for d in gone_dirs):
            continue
        for n, c in copies_of(u)[past:]:
            if now - mtime(c) < min_age:
                continue
            out["paths"].append(c)
            out["copies"] += 1
            out["bytes"] += size_of(c)
            out["units"].append({"src": c, "kind": "copy", "name": os.path.basename(c), "keep": [], "size": size_of(c)})
    out["bytes"] += sum(x["size"] for x in out["units"] if x["kind"] != "copy")
    return out


def purge(state_dir, now=None, age=TRASH_AGE):
    """Empty the trash of runs older than age. -> {runs: n, bytes: n}. A run is named by the time it was made (organize.new_id)."""
    now = now or time.time()
    base = os.path.join(state_dir, "hub-design", "trash")
    runs, total = 0, 0
    try:
        days = sorted(os.listdir(base))
    except OSError:
        return {"runs": 0, "bytes": 0}
    for day in days:
        dpath = os.path.join(base, day)
        if not os.path.isdir(dpath):
            continue
        for run in sorted(os.listdir(dpath)):
            try:
                at = int(run.split("-", 1)[0], 16) / 1000.0
            except ValueError:
                at = mtime(os.path.join(dpath, run))
            if now - at < age:
                continue
            total += size_of(os.path.join(dpath, run))
            shutil.rmtree(os.path.join(dpath, run), ignore_errors=True)
            runs += 1
        try:
            os.rmdir(dpath)
        except OSError:
            pass
    return {"runs": runs, "bytes": total}


def sweep(state_dir, paths, ctx, past=PAST, now=None, extra_parents=(), dry=False, marks=None):
    """One pass: the plan and, unless dry, the move of the old versions to the trash and the emptying of the old trash.
    -> {**plan, id: the action to undo (None), deleted: n, skipped: n, purged: {runs, bytes}}"""
    p = plan(paths, ctx, past, now, extra_parents, marks=marks)
    out = {**p, "id": None, "deleted": 0, "skipped": 0, "purged": {"runs": 0, "bytes": 0}}
    if dry:
        return out
    if p["paths"]:
        try:
            res = organize.delete(state_dir, p["paths"], ctx, now)
            out["id"] = res["id"]
            out["deleted"] = len(res["deleted"])
            out["skipped"] = len(res["skipped"])
        except organize.Refused:
            pass
    out["purged"] = purge(state_dir, now)
    return out


def mb(n):
    return round(n / 1048576.0, 1)


def text_of(p, home=os.path.expanduser("~")):
    short = (lambda x: "~" + x[len(home):] if home and x.startswith(home) else x)
    k = p.get("kept") or {}
    lines = [f"designs with versions: {p['families']}, versions: {p['versions']}, to the trash: {len(p['units'])} ({p['copies']} copies of the canvas), {mb(p['bytes'])} MB; "
             f"kept besides the newest: liked {k.get('liked', 0)}, sent to the owner {k.get('sent', 0)}, last round of variants {k.get('round', 0)}"]
    for u in sorted(p["units"], key=lambda x: x["src"]):
        lines.append(f"  {short(u['src'])}  {mb(u['size'])} MB" + (f"  (stay: {', '.join(u['keep'])})" if u["keep"] else ""))
    return "\n".join(lines) + "\n"


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    state = args[0] if args else (os.environ.get("HUB_STATE_DIR") or os.path.expanduser("~/.hub-core"))
    os.environ.setdefault("HUB_STATE_DIR", state)
    if "--purge" in argv:
        print(json.dumps(purge(state)))
        return 0
    if "--dry" in argv or "--apply" in argv:
        import server   # the folders the plugin serves and the designs it knows
        server.REG = registry.Registry(state)
        server.REG.poll()   # the marks (sent, liked) come from the journal: an older registry is read again once
        paths, extra = server.keep_inputs(deep=True)
        res = sweep(state, paths, server.organize_ctx(), dry="--dry" in argv, extra_parents=extra, marks=server.keep_marks())
        os.makedirs(os.path.join(state, "hub-design"), exist_ok=True)
        with open(os.path.join(state, "hub-design", "keep-plan.txt"), "w", encoding="utf-8") as f:
            f.write(text_of(res))
        print(text_of(res).split("\n", 1)[0])
        if "--apply" in argv:
            print(f"moved to the trash: {res['deleted']}, skipped: {res['skipped']}, undo id: {res['id']}, trash emptied: {res['purged']}")
        return 0
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
