"""Hub Design: hand edits written point by point into the .html source. Finds the element by the canvas selector (agent.js
selector()) in the parsed file and changes only it: the style of the opening tag (shift, size, styles) and the text inside.
The page is not rebuilt as a whole: everything else in the file stays byte for byte. If the element is not found, there are
several of them or the text in the file differs, the item is skipped ("not written") and the designer does it; it never
lands on a foreign element."""
import html
import re
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
# an old open element is closed by a new one: <li><li>, <p><div>
AUTOCLOSE = {"li": {"li"}, "dt": {"dt", "dd"}, "dd": {"dt", "dd"}, "tr": {"tr"}, "td": {"td", "th"}, "th": {"td", "th"}, "option": {"option"},
             "thead": {"tbody", "tfoot"}, "tbody": {"tbody", "tfoot"}}
P_CLOSERS = {"address", "article", "aside", "blockquote", "div", "dl", "fieldset", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
             "hr", "main", "nav", "ol", "p", "pre", "section", "table", "ul"}
RAW_TEXT = {"script", "style", "textarea", "title"}   # not markup inside: we write no text there
PROP = re.compile(r"^-{0,2}[A-Za-z][\w-]*$")
BAD_VALUE = re.compile(r"[;{}<>\\\n\r]|/\*")
ATTR_NAME = re.compile(r"^[A-Za-z][\w:.-]*$")


class El:
    def __init__(self, tag, attrs, start, open_end, parent):
        self.tag, self.attrs, self.start, self.open_end, self.parent = tag, attrs, start, open_end, parent
        self.kids = []
        self.end_start = None    # where the closing tag starts; None: not closed (void or closed implicitly)
        self.raw = ""            # the opening tag as in the file: edited and replaced as a whole


class Tree(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.lines = [0] + [m.end() for m in re.finditer("\n", src)]
        self.root = El("#root", {}, 0, 0, None)
        self.stack = [self.root]
        self.all = []
        self.feed(src)
        self.close()

    def at(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs, selfclosing=False):
        start = self.at()
        raw = self.get_starttag_text() or ""
        top = self.stack[-1]
        if top.tag in AUTOCLOSE.get(tag, ()) or (top.tag == "p" and tag in P_CLOSERS):
            self.stack.pop()
        parent = self.stack[-1]
        el = El(tag, {k: (v or "") for k, v in attrs}, start, start + len(raw), parent)
        el.raw = raw
        parent.kids.append(el)
        self.all.append(el)
        if tag not in VOID and not selfclosing:
            self.stack.append(el)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs, True)

    def handle_endtag(self, tag):
        start = self.at()
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack[i].end_start = start
                del self.stack[i:]
                return


def parse(src):
    return Tree(src)


# --- canvas selector ------------------------------------------------------------------------------------------------
IDENT = r"(?:\\[0-9a-fA-F]{1,6}\s?|\\.|[^.:#\s\\>])+"
PART = re.compile(r"^(?:#(?P<id>%s)|(?P<tag>[A-Za-z][\w-]*)(?P<cls>(?:\.%s)*)(?::nth-of-type\((?P<n>\d+)\))?)$" % (IDENT, IDENT))


def unescape(s):
    s = re.sub(r"\\([0-9a-fA-F]{1,6})\s?", lambda m: chr(int(m.group(1), 16)), s)
    return re.sub(r"\\(.)", r"\1", s)


def parse_sel(sel):
    parts = []
    for raw in str(sel or "").split(" > "):
        m = PART.match(raw.strip())
        if not m:
            return None
        if m.group("id"):
            parts.append({"id": unescape(m.group("id"))})
        else:
            cls = [unescape(c) for c in re.findall(r"\.(%s)" % IDENT, m.group("cls") or "")]
            parts.append({"tag": m.group("tag").lower(), "cls": cls, "n": int(m.group("n")) if m.group("n") else 0})
    return parts or None


def fits(el, part):
    if "id" in part:
        return el.attrs.get("id") == part["id"]
    if el.tag != part["tag"]:
        return False
    have = (el.attrs.get("class") or "").split()
    if any(c not in have for c in part["cls"]):
        return False
    if part["n"]:
        same = [k for k in el.parent.kids if k.tag == el.tag] if el.parent else [el]
        return part["n"] <= len(same) and same[part["n"] - 1] is el
    return True


