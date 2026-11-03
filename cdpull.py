"""Hub Design: pull a Claude Design project to disk and print a link that opens it in Hub Design (no visit to claude.ai).

    python3 cdpull.py "<claude.ai/design/p/<id> link | project id | project name>" [--out DIR] [--page URL] [--list]

The project comes through the Claude Design MCP (https://api.anthropic.com/v1/design/mcp): list_files, then every file - html through
read_file (the server rewrites html on the way out, read_file is the source), the rest as the exact bytes from the render_preview serve_url.
The sign-in is the one Claude Code already holds (macOS Keychain "Claude Code-credentials", else ~/.claude/.credentials.json, key designOauth).
The token is only read: never refreshed (a refresh here would break the sign-in of Claude Code) and never printed.

Files go to <out>/<project slug>/claude-design/<YYYYMMDD-HHMMSS>/ (out: --out, $HUB_DESIGN_PULL_OUT, else ~/design). A pull of a project that is
unchanged since the last one reuses that folder; a changed one is a new folder beside, the old one stays. The last line printed is the link
<hub page>/#/x/hub-design?open=<entry file>, served by the plugin over http (a file:// page cannot load its own files).

Exit codes: 0 done, 2 not found / ambiguous name, 3 no sign-in or it expired, 4 the service refused or failed."""
import argparse
import getpass
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

URL = "https://api.anthropic.com/v1/design/mcp"
PROTOCOL = "2025-06-18"
KEYCHAIN = "Claude Code-credentials"
KEY = "designOauth"
PAGE_LINES = 100000
MANIFEST = ".cdpull.json"
HTML = (".html", ".htm")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
HEADER = re.compile(r"^<untrusted-project-content ([^>]*)>\n", re.S)
TAIL = "</untrusted-project-content>"
RELOGIN = "Sign in to Claude Design in Claude Code (/design-login in an interactive `claude`) and repeat"


class Fail(Exception):
    def __init__(self, msg, code=4):
        super().__init__(msg)
        self.code = code


def _creds_from_keychain():
    if sys.platform != "darwin":
        return None
    try:
        r = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN, "-a", getpass.getuser(), "-w"],
                           capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    return r.stdout if r.returncode == 0 else None


def _creds_from_file():
    try:
        with open(os.path.join(os.path.expanduser("~"), ".claude", ".credentials.json"), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def token(now=None):
    """The access token of Claude Design from what Claude Code stored; Fail if there is none or it has expired. Never prints it."""
    for raw in (_creds_from_keychain(), _creds_from_file()):
        if not raw:
            continue
        try:
            d = json.loads(raw).get(KEY) or {}
        except (ValueError, AttributeError):
            continue
        if not d.get("accessToken"):
            continue
        exp = d.get("expiresAt")
        if exp and exp / 1000 < (now if now is not None else time.time()) + 60:
            raise Fail("The Claude Design sign-in has expired. " + RELOGIN, 3)
        return d["accessToken"]
    raise Fail("No Claude Design sign-in found (key %s in %s). %s" % (KEY, "Keychain" if sys.platform == "darwin" else "~/.claude/.credentials.json", RELOGIN), 3)


class Client:
    """The MCP over streamable HTTP, enough for tools/call. Direct connection: the proxy of the environment breaks TLS for Python on some machines."""

    def __init__(self, tok, url=URL, opener=None):
        self.tok, self.url, self.sid, self.n = tok, url, None, 0
        self.op = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}))
        self.rpc("initialize", {"protocolVersion": PROTOCOL, "capabilities": {}, "clientInfo": {"name": "hub-design-cdpull", "version": "1"}})
        self._post({"jsonrpc": "2.0", "method": "notifications/initialized"}, wait=False)

    def _post(self, body, wait=True):
        h = {"Authorization": "Bearer " + self.tok, "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": PROTOCOL}
        if self.sid:
            h["Mcp-Session-Id"] = self.sid
        try:
            resp = self.op.open(urllib.request.Request(self.url, json.dumps(body).encode(), h), timeout=120)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise Fail("Claude Design refused the sign-in (HTTP %d). %s" % (e.code, RELOGIN), 3)
            raise Fail("Claude Design answered HTTP %d" % e.code)
        except OSError as e:
            raise Fail("Claude Design is unreachable: %s" % e)
        self.sid = resp.headers.get("Mcp-Session-Id") or self.sid
        raw = resp.read().decode("utf-8", "replace")
        if not wait:
            return None
        if "event-stream" in resp.headers.get("Content-Type", ""):
            for ev in raw.split("\n\n"):
                data = "".join(line[5:].strip() for line in ev.split("\n") if line.startswith("data:"))
                if data:
                    j = json.loads(data)
                    if j.get("id") == body["id"]:
                        return j
            raise Fail("Claude Design sent no answer")
        return json.loads(raw)

    def rpc(self, method, params):
        self.n += 1
        j = self._post({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params})
        if "error" in j:
            raise Fail("Claude Design: %s" % (j["error"].get("message") if isinstance(j["error"], dict) else j["error"]))
        return j["result"]

    def call(self, name, args):
        r = self.rpc("tools/call", {"name": name, "arguments": args})
        text = "".join(c.get("text", "") for c in r.get("content", []) if c.get("type") == "text")
        if r.get("isError"):
            raise Fail("%s: %s" % (name, text[:200]))
        return text


