"""Hub Design in Telegram: a design a designer sends the owner (`hub send-file`, the owner.file fact) goes to Telegram as a
post - a shot of its first screen, the name and whose it is, ❤️ and 👎 buttons. A press goes back to the author as a
message; after 👎 a "Why?" with reason buttons follows (a reply in words works too). A reply to the post goes to the author
(the bot does that: the post carries the author's session).

Off by default. It works only on a hub whose Telegram bot knows the telegram.post fact and the telegram.design_posts
setting (modules/telegram/design_posts.py): the bot then skips the design as a document, and this process posts it - the
rule which files are designs is one for both, so the owner gets a design once. No such module - nothing is sent.
Turned on by hub.json "telegram": {"design_posts": true}.

The owner answers the author on the page (a message from the page to that session) - the author's posts are removed from
Telegram (telegram.unpost). It reads the journal with its own offset and does not touch the core. Texts for the owner are in the hub language
(core.i18n.current()), read when sent; messages to sessions are English."""
import hashlib
import json
import os
import sys
import time
import urllib.parse

import firstrun

EXT = "hub-design"   # the facts are signed ext:hub-design - the bot passes presses and replies back by this name
LIKE, NOPE = "❤️", "👎"
WHY = ["composition", "type", "illustration", "colors", "angles", "balance"]   # reasons after 👎 (ticks, any number): STR key suffixes
LEGACY = {"Иллюстрация": "illustration", "Illustration": "illustration"}   # a button of a "Why?" posted before 0.32 stays valid
ASPECT = {   # what the author is told for a reason key (English: messages to sessions are English)
    "composition": "composition (positions, layout)", "type": "typography", "illustration": "graphics and illustration",
    "colors": "colors", "angles": "angles (corner radii)", "balance": "balance"}
KEEP_SENT, KEEP_WHY, KEEP_SHOTS = 300, 200, 50
TICK = 2   # s between journal reads
DECKS = (".pptx",)   # no shot to make: the post carries the file itself (the bot sends it as a document with the buttons)

STR = {
    "en": {
        "caption": "**{title}** · {who}\nReply to send {who} an edit.",
        "open": "Open in Hub Design",
        "why_ask": "Why 👎? Tick what did not work (any number), then press Done. Or reply in your own words.",
        "why_settle": "Why: {}",
        "why_composition": "Composition",
        "why_type": "Typography",
        "why_illustration": "Graphics & illustration",
        "why_colors": "Colors",
        "why_angles": "Angles (corners)",
        "why_balance": "Balance",
        "why_all": "Everything",
        "why_pick_all": "Select all",
        "why_pick_none": "Clear all",
        "why_done": "Done",
    },
    "ru": {
        "caption": "**{title}** · {who}\nОтветьте на пост, чтобы отправить правку {who}.",
        "open": "Открыть в Hub Design",
        "why_ask": "Почему 👎? Отметьте, что не зашло (сколько угодно), и нажмите «Готово». Или ответьте своими словами.",
        "why_settle": "Почему: {}",
        "why_composition": "Композиция",
        "why_type": "Типографика",
        "why_illustration": "Графика и иллюстрации",
        "why_colors": "Цвета",
        "why_angles": "Углы (скругления)",
        "why_balance": "Баланс",
        "why_all": "Всё вместе",
        "why_pick_all": "Выбрать всё",
        "why_pick_none": "Снять всё",
        "why_done": "Готово",
    },
}


def _lang():
    try:
        from core import i18n
        return i18n.current()
    except Exception:
        return (os.environ.get("HUB_LANG") or "en").split("-")[0].lower()


def tr(lang, key, **params):
    base = (lang or "en").split("-")[0].lower()
    text = (STR.get(base) or STR["en"]).get(key) or STR["en"][key]
    return text.format(**params) if params else text


def why_key(button):
    """The reason key of a pressed button in any language of the table (the language may have changed since); None - not a reason.
    "all" is only the button of a "Why?" posted before the ticks (0.32)."""
    if button in LEGACY:
        return LEGACY[button]
    for k in WHY + ["all"]:
        if any(t.get(f"why_{k}") == button for t in STR.values()):
            return k
    return None


def tailnet_page(state_dir):
    """The address of the hub page in the tailnet (the hub's tailnet module writes it; the bot builds its links from the same file); none - None."""
    try:
        from modules.tailnet import access
        st = access.status(state_dir)
        return (st.get("urls") or {}).get("web") if st.get("ok") else None
    except Exception:
        return None