# why an edit was not written: code -> the English text (for logs and the designer). The page shows its own translation by the code (STR w_<code>)
WHY = {
    "selector": "the selector could not be read",
    "absent": "the element is not in the file: a script builds it or the layout changed",
    "several": "the file has several such elements",
    "rawtext": "the text inside has markup",
    "nested": "there are nested tags inside",
    "textdiff": "the text in the file is not the same as on the canvas",
    "tag": "the tag in the file is different",
    "label": "the element in the file has different text",
    "used": "this element is already being edited",
    "style": "this style value cannot be used",
    "nohtml": "the file has no <html>",
    "tweak": "this tweak value cannot be used",
    "check": "the file did not pass the check after writing",
}


def find(tree, sel):
    """(element, "") when exactly one fits; otherwise (None, the code of why)."""
    parts = parse_sel(sel)
    if not parts:
        return None, "selector"
    hits = []
    for el in tree.all:
        if not fits(el, parts[-1]):
            continue
        cur, ok = el, True
        for part in reversed(parts[:-1]):
            cur = cur.parent
            if cur is None or cur.tag == "#root" or not fits(cur, part):
                ok = False
                break
        if ok:
            hits.append(el)
    if not hits:
        return None, "absent"
    if len(hits) > 1:
        return None, "several"
    return hits[0], ""


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def text_of(tree, el):
    """The element text as in the file: no tags, entities expanded."""
    end = el.end_start if el.end_start is not None else el.open_end
    inner = re.sub(r"<(script|style)\b.*?</\1\s*>|<!--.*?-->|<[^>]*>", "", tree.src[el.open_end:end], flags=re.S | re.I)
    return html.unescape(inner)


# --- style and attributes in the opening tag -----------------------------------------------------------------------------
ATTR = re.compile(r"""\s+([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?""")


def attr_span(raw, name):
    """(start, end of the whole attribute, start and end of the value, quote) of the first attribute `name`; none: None."""
    head = re.match(r"<[^\s/>]+", raw)
    pos = head.end() if head else 0
    for m in ATTR.finditer(raw, pos):
        if m.group(1).lower() == name:
            v = m.group(2)
            if v is None:
                return m.start(), m.end(), None, None, ""
            quote = v[0] if v[0] in "\"'" else ""
            a, b = m.span(2)
            return m.start(), m.end(), a + len(quote), b - len(quote), quote
    return None


def split_decls(css):
    out, cur, depth, quote = [], "", 0, ""
    for ch in css:
        if quote:
            cur += ch
            if ch == quote:
                quote = ""
        elif ch in "\"'":
            quote = ch
            cur += ch
        elif ch == "(":
            depth += 1
            cur += ch
        elif ch == ")":
            depth = max(0, depth - 1)
            cur += ch
        elif ch == ";" and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return [d.strip() for d in out if d.strip()]


def esc(value, quote):
    value = value.replace("&", "&amp;")
    if quote == "'":
        return value.replace("'", "&#39;")
    return value.replace('"', "&quot;")


def set_style(raw, decls, drop=()):
    """decls: [(property, value)] appended to the end of style (old ones with the same name are removed); drop: properties to remove."""
    names = {p.lower() for p, _ in decls} | {p.lower() for p in drop}
    span = attr_span(raw, "style")
    if span and span[2] is not None:
        a, b, va, vb, quote = span
        keep = [d for d in split_decls(raw[va:vb]) if d.split(":", 1)[0].strip().lower() not in names]
    else:
        a = b = va = vb = None
        quote = '"'
        keep = []
    q = quote or '"'
    value = "; ".join(keep + [f"{p}: {esc(v, q)}" for p, v in decls])
    if span and span[2] is not None:
        if not value:
            return raw[:a] + raw[b:]
        if quote:
            return raw[:va] + value + raw[vb:]
        return raw[:a] + f' style="{value}"' + raw[b:]
    if not value:
        return raw
    head = re.match(r"<[^\s/>]+", raw).end()
    return raw[:head] + f' style="{value}"' + raw[head:]


def set_attr(raw, name, value):
    """value None: remove the attribute; "": boolean (name without a value)."""
    span = attr_span(raw, name.lower())
    if value is None:
        return raw[:span[0]] + raw[span[1]:] if span else raw
    new = f" {name}" if value == "" else f' {name}="{html.escape(str(value), quote=True)}"'
    if span:
        return raw[:span[0]] + new + raw[span[1]:]
    head = re.match(r"<[^\s/>]+", raw).end()
    return raw[:head] + new + raw[head:]


# --- what to write -----------------------------------------------------------------------------------------------------
def num(v):
    v = round(float(v), 2)
    return str(int(v)) if v == int(v) else str(v)