def find_project(ref, projects):
    """-> the project dict. A link or an id picks by id; a name by exact match, else by substring (case and spaces ignored). Fail(2) on none or several."""
    ref = ref.strip()
    m = UUID.search(ref)
    if m:
        pid = m.group(0).lower()
        for p in projects:
            if p["id"].lower() == pid:
                return p
        return {"id": pid, "name": pid}   # not in our list (shared with us?): try the id as it is

    def norm(s):
        return re.sub(r"\s+", "", s).lower()
    want = norm(ref)
    exact = [p for p in projects if norm(p["name"]) == want]
    hits = exact or [p for p in projects if want and want in norm(p["name"])]
    if len(hits) == 1:
        return hits[0]
    if not hits:
        raise Fail("No Claude Design project named %r. Projects: %s" % (ref, ", ".join(p["name"] for p in projects) or "none"), 2)
    raise Fail("Several projects match %r: %s. Name one exactly or pass its link." % (ref, "; ".join("%s (%s)" % (p["name"], p["id"]) for p in hits)), 2)


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:48] or "project"


def read_all(c, pid, path):
    """The text of a file through read_file, page by page (offset and limit are lines; a line over 256 KiB cannot be read: Fail)."""
    out, off = [], 1
    while True:
        t = c.call("read_file", {"project_id": pid, "path": path, "offset": off, "limit": PAGE_LINES})
        m = HEADER.match(t)
        if not m:
            raise Fail("read_file %s: unexpected answer" % path)
        a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        body = t[m.end():]
        i = body.rfind(TAIL)
        if i >= 0:
            body = body[:i]
        body = body.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        try:
            first, last = map(int, a["lines"].split("-"))
            total = int(a["total_lines"])
        except (KeyError, ValueError):
            return "".join(out) + body   # no line window in the header: one piece
        out.append(body if body.endswith("\n") or last >= total else body + "\n")
        if last >= total:
            return "".join(out)
        off = last + 1


def serve_base(c, pid, files):
    """(base url, query) of the render_preview serve_url: files lie beside it as they are, byte for byte."""
    first = next((f["path"] for f in files if f["path"].lower().endswith(HTML)), files[0]["path"])
    u = json.loads(c.call("render_preview", {"project_id": pid, "path": first}))["serve_url"]
    return u.split("?")[0].rsplit("/", 1)[0], urllib.parse.urlparse(u).query


