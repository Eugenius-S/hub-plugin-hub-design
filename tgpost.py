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
import re
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
BATCH_GAP = 30 * 60   # s: designs of one author in one task folder sent no more than this apart are one batch
REPLY_TO_POST = re.compile(r"\(\u0432 \u043e\u0442\u0432\u0435\u0442 \u043d\u0430 \u043f\u043e\u0441\u0442 ([^\s,)]+)")   # the bot's mark "(in reply to post <ref>" in Russian, under the owner's words on a post - protocol, not text
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


def folders(path):
    """The folders that tie designs into one task: the design's own folder and the one above it (<task>/<design>/index.html,
    <task>/<design>.html) - two designs of one task share one of them."""
    own = os.path.dirname(str(path or "").replace("\\", "/"))
    return {own, os.path.dirname(own)} - {"", "/"}


def pack_line(s, pack):
    """What a message to the author of a batch adds to the owner's feedback on one of its designs. The designer's rule
    recognizes it by "applies to the whole batch of N designs"; the same line closes a "Why?" and a reply."""
    names = "; ".join(f"\"{m['title']}\" ({m['path']})" for m in pack)
    return (f"This applies to the whole batch of {len(pack)} designs you sent together: {names}; do not send the old variants, "
            "redo the batch: stop finishing the old ones, send new variants of all of them as one batch (hub send-file each). "
            f"{task_line(s['path'])}")


def tailnet_page(state_dir):
    """The address of the hub page in the tailnet (the hub's tailnet module writes it; the bot builds its links from the same file); none - None."""
    try:
        from modules.tailnet import access
        st = access.status(state_dir)
        return (st.get("urls") or {}).get("web") if st.get("ok") else None
    except Exception:
        return None


def task_line(path):
    """Where the next version of a design goes: a folder of its own in the folder of its task, next to this one."""
    k = str(path or "").replace("\\", "/")
    own = os.path.dirname(k)
    folder = os.path.dirname(own) if os.path.basename(k).lower() == "index.html" else own
    return (f"Save it in the task folder {folder}/ as a folder of its own (<design-name>-<round>/index.html, its assets inside), "
            "not next to the files and not in your working folder.")


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


