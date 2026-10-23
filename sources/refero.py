"""The source styles.refero.design: a page of a style carries its DESIGN.md as plain text in the HTML, so no browser and no sign-in is needed.

A link means: the site's root (or its sitemap) - every style of the sitemap; /style/<id> - that one style; any other page of the site
(a collection, a category) - the styles that page links to."""
import re
from html.parser import HTMLParser
from urllib.parse import urlparse

_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_STYLE_PATH = re.compile(r"^/style/(" + _UUID + r")/?$")
_STYLE_LINK = re.compile(r"/style/(" + _UUID + r")(?![0-9a-zA-Z-])")
_URL_BLOCK = re.compile(r"<url>(.*?)</url>", re.S)
_LOC = re.compile(r"<loc>\s*([^<]*?)\s*</loc>")
_LASTMOD = re.compile(r"<lastmod>\s*([^<]*?)\s*</lastmod>")
_IMAGE = re.compile(r"<image:loc>\s*([^<]*?)\s*</image:loc>")
_SITEMAP_LOC = re.compile(r"<sitemap>.*?<loc>\s*([^<]*?)\s*</loc>", re.S)
PAGES_MAX = 80  # collection pages one link may stand for
MD_MIN = 1000  # a style file shorter than this is not a style file (the real ones are 1500+)


class SourceError(Exception):
    """A failure with a code the settings page can word: no_styles, bad_page."""
    def __init__(self, code, **args):
        super().__init__(code)
        self.code = code
        self.args_ = args


class _Page(HTMLParser):
    """What a style page gives: the meta tags, the first heading, the first link out of <main>, the text of every <pre>."""

    def __init__(self, own):
        super().__init__(convert_charrefs=True)
        self.own = own
        self.meta = {}       # name or property -> [content]
        self.h1 = ""
        self.title = ""
        self.site = ""
        self.pres = []
        self._in = set()     # open: h1, title, main
        self._pre = None
        self._h1 = []
        self._title = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = a.get("name") or a.get("property")
            if key and a.get("content") is not None:
                self.meta.setdefault(key, []).append(a["content"])
        elif tag in ("h1", "title", "main"):
            self._in.add(tag)
        elif tag == "pre":
            self._pre = []
        elif tag == "a" and "main" in self._in and not self.site:
            href = a.get("href") or ""
            host = (urlparse(href).netloc or "").lower()
            if re.match(r"https?://", href) and host and not host.endswith("refero.design") and host not in self.own:
                self.site = href

    def handle_endtag(self, tag):
        if tag == "pre" and self._pre is not None:
            self.pres.append("".join(self._pre))
            self._pre = None
        self._in.discard(tag)
        if tag == "h1" and not self.h1:
            self.h1 = "".join(self._h1).strip()
        if tag == "title" and not self.title:
            self.title = "".join(self._title).strip()

    def handle_data(self, data):
        if self._pre is not None:
            self._pre.append(data)
        if "h1" in self._in:
            self._h1.append(data)
        if "title" in self._in:
            self._title.append(data)


