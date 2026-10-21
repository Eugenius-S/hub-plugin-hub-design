"""Markdown -> an HTML page for the canvas and the card shot. Small and safe: the text is escaped, raw HTML in the source is shown as text,
links go only to http(s), mailto, anchors and relative paths. No dependencies."""
import html
import re

CSS = """*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:#1f2328;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:760px;margin:0 auto;padding:56px 40px 80px}
h1,h2,h3,h4,h5,h6{line-height:1.25;margin:1.6em 0 .5em;font-weight:650}h1{font-size:2em;margin-top:0;padding-bottom:.3em;border-bottom:1px solid #d8dee4}
h2{font-size:1.5em;padding-bottom:.3em;border-bottom:1px solid #d8dee4}h3{font-size:1.2em}h4,h5,h6{font-size:1em}
p,ul,ol,pre,blockquote,table{margin:0 0 1em}ul,ol{padding-left:1.6em}li+li{margin-top:.25em}
a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#eff1f3;border-radius:5px;padding:.15em .4em}
pre{background:#f6f8fa;border-radius:8px;padding:14px 16px;overflow:auto;line-height:1.45}pre code{background:none;padding:0;font-size:.85em}
blockquote{margin-left:0;padding:0 1em;color:#59636e;border-left:4px solid #d1d9e0}
hr{border:0;border-top:1px solid #d8dee4;margin:2em 0}img{max-width:100%;height:auto}
table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #d1d9e0;padding:6px 13px}th{background:#f6f8fa;font-weight:600}tr:nth-child(2n) td{background:#fafbfc}
"""

SAFE_URL = re.compile(r"^(https?:|mailto:|#|/|\.{0,2}/|[A-Za-z0-9_%~-][^:]*$)", re.I)


def _url(u):
    u = html.unescape(u).strip()
    return html.escape(u, quote=True) if SAFE_URL.match(u) else "#"


def inline(text):
    """Inline markup of one piece of text (already a single line or paragraph)."""
    codes = []

    def keep(m):
        codes.append("<code>%s</code>" % html.escape(m.group(2).strip()))
        return "\x00%d\x00" % (len(codes) - 1)

    text = re.sub(r"(`+)(.+?)\1", keep, text)
    text = html.escape(text, quote=False)
    text = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)", lambda m: '<img alt="%s" src="%s">' % (html.escape(m.group(1), quote=True), _url(m.group(2))), text)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)", lambda m: '<a href="%s">%s</a>' % (_url(m.group(2)), m.group(1)), text)
    text = re.sub(r"(?<![\w\"=>])(https?://[^\s<)]+[^\s<).,;:!?])", r'<a href="\1">\1</a>', text)
    text = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*|__(?=\S)(.+?)(?<=\S)__", lambda m: "<strong>%s</strong>" % (m.group(1) or m.group(2)), text)
    text = re.sub(r"(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])", lambda m: "<em>%s</em>" % (m.group(1) or m.group(2)), text)
    text = re.sub(r"~~(?=\S)(.+?)(?<=\S)~~", r"<del>\1</del>", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], text)


ITEM = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")


def _cells(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in re.split(r"(?<!\\)\|", line)]


def _list(lines, i):
    """A list from line i: items by indent, nesting by a deeper indent. Returns the HTML and the next line."""
    out, stack = [], []   # stack: (indent, tag)
    while i < len(lines):
        m = ITEM.match(lines[i])
        if not m:
            if lines[i].strip() and stack and lines[i].startswith(" " * (stack[-1][0] + 2)):   # a continuation of the item
                out.append(" " + inline(lines[i].strip()))
                i += 1
                continue
            break
        indent, mark, body = len(m.group(1).replace("\t", "    ")), m.group(2), m.group(3)
        tag = "ol" if mark[0].isdigit() else "ul"
        while stack and indent < stack[-1][0]:
            out.append("</li></%s>" % stack.pop()[1])
        if stack and indent == stack[-1][0]:
            out.append("</li>")
        elif not stack or indent > stack[-1][0]:
            out.append("<%s>" % tag)
            stack.append((indent, tag))
        box = re.match(r"^\[([ xX])\]\s+(.*)$", body)
        if box:
            body = '<input type="checkbox" disabled%s> %s' % (" checked" if box.group(1) != " " else "", inline(box.group(2)))
        else:
            body = inline(body)
        out.append("<li>" + body)
        i += 1
    while stack:
        out.append("</li></%s>" % stack.pop()[1])
    return "".join(out), i


def blocks(text):
    lines = text.replace("\r\n", "\n").replace("\r", "\n").expandtabs(4).split("\n")
    out, i, para = [], 0, []

    def flush():
        if para:
            out.append("<p>%s</p>" % inline(" ".join(s.strip() for s in para)))
            para.clear()

    while i < len(lines):
        line = lines[i]
        fence = re.match(r"^\s*(```+|~~~+)\s*([\w+-]*)", line)
        if fence:
            flush()
            mark, buf = fence.group(1), []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith(mark):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(buf)))
            continue
        if not line.strip():
            flush()
            i += 1
            continue
        h = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", line)
        if h:
            flush()
            n = len(h.group(1))
            out.append("<h%d>%s</h%d>" % (n, inline(h.group(2)), n))
            i += 1
            continue
        if re.match(r"^\s{0,3}([-*_])(\s*\1){2,}\s*$", line) and not para:
            out.append("<hr>")
            i += 1
            continue
        if para and re.match(r"^=+\s*$", line):
            out.append("<h1>%s</h1>" % inline(" ".join(s.strip() for s in para)))
            para.clear()
            i += 1
            continue
        if para and re.match(r"^-+\s*$", line):
            out.append("<h2>%s</h2>" % inline(" ".join(s.strip() for s in para)))
            para.clear()
            i += 1
            continue
        if line.lstrip().startswith(">"):
            flush()
            buf = []
            while i < len(lines) and lines[i].lstrip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append("<blockquote>%s</blockquote>" % blocks("\n".join(buf)))
            continue
        if ITEM.match(line):
            flush()
            body, i = _list(lines, i)
            out.append(body)
            continue
        if "|" in line and i + 1 < len(lines) and TABLE_SEP.match(lines[i + 1]) and "|" in lines[i + 1]:
            flush()
            head = _cells(line)
            rows = []
            i += 2
            while i < len(lines) and lines[i].strip() and "|" in lines[i]:
                rows.append(_cells(lines[i]))
                i += 1
            out.append("<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>" % (
                "".join("<th>%s</th>" % inline(c) for c in head),
                "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r) for r in rows)))
            continue
        para.append(line)
        i += 1
    flush()
    return "".join(out)


def title_of(text):
    """The first heading of the document (a card's name); none - an empty string."""
    for line in text.replace("\r\n", "\n").split("\n")[:200]:
        m = re.match(r"^#{1,6}\s+(.*?)\s*#*\s*$", line)
        if m:
            return re.sub(r"[`*_]", "", m.group(1)).strip()
    return ""


def page(text, name=""):
    """The whole HTML page of a document."""
    title = title_of(text) or name
    return ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            "<title>%s</title><style>%s</style></head><body><main>%s</main></body></html>" % (html.escape(title), CSS, blocks(text))).encode("utf-8")