def strips_buttons():
    """Does the bot take `telegram.unpost {ref, buttons_only: true}` (the buttons go, the picture stays)? A bot without it
    would erase the post, so nothing is sent then."""
    dp = rules()
    return bool(dp and getattr(dp, "BUTTONS_ONLY", False))


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
            return self.replied_in_telegram(ev, data) if ev.get("src") == "telegram" else self.answered_on_page(ev, data)
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
        s = self.followed(self.st["sent"].get(ref))
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
        at = ev.get("ts") if isinstance(ev.get("ts"), (int, float)) else time.time()
        self.st["sent"][ref] = {"session": sender, "path": design, "title": title, "at": at}
        while len(self.st["sent"]) > KEEP_SENT:
            del self.st["sent"][next(iter(self.st["sent"]))]
        self.emit("telegram.post", {"text": text, "ref": ref, "buttons": [LIKE, NOPE], "session": sender,
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

    def pack_of(self, ref):
        """The refs of the batch a posted design belongs to, oldest first; [] - it is alone. A batch: posts of one author whose
        designs share a task folder (folders()) and follow each other within BATCH_GAP, none of them answered yet (a ❤️ or an
        earlier 👎 takes a post out). A post settled by a batch keeps its batch (`pack`)."""
        sent = self.st["sent"]
        s = sent.get(ref)
        if not s:
            return []
        kept = [r for r in s.get("pack") or [] if r in sent]
        if len(kept) >= 2:
            return kept
        at = lambda c: c.get("at")   # noqa: E731 - a post from before 0.38 has no time: it joins nothing
        members, grew = [ref], at(s) is not None
        while grew:
            grew = False
            for r, c in sent.items():
                if r in members or c.get("session") != s["session"] or c.get("rated") or c.get("pack") or at(c) is None:
                    continue
                if any(folders(c["path"]) & folders(sent[m]["path"]) and abs(at(c) - at(sent[m])) <= BATCH_GAP for m in members):
                    members.append(r)
                    grew = True
        return sorted(members, key=lambda r: sent[r]["at"]) if len(members) > 1 else []

    def say_pack(self, ref, pack, text, tail=""):
        """The owner's feedback on one design of a batch: to the author mid-turn, in words about the whole batch. No lane, no reject: the
        edit lane is for a single design; `batch` is the core's mark to hand it to the busy author at once."""
        s = self.st["sent"][ref]
        members = [self.followed(self.st["sent"][r]) for r in pack]
        self.say(s["session"], f"{text} {pack_line(s, members)} {tail}".strip(), {"batch": True})

    def settle_pack(self, ref, pack):
        """After the owner's feedback on one design of a batch the others stop waiting: their buttons (and an open "Why?") go,
        the pictures stay. A bot without the buttons-only unpost cannot do that - nothing is sent to it."""
        sent = self.st["sent"]
        for r in pack:
            m = sent.get(r)
            if not m:
                continue
            fresh = not m.get("pack")
            m["pack"], m["rated"] = pack, True
            if r == ref or not fresh or not strips_buttons():
                continue
            self.emit("telegram.unpost", {"ref": r, "buttons_only": True})
            for why in [w for w, d in self.st["why"].items() if d == r]:
                del self.st["why"][why]
                self.emit("telegram.unpost", {"ref": why, "buttons_only": True})

    def replied_in_telegram(self, ev, data):
        """The owner's words as a reply to a design post (the bot hands them to the author, the post's session, with the mark
        "(in reply to post <ref>)", in Russian): on a post of a batch the author is told at once that it is about the whole batch."""
        if data.get("channel") != "telegram" or data.get("owner") is not True:
            return
        text = str(data.get("text") or "")
        m = REPLY_TO_POST.search(text)
        s = self.followed(self.st["sent"].get(m.group(1))) if m else None
        if not s or s["session"] != data.get("to"):
            return
        ref = m.group(1)
        pack = self.pack_of(ref)
        words = text[:m.start()].strip()
        if not pack or not words:
            return
        self.say_pack(ref, pack, f"hub-design: the owner replied in Telegram to your design \"{s['title']}\" ({s['path']}): {words}.")
        self.settle_pack(ref, pack)

    def rated(self, ref, s, button, ev=None):
        what = ("liked it - keep this direction" if button == LIKE
                else "disliked it - the reason follows if the owner gives one")
        text = f"hub-design: the owner gave your design \"{s['title']}\" ({s['path']}) a {button} in Telegram: {what}."
        pack = self.pack_of(ref) if button == NOPE else []
        if pack:   # one design of a batch: all of it
            self.say_pack(ref, pack, text)
            self.settle_pack(ref, pack)
        else:
            self.say(s["session"], text, self.reject(ev, s["path"]) if ev and button == NOPE else None)
            s["rated"] = True   # answered: it is not part of any later batch
        if button == NOPE and not s.get("asked"):
            s["asked"] = True
            n = self.st["n"] = self.st["n"] + 1
            why = f"why:{ref}#{n}"
            self.st["why"][why] = ref
            while len(self.st["why"]) > KEEP_WHY:
                del self.st["why"][next(iter(self.st["why"]))]
            lang = _lang()
            self.emit("telegram.post", {"text": tr(lang, "why_ask"), "ref": why, "settle": tr(lang, "why_settle"),
                                        "buttons": [tr(lang, f"why_{k}") for k in WHY], "lane": s["path"],
                                        "multi": {"done": tr(lang, "why_done"), "all": tr(lang, "why_pick_all"),
                                                  "none": tr(lang, "why_pick_none")}})

    def followed(self, s):
        """A posted design that layout.py moved to its task folder: the post now names the new place."""
        if not s or not s.get("path"):
            return s
        if getattr(self, "moves", None) is None:
            import layout
            self.moves = layout.Moves(self.dir)
        self.moves.fresh()
        new = self.moves.remap(s["path"])
        if new != s["path"]:
            s["path"] = new
            self.save()
        return s

    def answer_why(self, why, button=None, text=None, ev=None, chosen=None):
        """The owner's reasons come to the author in one message: the ticked ones (Done: `chosen`), his own words, or both. Every
        reason ticked - the design does not work as a whole: a new variant, not a patch. The last line is a record the designer
        can collect: `Feedback record: design=<path>; verdict=dislike; reasons=a,b; words="..."`."""
        labels = chosen if chosen else [button] if button else []
        keys = [k for k in dict.fromkeys(why_key(b) for b in labels) if k]
        if not (text or keys):
            return
        ref = self.st["why"].pop(why)
        s = self.followed(self.st["sent"].get(ref))
        if not s:
            return
        pack = self.pack_of(ref)
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
        todo += f" {task_line(s['path'])}"
        head = f"hub-design: why the owner disliked your design \"{s['title']}\" ({s['path']}): {'; '.join(said)}."
        tail = (f"Feedback record: design={s['path']}; verdict=dislike; reasons={record}; "
                f"words={json.dumps(text or '', ensure_ascii=False)}")
        if pack:   # a design of a batch: the reasons are about all of it
            self.say_pack(ref, pack, head, tail)
            self.settle_pack(ref, pack)
            return
        self.say(s["session"], f"{head} {todo} {tail}", self.reject(ev, s["path"]) if ev else None)

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