class Refero:
    name = "refero"

    def __init__(self, hosts=("styles.refero.design",), image_hosts=("images.refero.design",), scheme="https"):
        self.hosts = tuple(h.lower() for h in hosts)
        self.image_hosts = tuple(h.lower() for h in image_hosts)
        self.scheme = scheme
        self.host_names = self.hosts

    def _parts(self, url):
        """A link of the site -> (base, path) or None. http:// and www. are the same site; the base is the canonical https address."""
        try:
            u = urlparse(str(url).strip())
        except ValueError:
            return None
        host = (u.netloc or "").lower()
        host = host[4:] if host.startswith("www.") and host[4:] in self.hosts else host
        if u.scheme not in ("http", "https") or host not in self.hosts:
            return None
        return f"{self.scheme}://{host}", u.path

    def matches(self, url):
        return self._parts(url) is not None

    def allowed(self, url):
        try:
            u = urlparse(url)
        except ValueError:
            return False
        return u.scheme == self.scheme and (u.netloc or "").lower() in self.hosts + self.image_hosts

    def image_ok(self, url):
        try:
            u = urlparse(url or "")
        except ValueError:
            return False
        return u.scheme == self.scheme and (u.netloc or "").lower() in self.image_hosts

    def plan(self, url, get):
        base, path = self._parts(url)
        m = _STYLE_PATH.match(path)
        if m:
            sid = m.group(1).lower()
            return [{"id": sid, "url": f"{base}/style/{sid}"}]
        if path.strip("/") in ("", "sitemap.xml", "sitemaps/styles.xml"):
            return self._from_sitemap(base, path, get)
        page = None
        if path.strip("/") != "sitemaps/collections.xml":
            page = get(base + path + (("?" + urlparse(url).query) if urlparse(url).query else "")) or ""
            refs = self._linked(base, page)
            if refs:
                return refs
        # No styles on the page itself: a section ("/design-styles"), or an index of the collections - the collection pages it stands for
        refs, seen = [], set()
        for sub in self._pages(base, path, page or "", get)[:PAGES_MAX]:
            for ref in self._linked(base, get(sub) or ""):
                if ref["id"] not in seen:
                    seen.add(ref["id"])
                    refs.append(ref)
        if not refs:
            raise SourceError("no_styles")
        return refs

    def _linked(self, base, text):
        refs, seen = [], set()
        for sid in _STYLE_LINK.findall(text or ""):
            sid = sid.lower()
            if sid not in seen:
                seen.add(sid)
                refs.append({"id": sid, "url": f"{base}/style/{sid}"})
        return refs

    def _pages(self, base, path, page, get):
        """The collection pages a section or an index page stands for: the pages of the collections sitemap under the path (all of them for
        its own link), and the pages the index page links to."""
        want = "/" + path.strip("/")
        out = []
        smap = get(base + "/sitemaps/collections.xml") or ""
        for block in _URL_BLOCK.findall(smap):
            loc = _LOC.search(block)
            u = self._parts(loc.group(1)) if loc else None
            if u and u[1].strip("/").count("/") >= 1 and (want == "/sitemaps/collections.xml" or u[1].startswith(want + "/")):
                out.append(base + u[1])
        for href in re.findall(r'href="(/[a-z0-9-]+/[a-z0-9-]+)"', page):
            if base + href not in out and href != want:
                out.append(base + href)
        return list(dict.fromkeys(out))

    def _from_sitemap(self, base, path, get):
        text = get(base + (path if path.strip("/") else "/sitemap.xml")) or ""
        if "<sitemapindex" in text:   # the index lists the sitemaps; those of styles (not of collections) hold the style pages
            maps = [m for m in _SITEMAP_LOC.findall(text) if "style" in m.lower() and "collection" not in m.lower() and self.allowed(m)]
            text = "".join(get(m) or "" for m in maps)
        refs, seen = [], set()
        for block in _URL_BLOCK.findall(text):
            loc = _LOC.search(block)
            m = _STYLE_PATH.match(urlparse(loc.group(1)).path) if loc else None
            if not m or m.group(1).lower() in seen:
                continue
            sid = m.group(1).lower()
            seen.add(sid)
            ref = {"id": sid, "url": f"{base}/style/{sid}"}
            for key, rx in (("lastmod", _LASTMOD), ("image", _IMAGE)):
                got = rx.search(block)
                if got:
                    ref[key] = got.group(1)
            refs.append(ref)
        if not refs:
            raise SourceError("no_styles")
        return refs

    def parse(self, page, ref):
        p = _Page(self.hosts)
        p.feed(page or "")
        p.close()
        md = next((x for x in sorted(p.pres, key=len, reverse=True) if x.lstrip().startswith("# ")), "").strip("\n") + "\n"
        if len(md) < MD_MIN:
            raise SourceError("bad_page")
        one = lambda k: (p.meta.get(k) or [""])[0].strip()   # noqa: E731
        name = p.h1 or re.sub(r"\s*design system.*$", "", p.title, flags=re.I).strip() or md.split("\n", 1)[0][2:].strip()
        image = one("og:image")
        if not self.image_ok(image):
            image = ref.get("image") if self.image_ok(ref.get("image")) else ""
        return {"id": ref["id"], "name": name[:120], "md": md, "category": one("category")[:60],
                "tags": [t.strip() for t in p.meta.get("article:tag", []) if t.strip()][:40], "site": p.site,
                "description": one("description")[:600], "image_url": image, "lastmod": ref.get("lastmod", "")}
