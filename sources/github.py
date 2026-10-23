"""The source github.com: a link to a repository of ready design styles (md files) - the repository is cloned (git, shallow) into <library>/sets/ and its
styles are read from the files, no page of a site is asked.

Only repositories that have a reader below are taken (SETS: where the styles lie and what a style is there). Any other repository is refused with a word,
because a made-up reading of a foreign layout would fill the library with files that are not styles. The licence of every set goes into the entry of
its styles (`license`), the owner of the folder answers for the terms of the repository.

A style: <set>--<slug>.md in the folder, an entry "<set>:<slug>" in index.json with "set", "source" (owner/repo) and "license"; a picture of the repository
(when it has one) is copied to previews/sets/<set>/. A style without a picture stays without: the settings page offers to ask a designer for them."""
import json
import os
import re
import shutil
import stat
import subprocess
import time
from urllib.parse import urlparse

from .refero import SourceError

DESC_MAX = 280
CLONE_TIMEOUT = 900
TRIES_STEP = 0.5


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def read(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read().replace("\r\n", "\n")


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "style"


def title(slug):
    return " ".join(w.capitalize() for w in re.split(r"[-_]+", slug) if w)


def frontmatter(text):
    """(top-level fields, body): a simple read of `key: value` and of `key: |` / `key: >` blocks between ---."""
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end < 0:
        return {}, text
    block, body = text[4:end], text[end + 4:].lstrip("\n")
    out, lines, i = {}, block.split("\n"), 0
    while i < len(lines):
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", lines[i])
        i += 1
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val in ("", "|", ">", "|-", ">-", ">+", "|+"):
            chunk = []
            while i < len(lines) and (lines[i].startswith(" ") or not lines[i].strip()):
                chunk.append(lines[i].strip())
                i += 1
            val = " ".join(c for c in chunk if c)
        out[key] = val.strip("\"'")
    return out, body


def first_line(md, limit=700):
    """The first meaningful line of a text: not a heading, a table, code, yaml or a comment."""
    _, body = frontmatter(md)
    in_code = False
    for ln in body.split("\n"):
        s = ln.strip()
        if s.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not s or s.startswith(("#", "|", "<!--", "-->", "---", "<", "*Source", "Source:")):
            continue
        if s.startswith(">"):
            s = s.lstrip("> ").strip()
            if not s or s.lower().startswith(("category:", "source")):
                continue
        s = re.sub(r"[*_`]", "", s)
        s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
        if len(s) < 25 or re.match(r"^[\w-]+:\s*$", s) or re.match(r"^[\w-]+:\s*[\"']?[^\s].{0,20}$", s):
            continue
        return s[:limit].rstrip()
    return ""


def cut(s, limit=DESC_MAX):
    """Cut a description at the end of a sentence (otherwise a card reads '... (#0E0E0E,')."""
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= limit:
        return s
    head = s[:limit]
    i = max(head.rfind(". "), head.rfind("! "), head.rfind("? "))
    return head[:i + 1] if i >= 80 else head.rsplit(" ", 1)[0].rstrip(",;:(") + "…"


def tags_of(*groups, limit=14):
    seen, out = set(), []
    for g in groups:
        for t in g:
            t = str(t).strip()
            if t and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
    return out[:limit]


def rel(root, path):
    return os.path.relpath(path, root).replace("\\", "/")


def abspath(path):
    return os.path.abspath(path)


# ---------- adapters of the sets: the root of a clone -> [record] ----------
# record: slug, name, category, tags, description, md, image (a ready picture of the repository; no picture - the style stays without a preview)

def ios(root):
    out, seen = [], set()
    base = os.path.join(root, "design-md")
    for cat in sorted(os.listdir(base)):
        cdir = os.path.join(base, cat)
        if not os.path.isdir(cdir):
            continue
        for app in sorted(os.listdir(cdir)):
            f = os.path.join(cdir, app, "DESIGN.md")
            if not os.path.isfile(f):
                continue
            md = read(f)
            m = re.search(r"^#\s+.*?(?:Inspiration of|Inspired by)\s+(.+?)(?:\s+\(iOS\))?\s*$", md, re.M)
            slug = slugify(app) if slugify(app) not in seen else slugify(cat + "-" + app)
            seen.add(slug)
            out.append({"slug": slug, "name": (m.group(1).strip() if m else title(app)), "category": "iOS app",
                        "tags": tags_of([cat, "iOS", "mobile app"]), "description": first_line(md), "md": md})
    return out


def open_design_systems(root):
    out = []
    base = os.path.join(root, "design-systems")
    for d in sorted(os.listdir(base)):
        f = os.path.join(base, d, "DESIGN.md")
        if not os.path.isfile(f):
            continue
        md = read(f)
        man = load_json(os.path.join(base, d, "manifest.json"), {})
        comp = os.path.join(base, d, "components.html")
        rec = {"slug": slugify(d), "name": man.get("name") or title(d), "category": "Design system",
               "tags": tags_of([man.get("category") or "", "design system"]), "description": first_line(md), "md": md}
        out.append(rec)
    return out


_OD_CATEGORY = [
    (r"(^|-)(ppt|deck|slides|pitch-book|keynote)|ppt-|^kami", "Slides"),
    (r"social|carousel|^card-|xhs|xiaohongshu|twitter|reddit|spotify|^post", "Social"),
    (r"poster", "Poster"),
    (r"email|newsletter", "Email"),
    (r"wireframe", "Wireframe"),
    (r"mobile|app-|gamified|onboarding", "Mobile app"),
    (r"dashboard", "Dashboard"),
    (r"banner|ad-creative|^ad-", "Banner"),
    (r"blog|docs|report|resume|invoice|eguide|runbook|case-report|valuation|update|release|critique|brief", "Document"),
]


def open_design_templates(root):
    out = []
    base = os.path.join(root, "design-templates")
    for d in sorted(os.listdir(base)):
        f = os.path.join(base, d, "SKILL.md")
        if not os.path.isfile(f) or d.startswith("html-ppt-zhangzara-"):   # the same ones are in the beautiful-html-templates set
            continue
        meta, body = frontmatter(read(f))
        cat = next((c for pat, c in _OD_CATEGORY if re.search(pat, d)), "Template")
        desc = re.sub(r"\s+", " ", meta.get("description") or "").strip()
        ex = os.path.join(base, d, "example.html")
        name = title(re.sub(r"^html-ppt-", "", d))
        md = f"# {name}\n\n> {desc[:DESC_MAX]}\n\n"
        if os.path.isfile(ex):
            md += f"Reference layout (open to see the finished example): `{abspath(ex)}`\n\n"
        md += body
        rec = {"slug": slugify(d), "name": name, "category": cat,
               "tags": tags_of([cat, "template", meta.get("scenario") or "", meta.get("platform") or "", meta.get("mode") or ""]),
               "description": desc[:DESC_MAX] or first_line(md), "md": md}
        out.append(rec)
    return out


def open_design(root):
    return open_design_systems(root) + open_design_templates(root)


def zara_slides(root):
    out = []
    base = os.path.join(root, "templates")
    for d in sorted(os.listdir(base)):
        f = os.path.join(base, d, "design.md")
        if not os.path.isfile(f):
            continue
        meta = load_json(os.path.join(base, d, "template.json"), {})
        md = read(f)
        html = os.path.join(base, d, "template.html")
        if os.path.isfile(html):
            md += f"\n\n---\nReference deck (open to see all slides): `{abspath(html)}`\n"
        typo = meta.get("typography") or {}
        shots = [os.path.join(root, "screenshots", f"{d}-{n}.png") for n in (1, 2, 3, 4, 5)]
        rec = {"slug": slugify(d), "name": meta.get("name") or title(d), "category": "Slides",
               "tags": tags_of(meta.get("mood") or [], meta.get("tone") or [], [meta.get("scheme") or "", "slides"],
                               [typo.get("display") or "", typo.get("body") or ""], (meta.get("occasion") or [])[:3]),
               "description": (meta.get("tagline") or first_line(md))[:DESC_MAX], "md": md}
        img = next((s for s in shots if os.path.isfile(s)), None)
        if img:
            rec["image"] = img
        out.append(rec)
    return out


def frontend_slides(root):
    """12 presets of STYLE_PRESETS.md and 88 slide layouts; the 34 bold-pack templates are the same as in beautiful-html-templates."""
    out = []
    text = read(os.path.join(root, "STYLE_PRESETS.md"))
    theme = ""
    for part in re.split(r"^(?=##+ )", text, flags=re.M):
        m2 = re.match(r"^## (Dark|Light|Specialty) Themes", part)
        if m2:
            theme = m2.group(1).lower()
            continue
        m = re.match(r"^### \d+\.\s+(.+)", part)
        if not m:
            continue
        name = m.group(1).strip()
        md = f"# {name}\n\n" + part.split("\n", 1)[1].strip() + "\n"
        out.append({"slug": "preset-" + slugify(name), "name": name, "category": "Slides",
                    "tags": tags_of([theme if theme != "specialty" else "", "slides", "preset"]),
                    "description": first_line(md), "md": md})
    base = os.path.join(root, "layout-presets")
    for slot in sorted(os.listdir(base)):
        sdir = os.path.join(base, slot)
        if not os.path.isdir(sdir):
            continue
        for d in sorted(os.listdir(sdir)):
            f = os.path.join(sdir, d, "layout.md")
            if not os.path.isfile(f):
                continue
            md = read(f)
            meta, _ = frontmatter(md)
            html = os.path.join(sdir, d, "preview.html")
            if os.path.isfile(html):
                md += f"\n\n---\nReference preview (1920x1080): `{abspath(html)}`\n"
            rec = {"slug": f"layout-{slot}-{slugify(d)}", "name": f"{meta.get('name') or title(d)} ({slot})",
                   "category": "Slide layout", "tags": tags_of([slot, "layout", "slides"]),
                   "description": re.sub(r"\s+", " ", meta.get("description") or first_line(md))[:DESC_MAX], "md": md}
            out.append(rec)
    return out


_ROLES = {"bg": "page background", "bg-soft": "soft background", "surface": "card surface", "surface-2": "second surface",
          "text-1": "primary text", "text-2": "secondary text", "text-3": "muted text", "accent": "main accent",
          "accent-2": "second accent", "accent-3": "third accent", "accent-ink": "text on accent", "good": "positive",
          "warn": "warning", "bad": "negative", "border": "hairlines", "border-strong": "strong lines"}


def _css_theme_md(slug, css, comment):
    vars_ = re.findall(r"--([\w-]+)\s*:\s*([^;}]+);", css)
    hexes = [(k, v.strip()) for k, v in vars_ if re.search(r"#[0-9a-fA-F]{3,8}\b", v) and not v.strip().startswith(("linear", "radial"))]
    rows = []
    for k, v in hexes:
        m = re.search(r"#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", v)
        if m:
            rows.append(f"| {k} | `{m.group(0).lower()}` | {_ROLES.get(k, '')} |")
    fonts = []
    for k, v in vars_:
        if k.startswith("font-"):
            for fam in v.split(","):
                fam = fam.strip().strip("'\"")
                if fam and fam.lower() not in ("serif", "sans-serif", "monospace", "system-ui") and fam not in fonts:
                    fonts.append(fam)
    name = title(slug)
    md = f"# {name} — html-ppt theme\n\n> Slide theme `{slug}`: {comment}\n\n## Color Palette & Roles\n\n| Token | Value | Role |\n|---|---|---|\n"
    md += "\n".join(rows) + "\n\n## Typography\n\n"
    md += "".join(f"### {f} — font\n\n" for f in fonts[:6]) or "System fonts.\n\n"
    md += f"## Tokens (CSS)\n\n```css\n{css.strip()}\n```\n"
    return md, [f for f in fonts[:2]]


def html_ppt(root):
    out = []
    assets = os.path.join(root, "assets")
    for fn in sorted(os.listdir(os.path.join(assets, "themes"))):
        if not fn.endswith(".css"):
            continue
        slug = fn[:-4]
        css = read(os.path.join(assets, "themes", fn))
        m = re.match(r"\s*/\*\s*theme:\s*[\w-]+\s*[—-]*\s*(.*?)\s*\*/", css)
        comment = (m.group(1) if m and m.group(1) else "") or f"{title(slug)} palette and fonts for slides"
        md, fonts = _css_theme_md(slug, css, comment)
        hexes = re.findall(r"#[0-9a-fA-F]{6}\b", css)
        out.append({"slug": "theme-" + slug, "name": title(slug), "category": "Slides",
                    "tags": tags_of([slug.replace("-", " "), "slides", "theme"], fonts),
                    "description": f"html-ppt slide theme: {comment}"[:DESC_MAX], "md": md})
    decks = os.path.join(root, "templates", "full-decks")
    for d in sorted(os.listdir(decks)):
        idx = os.path.join(decks, d, "index.html")
        if not os.path.isfile(idx):
            continue
        rd = os.path.join(decks, d, "README.md")
        body = read(rd) if os.path.isfile(rd) else ""
        css_f = os.path.join(decks, d, "style.css")
        css = read(css_f) if os.path.isfile(css_f) else ""
        _, fonts = _css_theme_md(d, css, "")
        md = f"# {title(d)} — html-ppt full deck\n\n"
        md += (body.strip() or "Full slide deck example.") + f"\n\nReference deck (open to see all slides): `{abspath(idx)}`\nStyles: `{abspath(css_f)}`\n"
        out.append({"slug": "deck-" + slugify(d), "name": title(d) + " (deck)", "category": "Slides",
                    "tags": tags_of([d.replace("-", " "), "slides", "full deck"], fonts), "description": first_line(body) or f"Full html-ppt deck: {title(d)}",
                    "md": md})
    return out


def design_skills(root):
    out = []
    base = os.path.join(root, "skills")
    index = load_json(os.path.join(base, "index.json"), {})
    for d in sorted(os.listdir(base)):
        f = os.path.join(base, d, "DESIGN.md")
        if not os.path.isfile(f):
            continue
        md = read(f)
        sk = os.path.join(base, d, "SKILL.md")
        meta, _ = frontmatter(read(sk)) if os.path.isfile(sk) else ({}, "")
        img = os.path.join(root, "registry-examples", f"{d}-marketing.png")
        rec = {"slug": slugify(d), "name": (index.get(d) or {}).get("name") or title(d), "category": "Style direction",
               "tags": tags_of([d, "design direction", "UI"]), "description": (meta.get("description") or first_line(md))[:DESC_MAX], "md": md}
        if os.path.isfile(img):
            rec["image"] = img
        out.append(rec)
    return out


def banner(root):
    base = os.path.join(root, ".claude", "skills", "banner-design", "references", "banner-sizes-and-styles.md")
    text = read(base)
    m = re.search(r"^## \d+ Art Direction Styles\n(.*?)(?=^## )", text, re.M | re.S)
    styles = re.findall(r"^\d+\.\s+\*\*(.+?)\*\*\s*[—-]\s*(.+)$", m.group(1), re.M) if m else []
    shared = (text[:m.start()] + text[m.end():]).strip() if m else text
    shared = re.sub(r"^# .*\n+", "", shared)
    out = []
    for name, desc in styles:
        md = f"# Banner art direction: {name}\n\n> {desc.strip()}\n\n**Style:** {name} — {desc.strip()}\n\n{shared}\n"
        words = [w for w in re.split(r"\W+", name.lower()) if len(w) > 2]
        out.append({"slug": slugify(name), "name": name, "category": "Banner",
                    "tags": tags_of(words, ["banner", "ad", "social cover"]), "description": desc.strip()[:DESC_MAX], "md": md})
    return out


def email_cosmoblk(root):
    text = read(os.path.join(root, "SKILL.md"))
    m = re.search(r"### Archetypes\n+((?:\|.*\n)+)", text)
    rows = [[c.strip() for c in ln.strip().strip("|").split("|")] for ln in (m.group(1).split("\n") if m else []) if ln.startswith("|")][2:]
    sh = re.search(r"^### Shared visual laws\n(.*?)(?=^## )", text, re.M | re.S)
    shared = sh.group(0).strip() if sh else ""
    out = []
    for r in rows:
        if len(r) < 4:
            continue
        name = r[0].strip("*")
        md = (f"# Email archetype: {name}\n\n> {r[1]}\n\n- **Hallmarks:** {r[2]}\n- **Reference brands:** {r[3]}\n- **Use for:** {r[1]}\n\n{shared}\n")
        out.append({"slug": slugify(name), "name": name, "category": "Email",
                    "tags": tags_of(["email", "newsletter"], [w.strip() for w in re.split(r"[,.]", r[2]) if 3 < len(w.strip()) < 40][:4]),
                    "description": f"{r[1]}. {r[2]}"[:DESC_MAX], "md": md})
    return out


def email_md(root):
    f = os.path.join(root, "examples", "limonaia", "EMAIL.md")
    md = read(f)
    return [{"slug": "limonaia-example", "name": "Limonaia (EMAIL.md example)", "category": "Email",
             "tags": tags_of(["email", "design system", "example"]), "description": first_line(md) or "A complete EMAIL.md design system of a sample brand.",
             "md": md}]




# ---------- the sets: where to read and what a style is there ----------
# key -> (owner/repo, reader, sparse paths (None - the whole repository), licence)
SETS = {
    "ios-design-md": ("Meliwat/awesome-ios-design-md", ios, None, "MIT"),
    "open-design": ("nexu-io/open-design", open_design, ["design-systems", "design-templates"], "Apache-2.0"),
    "beautiful-html-templates": ("zarazhangrui/beautiful-html-templates", zara_slides, None, "MIT"),
    "frontend-slides": ("dreamid27/frontend-slides", frontend_slides, None, "MIT"),
    "html-ppt": ("lewislulu/html-ppt-skill", html_ppt, None, "MIT"),
    "design-skills": ("bergside/awesome-design-skills", design_skills, None, "MIT"),
    "banner-design": ("nextlevelbuilder/ui-ux-pro-max-skill", banner, ["/LICENSE", "/.claude/skills/banner-design/"], "MIT"),
    "email-design": ("CosmoBlk/email-design", email_cosmoblk, None, "MIT"),
    "email-design-md": ("kingadow/email-design-md", email_md, None, "MIT"),
}
HOSTS = ("github.com", "www.github.com")
FILE_HOSTS = ("raw.githubusercontent.com", "codeload.github.com", "objects.githubusercontent.com")


def repo_of(url):
    """'owner/repo' (as written) from a link to a repository - also from .../tree/main/..., .git; None - not a link to a repository."""
    p = urlparse(url if "//" in url else "https://" + url)
    if (p.hostname or "").lower() not in HOSTS:
        return None
    parts = [x for x in p.path.split("/") if x]
    if len(parts) < 2 or not re.fullmatch(r"[A-Za-z0-9_.-]+", parts[0]) or not re.fullmatch(r"[A-Za-z0-9_.-]+", parts[1]):
        return None
    return parts[0] + "/" + re.sub(r"\.git$", "", parts[1])


def set_of(repo):
    """The key of the set a repository is read as; None - no reader for it."""
    low = (repo or "").lower()
    return next((k for k, v in SETS.items() if v[0].lower() == low), None)


def clone_name(key):
    return SETS[key][0].replace("/", "__")


def _rmtree(path):
    def fix(func, p, _exc):   # a read-only file of .git (Windows): make it writable and try again
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except OSError:
            pass
    shutil.rmtree(path, onerror=fix)


class GitHub:
    host_names = ("github.com",)

    def __init__(self):
        self.root = ""
        self.halt = None

    def bind(self, root, halt=None):
        """The fetcher gives the library folder (the clones go under it) and its stop signal before it plans."""
        self.root, self.halt = root, halt

    def matches(self, url):
        return (urlparse(url).hostname or "").lower() in HOSTS

    def canon(self, url):
        repo = repo_of(url)
        return "https://github.com/" + repo.lower() if repo else "https://github.com"

    def allowed(self, url):
        return (urlparse(url).hostname or "").lower() in HOSTS + FILE_HOSTS

    def image_ok(self, url):
        return False

    # --- the clone ---

    def _git(self, args):
        """git runs without asking anything; -> (code, the end of its message). The stop signal kills it; a clone that takes too long is stopped."""
        env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
        try:
            p = subprocess.Popen(["git"] + args, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except OSError:
            raise SourceError("no_git")
        end = time.time() + CLONE_TIMEOUT
        while p.poll() is None:
            if (self.halt is not None and self.halt.is_set()) or time.time() > end:
                p.kill()
                p.wait()
                return -1, ""
            time.sleep(TRIES_STEP)
        return p.returncode, (p.stdout.read() or "")[-300:]

    def _clone(self, key):
        repo, _fn, sparse, _lic = SETS[key]
        if not self.root:   # bind() was not called: a clone has no folder to go to (never into the current folder)
            raise SourceError("clone_failed", repo=repo, text="no library folder")
        dest = os.path.join(self.root, "sets", clone_name(key))
        flags = ["--no-cone"] if sparse and any(x.startswith("/") for x in sparse) else []
        if os.path.isdir(os.path.join(dest, ".git")):   # there already (an earlier run or the owner's own import): used as it is
            if sparse:
                self._git(["-C", dest, "sparse-checkout", "set", *flags, *sparse])
            return dest
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        code, text = self._git(["clone", "--depth", "1", *(["--filter=blob:none", "--sparse"] if sparse else []), f"https://github.com/{repo}.git", dest])
        if code == 0 and sparse:
            code, text = self._git(["-C", dest, "sparse-checkout", "set", *flags, *sparse])
        if code != 0:
            if os.path.isdir(dest):
                _rmtree(dest)
            if code == -1 and self.halt is not None and self.halt.is_set():
                return None
            raise SourceError("clone_failed", repo=repo, text=text.strip()[-200:])
        return dest

    # --- what a link stands for ---

    def plan(self, url, get):
        repo = repo_of(url)
        if not repo:
            raise SourceError("github_repo")
        key = set_of(repo)
        if not key:
            raise SourceError("github_unknown", repo=repo)
        dest = self._clone(key)
        if dest is None:   # stopped
            return []
        _repo, reader, _sparse, lic = SETS[key]
        try:
            recs = reader(dest)
        except (OSError, KeyError, ValueError) as e:
            raise SourceError("github_layout", repo=repo, text=f"{type(e).__name__}: {e}"[:200])
        if not recs:
            raise SourceError("no_styles")
        seen, refs = set(), []
        for r in recs:   # the slugs inside a set are unique
            base, n = r["slug"], 2
            while r["slug"] in seen:
                r["slug"], n = f"{base}-{n}", n + 1
            seen.add(r["slug"])
            img = r.get("image") or ""
            ext = os.path.splitext(img)[1].lower() if img else ""
            refs.append({"id": f"{key}:{r['slug']}", "url": f"https://github.com/{_repo}", "record": {
                "file": f"{key}--{r['slug']}.md", "md": r["md"], "image": img, "preview": f"previews/sets/{key}/{r['slug']}{ext}" if img else "",
                "entry": {"name": r["name"], "category": r["category"], "tags": r["tags"], "site": f"https://github.com/{_repo}",
                          "description": cut(r["description"]), "source": _repo, "license": lic, "set": key}}})
        return refs

    def remove_traces(self, root, link):
        """The link is deleted: its clone, its list of entries and the previews of the set go too (the styles themselves are already gone)."""
        key = set_of(repo_of(link))
        if not key:
            return
        for rel in (os.path.join("sets", clone_name(key)), os.path.join("previews", "sets", key)):
            path = os.path.realpath(os.path.join(root, rel))
            if path.startswith(os.path.realpath(root) + os.sep) and os.path.isdir(path):
                _rmtree(path)
        try:
            os.remove(os.path.join(root, "sets", "_entries", key + ".json"))
        except OSError:
            pass
        try:
            for name in os.listdir(root):
                if name.startswith(key + "--") and name.endswith(".md"):   # what a broken download left
                    os.remove(os.path.join(root, name))
        except OSError:
            pass
