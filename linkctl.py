"""Hub Design: what the settings tab "Hub Design: styles" does with the links (the page only calls it through /__canvas/fetch).

One object joins the memory of the links (links.py), the fetcher (fetcher.py) and the library folder:
  startup()      - at the start of the plugin: the links by default are put once, the styles that are in the library already get their link,
                   the previews a designer brought are taken; the first time (and only then) the owner is asked (firstrun.py) and NOTHING is downloaded -
                   neither the links nor the covers - until the answer "Download" (answer()); after that, if the option is on, every start asks the styles
                   that were never asked for their moving cover (a pass in the background). hub.json auto_download_defaults is the owner's decision: no question
  status()       - what the page draws: the links with the number of their styles, the option, the question of the first start, the question about the previews
  act(body)      - add / remove a link, delete_preview / delete (a link with its styles), auto, decline, nopreview (the list for the designer),
                   firstrun (the answer to the question of the first start, or "again")
Nothing is deleted by anything but act({"action": "delete"}), which the page sends after the owner saw the number."""
import json
import os
import threading

import fetcher
import firstrun
import links as linkmem
import styles

# the sources the owner named: Refero and the repositories of ready style sets (sources/github.py reads exactly these)
DEFAULTS = [
    "https://styles.refero.design/",
    "https://github.com/Meliwat/awesome-ios-design-md",
    "https://github.com/nexu-io/open-design",
    "https://github.com/zarazhangrui/beautiful-html-templates",
    "https://github.com/dreamid27/frontend-slides",
    "https://github.com/lewislulu/html-ppt-skill",
    "https://github.com/bergside/awesome-design-skills",
    "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill",
    "https://github.com/CosmoBlk/email-design",
    "https://github.com/kingadow/email-design-md",
]
TODO = "hub-design-nopreview.json"   # the list for the designer: in the state folder, not in the library of the owner
TODO_MAX = 5000
NOTE_ID = "hub-design-nopreview"
NOTE = {
    "en": ("{n} styles have no preview", "{n} styles have no preview. Ask a designer to make them? Settings → Hub Design: styles."),
    "ru": ("У {n} стилей нет превью", "У {n} стилей нет превью. Дать дизайнеру задание сделать их? Настройки → Hub Design: стили."),
}


def _lang():
    try:
        from core import i18n
        return "ru" if str(i18n.current()).startswith("ru") else "en"
    except Exception:
        return "en"


