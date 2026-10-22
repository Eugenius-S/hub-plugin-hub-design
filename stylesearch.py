"""Hub Design: the search of the style library by labels (tags.json: theme, style, mood, industry), the name, the category and the description.

A query is free text in Russian or English ("dark fintech", "like <brand>"). style-vocab.json maps words of the query to labels (with synonyms and
word endings); a brand word ("aliases") stands for the nearest labels; "like <style name>" takes the labels of that style as a model. The ranking
is a score: a label of the query that an entry has, a word of the query in its name, category, tags and description. Pure functions over entries
(styles.py gives them), no files except the dictionary next to this module, nothing is written or sent."""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
VOCAB = os.path.join(HERE, "style-vocab.json")
AXES = ("theme", "style", "mood", "industry", "medium", "density")   # medium: what the style is made for (web, slides, ios-app, ...), density: content per screen
W_AXIS = {"theme": 3, "style": 3, "mood": 2, "industry": 2, "medium": 3, "density": 1.5}   # what a label of each axis is worth in the score
WRONG_MEDIUM = 0.2   # the score of an entry whose medium is not the requested one: slides asked - apps and sites go down
CUT = 0.5   # an entry that scores under this share of the best one is not an answer, just a distant relative
_WORD = re.compile("[a-zа-я0-9][a-zа-я0-9+#.]*")
_CYR_OR_S = re.compile("[а-я]|s$")
_cache = {}


class Vocab:
    def __init__(self, data):
        data = data if isinstance(data, dict) else {}
        self.axes = {a: data.get("axes", {}).get(a) or {} for a in AXES}
        self.aliases = [a for a in data.get("aliases", []) if isinstance(a, dict) and a.get("match")]
        self.stop = set(data.get("stop", []))
        self.like = set(data.get("like", []))
        self.endings = re.compile("(%s)$" % (data.get("endings") or "s"))

    def name(self, key, lang="en"):
        """The short display name of a label: the part before " / " or ","; the key itself if the dictionary does not know it."""
        for labels in self.axes.values():
            lab = labels.get(key)
            if lab:
                text = str(lab.get(lang) or lab.get("en") or key)
                return re.split(r"\s*(?:/|,)\s*", text)[0] or key
        return key

    def norm(self, s):
        return re.sub(r"\s+", " ", str(s).lower().replace("ё", "е")).strip()

    def words(self, s):
        return _WORD.findall(self.norm(s))

    def stem(self, w):
        w = w.rstrip(".")
        return self.endings.sub("", w) if len(w) > 4 and _CYR_OR_S.search(w) else w


def vocab():
    """The bundled dictionary (read once); an unreadable one is an empty one: the search then goes by names and descriptions only."""
    if "v" not in _cache:
        try:
            with open(VOCAB, encoding="utf-8") as f:
                _cache["v"] = Vocab(json.load(f))
        except (OSError, ValueError):
            _cache["v"] = Vocab({})
    return _cache["v"]


def same(a, b):
    """Two stems are one word: equal, or a common start of at least 5 signs and 70% of the shorter one."""
    if a == b:
        return True
    cp = len(os.path.commonprefix([a, b]))
    return cp >= 5 and cp >= 0.7 * min(len(a), len(b))


class Matcher:
    """Finds the dictionary terms in a query: words by their stem, phrases as a substring."""

    def __init__(self, v, query):
        self.v = v
        self.q = " " + v.norm(query) + " "
        self.toks = v.words(query)
        self.stems = [v.stem(t) for t in self.toks]
        self.used = set()

    def hit(self, term):
        v = self.v
        t = v.norm(term)
        if not t:
            return False
        if " " in t or "-" in t or "&" in t:
            if " " + t + " " in self.q or (len(t) > 5 and t in self.q):
                self.used.update(range(len(self.toks)))   # a phrase: its words do not go on as free text
                return True
            return False
        st = v.stem(t)
        found = False
        for i, s in enumerate(self.stems):
            if self.toks[i] == t or same(s, st) and (len(t) > 3 or self.toks[i] == t):
                self.used.add(i)
                found = True
        return found


def parse(query, v):
    """-> (wanted {axis: {label: weight}}, brands [alias], free [words not explained by the dictionary], like: bool)"""
    m = Matcher(v, query)
    wanted = {a: {} for a in AXES}
    brands = []
    for al in v.aliases:
        if any(m.hit(t) for t in al["match"]):
            brands.append(al.get("brand") or al["match"][0])
            for axis, labels in (al.get("add") or {}).items():
                for lb in labels if axis in wanted else ():
                    wanted[axis][lb] = max(wanted[axis].get(lb, 0), 0.6)   # a brand hint is weaker than a direct word
    for axis, labels in v.axes.items():
        for key, lab in labels.items():
            terms = [key, lab.get("en"), lab.get("ru")] + list(lab.get("syn") or [])
            if any(m.hit(t) for t in terms if t):
                wanted[axis][key] = 1.0
    if "mobile-app" in wanted["medium"]:   # an iOS app is a mobile one too; not the other way round
        wanted["medium"].setdefault("ios-app", 1.0)
    free = [t for i, t in enumerate(m.toks) if i not in m.used and t not in v.stop and t not in v.like and len(t) > 1]
    like = any(t in v.like for t in m.toks) or bool(brands)
    return wanted, brands, free, like