def open_link(page, path):
    """The address that opens a design on the canvas of Hub Design - the form of designLink (lib.js): <page>/#/x/hub-design?open=<path>."""
    return f"{page.rstrip('/')}/#/x/{EXT}?open={urllib.parse.quote(path, safe='')}"


def rules():
    """The bot's rule which files are designs (modules/telegram/design_posts.py); None - this hub's bot does not have it."""
    try:
        from modules.telegram import design_posts
        return design_posts
    except Exception:
        return None


class Poster:
    """shot(path) -> PNG bytes or None; config() -> hub.json; state(path) -> the hub state (sessions); emit(type, data) - a fact."""

    def __init__(self, state_dir, shot, config, title=None, state=None, emit=None, ask=None, page=None):
        from core import journal
        self.journal = journal
        self.dir, self.path = state_dir, os.path.join(state_dir, "journal.jsonl")
        self.mine = os.path.join(state_dir, "hub-design", "telegram.json")
        self.shots = os.path.join(state_dir, "hub-design", "telegram")
        self.shot, self.config = shot, config
        self.title = title or (lambda p: "")
        self.state = state or (lambda: journal.load_state(state_dir))
        self.emit = emit or self.spool
        self.page = page or (lambda: tailnet_page(state_dir))   # -> the address of the hub page (none - no link in the post)
        self.ask = ask or (lambda: None)   # -> linkctl.Ctl: the question of the first start (firstrun.py) is posted here and its press is read here
        try:
            with open(self.mine, encoding="utf-8") as f:
                self.st = json.load(f)
        except (OSError, ValueError):
            self.st = None
        self.ino, self.offset = journal.identity(self.path), self.size()
        if self.st is None:   # first start - from the end of the journal: old designs do not come again
            last = journal.read_tail(self.path)
            self.st = {"seq": last[-1]["seq"] if last else 0}
            self.shape()
            self.save()
        else:   # while it was down - catch up from the journal tail
            self.shape()
            self.handle(journal.read_tail(self.path))

    def shape(self):
        self.st.setdefault("sent", {})   # ref -> {session, path, title, asked}: a press is recognized by it
        self.st.setdefault("why", {})    # ref of a "Why?" question -> the design ref
        self.st.setdefault("n", 0)

    def size(self):
        try:
            return os.path.getsize(self.path)
        except OSError:
            return 0

    def save(self):
        os.makedirs(os.path.dirname(self.mine), exist_ok=True)
        tmp = self.mine + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.st, f, ensure_ascii=False)
        os.replace(tmp, self.mine)

    def spool(self, type, data):
        from core import spool
        spool.put(os.path.join(self.dir, "spool"), type, None, data, src=f"ext:{EXT}")

    def say(self, session, text, extra=None):
        self.emit("message.received", {"to": session, "channel": "session", "owner": False, "sender": EXT, "text": text,
                                       **(extra or {})})

    @staticmethod
    def reject(ev, path):
        """The owner's own 👎 or its reason is a reject of the design: the core gives it to the design's edit lane and to
        the author mid-turn (hub.json design_lane). It checks that the owner did react to this ref (react = the seq of
        his telegram.pressed/replied); a core without lanes ignores the fields."""
        return {"lane": path, "reject": True, "react": ev["seq"], "ref": str((ev.get("data") or {}).get("ref") or "")}

    def handle(self, events):
        changed = False
        for ev in events:
            if not isinstance(ev, dict) or not isinstance(ev.get("seq"), int) or ev["seq"] <= self.st["seq"]:
                continue
            self.st["seq"] = ev["seq"]
            changed = True
            try:
                self.react(ev)
            except Exception as e:   # one bad event does not stop the rest
                sys.stderr.write(f"hub-design: telegram: {ev.get('type')} {ev['seq']}: {e}\n")
        if changed:
            self.save()

    def react(self, ev):
        data = ev.get("data") or {}
        kind = ev.get("type")
        if kind == "owner.file":
            return self.offer(ev, data)
        if kind == "message.received":
            return self.answered_on_page(ev, data)
        if kind not in ("telegram.pressed", "telegram.replied") or data.get("ext") != EXT or ev.get("src") != "telegram":
            return
        ref = str(data.get("ref") or "")
        if ref == firstrun.REF:
            return self.first_pressed(data.get("button")) if kind == "telegram.pressed" else None
        if ref in self.st["why"]:
            chosen = data.get("chosen") if isinstance(data.get("chosen"), list) else None
            if kind == "telegram.pressed" and chosen is None and data.get("done"):   # the bot sends the ticked reasons as `chosen`
                return
            return self.answer_why(ref, data.get("button") if chosen is None else None,
                                   (data.get("text") or "").strip() if kind == "telegram.replied" else None, ev, chosen)
        s = self.st["sent"].get(ref)
        if not s:
            return
        if kind == "telegram.pressed" and data.get("button") in (LIKE, NOPE):
            return self.rated(ref, s, data["button"], ev)
        if kind == "telegram.replied" and (data.get("text") or "").strip():   # the author's session was gone when it was posted
            self.say(s["session"], f"hub-design: the owner replied in Telegram to your design \"{s['title']}\" ({s['path']}): "
                                   f"{data['text'].strip()}")

    def offer(self, ev, data):
        dp, cfg = rules(), self.config()
        sender, path = data.get("sender"), data.get("path")
        if not dp or not dp.config(cfg) or not sender or not isinstance(path, str):
            return
        # the core sends the owner a copy (attachments/<id>/<name>) - no assets beside it and outside the folders the
        # shot may open: the design itself is the source the session sent, while it is there
        src = data.get("source")
        design = src if isinstance(src, str) and os.path.splitext(src)[1].lower() == os.path.splitext(path)[1].lower() \
            and os.path.isfile(src) else path
        if os.path.splitext(path)[1].lower() not in dp.config(cfg)["types"]:
            return
        session = (self.state().get("sessions") or {}).get(sender)
        if not dp.claimed(cfg, sender, session if session is not None else {}, path):
            return
        deck = os.path.splitext(path)[1].lower() in DECKS
        title = (not deck and self.title(design)) or os.path.splitext(os.path.basename(design))[0]
        lang = _lang()
        text = tr(lang, "caption", title=title.replace("*", ""), who=sender)
        png = path if deck else self.keep(self.shot(design))
        page = None if deck else self.page()   # a presentation does not open on the canvas
        if page:
            text += f"\n[{tr(lang, 'open')}]({open_link(page, design)})"
        if not png:  # no shot (no Chrome, an error): the post goes as text with the path - a link to the file on the page
            text += f"\n\n`{design}`"
        ref = f"hd:{ev['seq']}"
        self.st["sent"][ref] = {"session": sender, "path": design, "title": title}
        while len(self.st["sent"]) > KEEP_SENT:
            del self.st["sent"][next(iter(self.st["sent"]))]
        self.emit("telegram.post", {"text": text, "ref": ref, "buttons": [LIKE, NOPE], "session": sender, "bump": True,
                                    "lane": design, **({"path": png} if png else {})})

    def first_pressed(self, button):
        """A button under the question of the first start: the answer goes to the plugin (what is downloaded is decided there)."""
        choice, ctl = firstrun.choice_of(button), self.ask()
        if choice and ctl:
            ctl.answer(choice, via="tg")

    def first_question(self):
        """The question of the first start goes to Telegram once (and again when the settings tab asks it again): only where the bot knows the post."""
        ctl = self.ask()
        facts = ctl.to_post() if ctl else None
        if not facts or not rules():
            return
        lang = _lang()
        lack = firstrun.missing((self.state() or {}).get("sessions"))
        self.emit("telegram.post", {"text": firstrun.text(lang, facts["sources"], lack), "ref": firstrun.REF, "settle": firstrun.tr(lang, "settle"),
                                    "buttons": [firstrun.tr(lang, c) for c in firstrun.CHOICES], "bump": True})
        ctl.mark_posted()

    def answered_on_page(self, ev, data):
        """The owner wrote the author on the page (its chat or the Hub Design chat - both are /api/send): the posts of
        that author's designs are answered - they leave Telegram (telegram.unpost; d275945, the owner: "if I answer in the
        chat, delete them in Telegram"). A page button (action), another session, or a reply in Telegram - no."""
        if ev.get("src") != "web" or data.get("channel") != "web" or data.get("owner") is not True or data.get("action"):
            return
        to = data.get("to")
        refs = [ref for ref, s in self.st["sent"].items() if to and s.get("session") == to]
        if not refs or not rules():
            return
        for ref in refs:
            del self.st["sent"][ref]
            self.emit("telegram.unpost", {"ref": ref})
            for why in [w for w, r in self.st["why"].items() if r == ref]:   # its "Why?" question goes too
                del self.st["why"][why]
                self.emit("telegram.unpost", {"ref": why})

    def keep(self, data):
        if not data:
            return None
        try:
            os.makedirs(self.shots, exist_ok=True)
            out = os.path.join(self.shots, hashlib.sha1(data).hexdigest()[:20] + ".png")
            with open(out, "wb") as f:
                f.write(data)
            old = sorted((os.path.join(self.shots, n) for n in os.listdir(self.shots)), key=os.path.getmtime)
            for p in old[:-KEEP_SHOTS]:
                os.remove(p)
            return out
        except OSError:
            return None

    def rated(self, ref, s, button, ev=None):
        what = ("liked it - keep this direction" if button == LIKE
                else "disliked it - the reason follows if the owner gives one")
        self.say(s["session"], f"hub-design: the owner gave your design \"{s['title']}\" ({s['path']}) a {button} in "
                               f"Telegram: {what}.", self.reject(ev, s["path"]) if ev and button == NOPE else None)
        if button == NOPE and not s.get("asked"):
            s["asked"] = True
            n = self.st["n"] = self.st["n"] + 1
            why = f"why:{ref}#{n}"
            self.st["why"][why] = ref
            while len(self.st["why"]) > KEEP_WHY:
                del self.st["why"][next(iter(self.st["why"]))]
            lang = _lang()
            self.emit("telegram.post", {"text": tr(lang, "why_ask"), "ref": why, "settle": tr(lang, "why_settle"),
                                        "buttons": [tr(lang, f"why_{k}") for k in WHY], "bump": True, "lane": s["path"],
                                        "multi": {"done": tr(lang, "why_done"), "all": tr(lang, "why_pick_all"),
                                                  "none": tr(lang, "why_pick_none")}})

    def answer_why(self, why, button=None, text=None, ev=None, chosen=None):
        """The owner's reasons come to the author in one message: the ticked ones (Done: `chosen`), his own words, or both. Every
        reason ticked - the design does not work as a whole: a new variant, not a patch. The last line is a record the designer
        can collect: `Feedback record: design=<path>; verdict=dislike; reasons=a,b; words="..."`."""
        labels = chosen if chosen else [button] if button else []
        keys = [k for k in dict.fromkeys(why_key(b) for b in labels) if k]
        if not (text or keys):
            return
        s = self.st["sent"].get(self.st["why"].pop(why))
        if not s:
            return
        whole = "all" in keys or set(WHY) <= set(keys)
        names = [ASPECT[k] for k in keys if k in ASPECT]
        said = []
        if names and not whole:
            said.append("what did not work: " + ", ".join(names))
        elif whole:
            said.append("what did not work: everything")
        if text:
            said.append(f"in the owner's words: {text}")
        if whole and not text:
            todo = "The design does not work as a whole: make a new variant, not a patch of this one."
        elif whole:
            todo = "The design does not work as a whole: make a new variant, not a patch of this one, and keep the owner's words in mind."
        else:
            todo = ("Redo only " + ("these aspects" if len(names) > 1 else "this") + " in this design, leave the rest as it is, and send "
                    "the fixed version again (hub send-file) - it comes to the owner as a new post.")
        record = ",".join(WHY if whole else keys) or "words"
        self.say(s["session"], f"hub-design: why the owner disliked your design \"{s['title']}\" ({s['path']}): {'; '.join(said)}. {todo} "
                               f"Feedback record: design={s['path']}; verdict=dislike; reasons={record}; "
                               f"words={json.dumps(text or '', ensure_ascii=False)}",
                 self.reject(ev, s["path"]) if ev else None)

    def poll(self):
        ino = self.journal.identity(self.path)
        if ino != self.ino or self.size() < self.offset:   # the journal was started anew - read the new one from the start
            self.ino, self.offset = ino, 0
        try:
            with open(self.path, "rb") as f:
                f.seek(self.offset)
                chunk = f.read()
        except OSError:
            return
        end = chunk.rfind(b"\n")
        events = []
        if end >= 0:
            self.offset += end + 1
            for line in chunk[:end].split(b"\n"):
                try:
                    events.append(json.loads(line))
                except ValueError:
                    pass
        self.handle(events)
        self.first_question()


def run(state_dir, shot, config, title=None, ask=None):
    """The process loop (a thread of server.py). No core nearby (not under a hub) - returns at once."""
    try:
        p = Poster(state_dir, shot, config, title, ask=ask)
    except Exception as e:
        sys.stderr.write(f"hub-design: telegram posts are off ({e})\n")
        return
    while True:
        try:
            p.poll()
        except Exception as e:
            sys.stderr.write(f"hub-design: telegram: {e}\n")
        time.sleep(TICK)