class Ctl:
    """links - links.Links; fetch - fetcher.Fetcher; target() - the library folder; state - the state folder (the list for the designer lies there);
    notify(type, data) - a fact for the hub (None - none); auto_default - the option when nothing is set; source_list - for tests."""

    def __init__(self, links, fetch, target, state, notify=None, defaults=DEFAULTS, source_list=None):
        self.links, self.fetch, self.target, self.state = links, fetch, target, state
        self.notify, self.defaults, self.source_list = notify, defaults, source_list
        self.watch = True   # a download begun by the answer is watched (the owner is told about the styles without a preview); tests switch it off
        self.auto_started = False   # this run was begun by startup(): when it ends, the owner is told about the styles without a preview
        self.lock = threading.Lock()

    def canon(self, url):
        return fetcher.canon(url, self.source_list)

    # --- the start ---

    def startup(self, watch=True, auto=None):
        """-> "seeded" (the first time: the links were put), "" otherwise. The download of the first time is begun in the background (see class).
        auto - the option from hub.json (None: the one of the tab)."""
        root = self.target()
        self.watch = watch
        if auto is not None and self.links.first in ("", "pending"):   # hub.json decided: it is not asked
            self.links.set_first("config")
        on = self.links.auto if auto is None else auto
        first = not self.links.seeded
        put = self.links.seed([self.canon(u) for u in self.defaults]) if first else []
        if self.links.first == "" and first and put:
            self.links.set_first("pending")
        if self.links.first == "pending":   # asked, no answer: nothing goes to the network
            on = False
        saved = {self.canon(u) for u in self.links.urls()}
        if os.path.isdir(root):
            linkmem.bind_existing(root, saved, self.source_list)
            linkmem.adopt_previews(root)
        if first and put and on:
            ok, _code, _link = self.fetch.start(put)
            if ok:
                self.auto_started = True
                if watch:
                    threading.Thread(target=self._watch, daemon=True).start()
        elif on:   # the styles are there already (a library from before the covers, an update): their covers come in the background
            self.fetch.start_covers()
        return "seeded" if first and put else ""

    # --- the question of the first start ---

    def facts(self):
        """What the question says: the sources, the size and the time (the page and Telegram write the text from it)."""
        return {**firstrun.FACTS, "sources": len(self.defaults), "links": [self.canon(u) for u in self.defaults], "agents": list(firstrun.AGENTS)}

    def question(self):
        """The question while it waits for the answer, otherwise None."""
        return self.facts() if self.links.first == "pending" else None

    def to_post(self):
        """The question that is to go to Telegram (asked and not posted yet) -> the facts, else None. mark_posted() after it went."""
        return self.facts() if self.links.first == "pending" and not self.links.ask_posted else None

    def mark_posted(self):
        self.links.set_ask_posted(True)

    def answer(self, choice, via="page"):
        """The owner answered: yes - the links by default are downloaded now (and the option is on), no / settings - nothing is downloaded (the option is
        off; "settings" is for the one who goes to change it in the tab). Answered already - nothing happens. Answered on the page, the Telegram post
        is erased (telegram.unpost); a press in Telegram settles its post itself. -> the answer: "yes" | "no" | "settings" | "" (it was not asked)."""
        if choice not in firstrun.CHOICES or self.links.first != "pending":
            return self.links.first if self.links.first in firstrun.CHOICES else ""
        self.links.set_first(choice)
        self.links.set_auto(choice == "yes")
        if choice == "yes":
            urls = [x["url"] for x in self.links.items() if x["default"]]
            if urls:
                ok, _code, _link = self.fetch.start(urls)
                if ok:
                    self.auto_started = True
                    if self.watch:
                        threading.Thread(target=self._watch, daemon=True).start()
        if via == "page" and self.links.ask_posted and self.notify:
            self.notify("telegram.unpost", {"ref": firstrun.REF})
        return choice

    def by_hand(self):
        """The owner started a download in the settings tab while the question waited: the question is answered (he is in the settings already); the
        option stays as the tab has it."""
        if self.links.first == "pending":
            self.links.set_first("settings")
            if self.links.ask_posted and self.notify:
                self.notify("telegram.unpost", {"ref": firstrun.REF})

    def again(self):
        """The settings tab asks the question once more (and Telegram gets it again)."""
        self.links.set_first("pending")

    def _watch(self):
        """The background download is over: one fact to the owner if some styles have no preview (the question itself waits in the settings tab)."""
        self.fetch.join(timeout=24 * 3600)
        self.finished()
        self.fetch.start_covers()   # the styles that were there before this run have no cover yet: the run asked only for the new ones

    def finished(self):
        if not self.auto_started:
            return
        self.auto_started = False
        n = self.nopreview()["n"]
        if n and self.notify:
            title, text = NOTE[_lang()]
            self.notify("owner.notify", {"id": NOTE_ID, "title": title.format(n=n), "text": text.format(n=n), "urgency": "later", "asked": True})

    # --- what the page shows ---

    def nopreview(self):
        """{"n": styles with no preview that came by a link and that the owner was not asked about yet, "urls": their links}; not while a run is on."""
        root = self.target()
        if not os.path.isdir(root) or self.fetch.status()["state"] in ("running", "stopping"):
            return {"n": 0, "urls": []}
        linkmem.adopt_previews(root)
        skip = set(self.links.declined())
        rows = linkmem.without_preview(root, skip)
        urls = sorted({u for _sid, _e, ls in rows for u in ls})
        return {"n": len(rows), "urls": urls}

    def status(self):
        root = self.target()
        have = linkmem.counts(root) if os.path.isdir(root) else {}
        rows = []
        for it in self.links.items():
            rows.append({**it, "n": have.get(self.canon(it["url"]), 0)})
        return {"links": rows, "auto": self.links.auto, "nopreview": self.nopreview(), "first": self.links.first, "firstrun": self.question()}

    # --- what the page asks for ---

    def act(self, body):
        """-> (http status, answer). The answer carries "error" when it is a refusal."""
        action = body.get("action")
        url = self.canon(body["url"]) if isinstance(body.get("url"), str) and body["url"].strip() else ""
        if action == "add":
            if not url or len(url) > fetcher.LINK_MAX or not url.startswith(("http://", "https://")):
                return 400, {"error": "bad_link", "link": str(body.get("url") or "")[:fetcher.LINK_MAX]}
            if len(self.links.urls()) >= fetcher.LINKS_MAX:
                return 400, {"error": "too_many"}
            self.links.add(url)
            return 200, {"link": url}
        if action == "remove":   # only the link: its styles stay (the page asks "delete" for those)
            self.links.remove(url)
            return 200, {"link": url}
        if action == "delete_preview":
            if not self.links.has(url):
                return 404, {"error": "no_link"}
            return 200, linkmem.preview_delete(self.target(), self.canon(url))
        if action == "delete":
            if not self.links.has(url):
                return 404, {"error": "no_link"}
            if self.fetch.status()["state"] in ("running", "stopping"):
                return 409, {"error": "busy"}
            with self.lock:
                res = linkmem.delete(self.target(), self.canon(url), self.source_list)
                self.links.remove(url)
            return 200, res
        if action == "auto":
            self.links.set_auto(bool(body.get("on")))
            return 200, {"auto": self.links.auto}
        if action == "decline":
            self.links.decline(self.nopreview()["urls"])
            return 200, {"declined": True}
        if action == "firstrun":
            if body.get("choice") == "again":
                self.again()
                return 200, {"first": self.links.first}
            if body.get("choice") not in firstrun.CHOICES:
                return 400, {"error": "choice"}
            return 200, {"first": self.answer(body["choice"])}
        if action == "nopreview":   # "Give the task": the list of the styles for the designer, written to the state folder
            return 200, self.todo_list(decline=body.get("decline", True) is not False)
        return 400, {"error": "action"}

    def todo_list(self, decline=True):
        """Writes the list of the styles with no preview for the designer -> {"path", "n", "dir"}. decline: the question is not asked about them again
        (the page sends decline:false and declines itself once the task is sent)."""
        root = self.target()
        rows = linkmem.without_preview(root, set(self.links.declined()))[:TODO_MAX]
        pdir = os.path.join(root, "previews")
        items = [{"id": sid, "name": e.get("name") or sid, "md": os.path.join(root, e["file"]), "category": e.get("category") or "",
                  "preview_to": os.path.join(pdir, linkmem.preview_name(sid))} for sid, e, _ls in rows]
        path = os.path.join(self.state, TODO)
        os.makedirs(self.state, exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            json.dump({"previews_dir": pdir, "how": "save a picture of a style as <preview_to>.png (or .jpg/.webp), ~1280x800", "styles": items}, f, ensure_ascii=False, indent=1)
        os.replace(tmp, path)
        if decline:
            self.links.decline(sorted({u for _sid, _e, ls in rows for u in ls}))
        return {"path": path, "n": len(items), "dir": pdir}