def pull_files(c, pid, files, dst, opener=None, log=print):
    """Write every file of the project under dst (a new folder). -> list of paths that came as the server's copy, not the source (a warning)."""
    op = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}))
    base = q = None
    approx = []
    for f in files:
        rel = f["path"]
        if os.path.isabs(rel) or ".." in re.split(r"[\\/]", rel):
            raise Fail("unsafe path in the project: %s" % rel)
        target = os.path.join(dst, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        data, is_html = None, rel.lower().endswith(HTML)

        def from_url():
            nonlocal base, q
            if base is None:
                base, q = serve_base(c, pid, files)
            req = urllib.request.Request(base + "/" + urllib.parse.quote(rel) + "?" + q, headers={"User-Agent": "Mozilla/5.0"})
            return op.open(req, timeout=60).read()
        if not is_html:
            try:
                data = from_url()
                if len(data) != f.get("size", len(data)):
                    data = None
            except (OSError, Fail, ValueError, KeyError):
                data = None
        if data is None:
            try:
                data = read_all(c, pid, rel).encode("utf-8")
            except Fail:
                try:   # a line too long for read_file: the server's copy is better than nothing
                    data = from_url()
                    approx.append(rel)
                except (OSError, Fail, ValueError, KeyError) as e:
                    raise Fail("cannot read %s: %s" % (rel, e))
        with open(target, "wb") as out:
            out.write(data)
    return approx


def digest(root):
    out = {}
    for d, _, names in os.walk(root):
        for n in names:
            if n == MANIFEST:
                continue
            p = os.path.join(d, n)
            with open(p, "rb") as f:
                out[os.path.relpath(p, root).replace(os.sep, "/")] = hashlib.sha256(f.read()).hexdigest()
    return out


def last_version(base):
    try:
        names = sorted(n for n in os.listdir(base) if re.fullmatch(r"\d{8}-\d{6}(-\d+)?", n) and os.path.isdir(os.path.join(base, n)))
    except OSError:
        return None
    return os.path.join(base, names[-1]) if names else None


def entry_file(root):
    """The file to open: index.html at the top, else the first html (shallowest, then by name)."""
    found = []
    for d, _, names in os.walk(root):
        for n in names:
            if n.lower().endswith(HTML):
                p = os.path.join(d, n)
                found.append((os.path.relpath(p, root).count(os.sep), n.lower() != "index.html", p))
    return min(found)[2] if found else None


def link(page, path):
    return "%s/#/x/hub-design?open=%s" % (page.rstrip("/"), urllib.parse.quote(path, safe=""))


def run(ref, out_root, page, client=None, log=print):
    """-> (version folder, entry file or None, link or None, reused: bool, approx: [paths])."""
    c = client or Client(token())
    projects = json.loads(c.call("list_projects", {}))
    proj = find_project(ref, projects)
    pid, name = proj["id"], proj.get("name") or proj["id"]
    files = json.loads(c.call("list_files", {"project_id": pid, "depth": -1}))
    files = [f for f in files if f.get("path") and f.get("type", "file") != "directory"]
    if not files:
        raise Fail("The project %r has no files" % name, 2)
    base = os.path.join(out_root, slug(name), "claude-design")
    os.makedirs(base, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    tmp = os.path.join(base, ".pull-%s-%d" % (stamp, os.getpid()))
    os.makedirs(tmp)
    try:
        approx = pull_files(c, pid, files, tmp, log=log)
        new = digest(tmp)
        prev = last_version(base)
        if prev and digest(prev) == new:
            shutil.rmtree(tmp, ignore_errors=True)
            dst, reused = prev, True
        else:
            dst, reused = os.path.join(base, stamp), False
            n = 1
            while os.path.exists(dst):
                n += 1
                dst = os.path.join(base, "%s-%d" % (stamp, n))
            with open(os.path.join(tmp, MANIFEST), "w", encoding="utf-8") as f:
                json.dump({"project_id": pid, "name": name, "url": proj.get("url"), "pulled": stamp, "files": len(files), "approx": approx}, f, ensure_ascii=False)
            os.rename(tmp, dst)
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    entry = entry_file(dst)
    return dst, entry, (link(page, entry) if entry else None), reused, approx


def default_page():
    return "http://localhost:%s" % (os.environ.get("HUB_WEB_PORT") or 8787)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Pull a Claude Design project and print a Hub Design link")
    ap.add_argument("ref", nargs="?", help="link, project id or project name")
    ap.add_argument("--out", default=os.environ.get("HUB_DESIGN_PULL_OUT") or os.path.join(os.path.expanduser("~"), "design"))
    ap.add_argument("--page", default=default_page(), help="address of the hub page for the link")
    ap.add_argument("--list", action="store_true", help="list the projects and exit")
    a = ap.parse_args(argv)
    try:
        if a.list or not a.ref:
            for p in json.loads(Client(token()).call("list_projects", {})):
                print("%s  %s" % (p["id"], p["name"]))
            return 0
        dst, entry, lnk, reused, approx = run(a.ref, os.path.abspath(os.path.expanduser(a.out)), a.page)
    except Fail as e:
        print("cdpull: %s" % e, file=sys.stderr)
        return e.code
    print("%s: %s" % ("Unchanged, the last pull" if reused else "Saved", dst))
    if approx:
        print("Note: %d html file(s) have a line over 256 KiB; the server's copy was taken: %s" % (len(approx), ", ".join(approx)), file=sys.stderr)
    print(lnk or "No html file in the project: nothing to open on the canvas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