def decls_of(c):
    """Like agent.js paintState: shift is translate, size is border-box + width/height, then styles; None: the value is not acceptable."""
    out = []
    dx, dy = float(c.get("dx") or 0), float(c.get("dy") or 0)
    if dx or dy:
        out.append(("translate", f"{num(dx)}px {num(dy)}px"))
    if c.get("w") is not None and c.get("h") is not None:
        out += [("box-sizing", "border-box"), ("width", f"{num(c['w'])}px"), ("height", f"{num(c['h'])}px")]
    for prop, v in (c.get("css") or {}).items():
        if not isinstance(v, dict) or v.get("from") == v.get("to"):
            continue
        to = str(v.get("to", ""))
        if not PROP.match(str(prop)) or BAD_VALUE.search(to):
            return None
        out.append((prop, to))
    return out


def retext(tree, el, c):
    """New text instead of the old: only for a leaf without nested tags, and only if the file holds that very text."""
    if el.tag in RAW_TEXT or el.end_start is None:
        return None, "rawtext"
    inner = tree.src[el.open_end:el.end_start]
    if "<" in re.sub(r"<br\s*/?>", "", inner, flags=re.I):
        return None, "nested"
    if norm(html.unescape(re.sub(r"<br\s*/?>", "", inner, flags=re.I))) != norm(c.get("t0")):
        return None, "textdiff"
    lead = re.match(r"\s*", inner).group(0)
    tail = re.search(r"\s*$", inner).group(0) if inner.strip() else ""
    return (el.open_end, el.end_start, lead + html.escape(str(c.get("t")), quote=False) + tail), ""


def verify(tree, el, c):
    if c.get("tag") and el.tag != c["tag"]:
        return "tag"
    a, b = norm(c.get("label")), norm(text_of(tree, el))
    if a and b and a[:30] != b[:30]:
        return "label"
    return ""


def op_ok(o):
    if not isinstance(o, dict) or o.get("kind") not in ("var", "attr") or (o.get("value") is not None and BAD_VALUE.search(str(o["value"]))):
        return False
    name = str(o.get("name"))
    if o["kind"] == "var":
        return bool(re.match(r"^--[\w-]+$", name))
    return bool(ATTR_NAME.match(name)) and not re.match(r"(?i)(on|style$)", name)


def apply(src, changes, ops=()):
    """(new text, [selectors written], [{sel, code, why}], result for the tweaks: "done"/"skipped"/"none", the code of why).
    changes: [{sel, label, tag, dx, dy, w, h, t0, t, css}], ops: [{kind: var|attr, name, value}] for <html>."""
    tree = parse(src)
    done, skipped, edits, used = [], [], [], set()
    for c in changes:
        sel = c.get("sel")
        el, why = find(tree, sel)
        why = why or ("used" if id(el) in used else "") or (verify(tree, el, c) if el else "")
        decls = None if why else decls_of(c)
        if not why and decls is None:
            why = "style"
        text = None
        if not why and c.get("t") is not None and c.get("t") != c.get("t0"):
            text, why = retext(tree, el, c)
        if why:
            skipped.append({"sel": sel, "code": why, "why": WHY[why]})
            continue
        used.add(id(el))
        if decls:
            el.raw = set_style(el.raw, decls)
        if text:
            edits.append(text)
        done.append(sel)
    state, why = "none", ""
    if ops:
        root = next((e for e in tree.all if e.tag == "html"), None)
        bad = [o for o in ops if not op_ok(o)]
        if root is None:
            state, why = "skipped", "nohtml"
        elif bad:
            state, why = "skipped", "tweak"
        else:
            sets = [(o["name"], str(o["value"])) for o in ops if o["kind"] == "var" and o.get("value") is not None]
            drop = [o["name"] for o in ops if o["kind"] == "var" and o.get("value") is None]
            raw = set_style(root.raw, sets, drop)
            for o in ops:
                if o["kind"] == "attr":
                    raw = set_attr(raw, o["name"], o.get("value"))
            root.raw = raw
            state = "done"
    for el in tree.all:
        if el.raw and el.raw != tree.src[el.start:el.open_end]:
            edits.append((el.start, el.open_end, el.raw))
    out = src
    for a, b, new in sorted(edits, key=lambda e: -e[0]):
        out = out[:a] + new + out[b:]
    if out != src and len(parse(out).all) != len(tree.all):
        return src, [], [{"sel": c.get("sel"), "code": "check", "why": WHY["check"]} for c in changes], "skipped", "check"
    return out, done, skipped, state, why