def prepare(entries, v):
    """The entries with their words ready for the scoring (once per library)."""
    rows = []
    for e in entries:
        site = re.sub(r"^https?://(www\.)?", "", e.get("site") or "").split("/")[0]
        nw = v.words(e["name"])
        rows.append({
            "e": e, "t": e.get("labels") or {},
            "name": v.norm(e["name"]), "nw": nw, "nstem": [v.stem(w) for w in nw],
            "site": v.norm(site), "cat": v.norm(e.get("category", "")),
            "desc": {v.stem(w) for w in v.words(e.get("description", ""))},
            "tagw": {v.stem(w) for tg in e.get("tags", []) for w in v.words(tg)},
        })
    return rows


def _name_hits(rows, v, term):
    t = v.norm(term)
    st = v.stem(t)
    out = []
    for r in rows:
        if r["name"] == t or t in r["nw"]:
            out.append((r, 8))
        elif r["site"].split(".")[0] == t:
            out.append((r, 6))   # the site, not the name: not a model for "like X"
        elif len(t) >= 4 and any(s.startswith(st) and len(st) >= 4 for s in r["nstem"]):
            out.append((r, 4))
    return out


def have(t, axis):
    """The labels of an entry on one axis as a list (theme is one word)."""
    v = (t or {}).get(axis)
    return [v] if isinstance(v, str) else (v or [])


def rank(rows, v, query):
    """-> [(entry, labels it has that the query wanted)] best first; [] for a query that says nothing."""
    wanted, brands, free, like = parse(query, v)
    boost = {}   # id -> points for the name
    refs = []    # the entries a "like X" names
    for b in brands + (free if like else []):
        for r, pts in _name_hits(rows, v, b):
            boost[r["e"]["id"]] = max(boost.get(r["e"]["id"], 0), pts)
            if pts == 8:
                refs.append(r)
    if not brands:
        for t in free:
            for r, pts in _name_hits(rows, v, t):
                boost[r["e"]["id"]] = max(boost.get(r["e"]["id"], 0), pts)
    sim = {a: {} for a in AXES}   # the model's labels join the query weakly when one or two entries are named
    if like and 0 < len(refs) <= 2:
        for r in refs:
            for axis in AXES:
                for lb in have(r["t"], axis):
                    sim[axis][lb] = 0.5
    ref_ids = {r["e"]["id"] for r in refs}
    fstem = [v.stem(t) for t in free]
    direct = sum(1 for a in wanted.values() for k in a.values() if k >= 1.0)
    medium = [k for k, w in wanted["medium"].items() if w >= 1.0]
    scored = []
    for r in rows:
        eid = r["e"]["id"]
        s = float(boost.get(eid, 0))
        hits = []
        for axis, w in W_AXIS.items():
            got = have(r["t"], axis)
            for lb, k in list(wanted[axis].items()) + [(x, y) for x, y in sim[axis].items() if x not in wanted[axis]]:
                if lb in got:
                    first = 1 if got[0] == lb and axis in ("style", "industry") else 0
                    s += w * k + first * k
                    hits.append(lb)
        for ft, fs in zip(free, fstem):
            if ft in r["nw"] or fs in r["nstem"]:
                s += 0 if eid in boost else 5
            if r["cat"] and same(fs, v.stem(r["cat"])):
                s += 2
            if any(same(fs, d) for d in r["desc"]):
                s += 1
            if any(same(fs, d) for d in r["tagw"]):
                s += 1.5
        if direct and len(set(hits)) >= direct:
            s += 2   # all the direct labels of the query
        got = have(r["t"], "medium")
        wrong = bool(medium and got and not set(medium) & set(got))
        if eid in ref_ids and not wrong:   # "slides like <brand>": the brand's own site does not beat the slides
            s += 20
        if wrong:
            s *= WRONG_MEDIUM
        if s > 0:
            scored.append((s, r["e"]["name"], r["e"], hits))
    scored.sort(key=lambda x: (-x[0], x[1]))
    others = [x[0] for x in scored if x[2]["id"] not in ref_ids]   # "like X": the style itself is far ahead, the cut goes by its relatives
    if others:
        scored = [x for x in scored if x[2]["id"] in ref_ids or x[0] >= max(others) * CUT]
    return [(e, hits) for _, _, e, hits in scored]
