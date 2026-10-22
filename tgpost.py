"""Hub Design in Telegram: a design a designer sends the owner (`hub send-file`, the owner.file fact) goes to Telegram as a
post - a shot of its first screen, the name and whose it is, ❤️ and 👎 buttons. A press goes back to the author as a
message; after 👎 a "Why?" with reason buttons follows (a reply in words works too). A reply to the post goes to the author
(the bot does that: the post carries the author's session).

Off by default. It works only on a hub whose Telegram bot knows the telegram.post fact and the telegram.design_posts
setting (modules/telegram/design_posts.py): the bot then skips the design as a document, and this process posts it - the
rule which files are designs is one for both, so the owner gets a design once. No such module - nothing is sent.
Turned on by hub.json "telegram": {"design_posts": true}.

It reads the journal with its own offset and does not touch the core. Texts for the owner are in the hub language
(core.i18n.current()), read when sent; messages to sessions are English."""
import hashlib
import json
import os
import sys
import time

EXT = "hub-design"   # the facts are signed ext:hub-design - the bot passes presses and replies back by this name
LIKE, NOPE = "❤️", "👎"
WHY = ["ugly", "off-brief", "cluttered", "type", "off-style"]   # reasons after 👎: STR key suffixes
KEEP_SENT, KEEP_WHY, KEEP_SHOTS = 300, 200, 50
TICK = 2   # s between journal reads

STR = {
    "en": {
        "caption": "**{title}** · {who}\nReply to send {who} an edit.",
        "why_ask": "Why 👎? Press a button - or reply in your own words.",
        "why_settle": "Why: {}",
        "why_ugly": "Not pretty",
        "why_off-brief": "Not what I asked",
        "why_cluttered": "Cluttered",
        "why_type": "Weak type",
        "why_off-style": "Not our style",
    },
    "ru": {
        "caption": "**{title}** · {who}\nРеплай — правка для {who}.",
        "why_ask": "Почему 👎? Кнопка — или реплаем своими словами.",
        "why_settle": "Почему: {}",
        "why_ugly": "Некрасиво",
        "why_off-brief": "Не то просил",
        "why_cluttered": "Перегружено",
        "why_type": "Слабая типографика",
        "why_off-style": "Не наш стиль",
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
    """The reason key of a pressed button in any language of the table (the language may have changed since); None - not a reason."""
    for k in WHY:
        if any(t.get(f"why_{k}") == button for t in STR.values()):
            return k
    return None


def rules():
    """The bot's rule which files are designs (modules/telegram/design_posts.py); None - this hub's bot does not have it."""
    try:
        from modules.telegram import design_posts
        return design_posts
    except Exception:
        return None


class Poster:
    """shot(path) -> PNG bytes or None; config() -> hub.json; state(path) -> the hub state (sessions); emit(type, data) - a fact."""

    def __init__(self, state_dir, shot, config, title=None, state=None, emit=None):
        from core import journal
        self.journal = journal
        self.dir, self.path = state_dir, os.path.join(state_dir, "journal.jsonl")
        self.mine = os.path.join(state_dir, "hub-design", "telegram.json")
        self.shots = os.path.join(state_dir, "hub-design", "telegram")
        self.shot, self.config = shot, config
        self.title = title or (lambda p: "")
        self.state = state or (lambda: journal.load_state(state_dir))
        self.emit = emit or self.spool
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

    def say(self, session, text):
        self.emit("message.received", {"to": session, "channel": "session", "owner": False, "sender": EXT, "text": text})

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
        if kind not in ("telegram.pressed", "telegram.replied") or data.get("ext") != EXT or ev.get("src") != "telegram":
            return
        ref = str(data.get("ref") or "")
        if ref in self.st["why"]:
            return self.answer_why(ref, data.get("button"), (data.get("text") or "").strip() if kind == "telegram.replied" else None)
        s = self.st["sent"].get(ref)
        if not s:
            return
        if kind == "telegram.pressed" and data.get("button") in (LIKE, NOPE):
            return self.rated(ref, s, data["button"])
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
        title = self.title(design) or os.path.splitext(os.path.basename(design))[0]
        lang = _lang()
        text = tr(lang, "caption", title=title.replace("*", ""), who=sender)
        png = self.keep(self.shot(design))
        if not png:   # no shot (no Chrome, an error): the post goes as text with the path - a link to the file on the page
            text += f"\n\n`{design}`"
        ref = f"hd:{ev['seq']}"
        self.st["sent"][ref] = {"session": sender, "path": design, "title": title}
        while len(self.st["sent"]) > KEEP_SENT:
            del self.st["sent"][next(iter(self.st["sent"]))]
        self.emit("telegram.post", {"text": text, "ref": ref, "buttons": [LIKE, NOPE], "session": sender,
                                    **({"path": png} if png else {})})

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

    def rated(self, ref, s, button):
        what = ("liked it - keep this direction" if button == LIKE
                else "disliked it - the reason follows if the owner gives one; do not send this version again")
        self.say(s["session"], f"hub-design: the owner gave your design \"{s['title']}\" ({s['path']}) a {button} in "
                               f"Telegram: {what}.")
        if button == NOPE and not s.get("asked"):
            s["asked"] = True
            n = self.st["n"] = self.st["n"] + 1
            why = f"why:{ref}#{n}"
            self.st["why"][why] = ref
            while len(self.st["why"]) > KEEP_WHY:
                del self.st["why"][next(iter(self.st["why"]))]
            lang = _lang()
            self.emit("telegram.post", {"text": tr(lang, "why_ask"), "ref": why, "settle": tr(lang, "why_settle"),
                                        "buttons": [tr(lang, f"why_{k}") for k in WHY]})

    def answer_why(self, why, button=None, text=None):
        code = why_key(button) if button else None
        if not (text or code):
            return
        s = self.st["sent"].get(self.st["why"].pop(why))
        if not s:
            return
        reason = text or tr("en", f"why_{code}")
        self.say(s["session"], f"hub-design: why the owner disliked your design \"{s['title']}\" ({s['path']}): {reason}. "
                               f"Take it into account in the next version.")

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


def run(state_dir, shot, config, title=None):
    """The process loop (a thread of server.py). No core nearby (not under a hub) - returns at once."""
    try:
        p = Poster(state_dir, shot, config, title)
    except Exception as e:
        sys.stderr.write(f"hub-design: telegram posts are off ({e})\n")
        return
    while True:
        try:
            p.poll()
        except Exception as e:
            sys.stderr.write(f"hub-design: telegram: {e}\n")
        time.sleep(TICK)
