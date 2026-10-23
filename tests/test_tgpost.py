"""Designs to Telegram as posts (tgpost.py): owner.file of a designer -> telegram.post with a shot and ❤️ 👎; a press and a
reason after 👎 -> a message to the author; off - nothing. Needs the hub code on PYTHONPATH (modules/telegram/design_posts)."""
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
import urllib.parse
from unittest import mock

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="hd-tg-test-")
os.environ["HUB_STATE_DIR"] = os.path.join(TMP, "state")   # never the live hub
os.environ["HUB_CONFIG"] = os.path.join(TMP, "hub.json")
sys.path.insert(0, HERE)
import tgpost  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 64
ON = {"telegram": {"design_posts": True}}


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


@unittest.skipUnless(tgpost.rules(), "no hub code with modules/telegram/design_posts on PYTHONPATH")
class Posts(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(dir=TMP)
        self.journal = os.path.join(self.dir, "journal.jsonl")
        self.seq, self.out, self.cfg = 0, [], dict(ON)
        self.sessions = {"designer": {"cwd": "/w"}, "maps": {"cwd": "/w"}}
        self.shots, self.page = [], None   # page: the address of the hub page the bot links to (none - no link)
        self.add("core.started", {})
        self.p = self.poster()

    def poster(self):
        def shot(path):
            self.shots.append(path)
            return PNG
        return tgpost.Poster(self.dir, shot, lambda: self.cfg, title=lambda p: "Landing", page=lambda: self.page,
                             state=lambda: {"sessions": self.sessions}, emit=lambda t, d: self.out.append((t, d)))

    def add(self, type, data, src="session"):
        self.seq += 1
        with open(self.journal, "a", encoding="utf-8") as f:
            f.write(json.dumps({"seq": self.seq, "type": type, "src": src, "data": data}) + "\n")

    def file(self, sender="designer", path="/w/landing.html"):
        self.add("owner.file", {"path": path, "sender": sender, "channel": "session", "owner": False})
        self.p.poll()

    def posts(self):
        return [d for t, d in self.out if t == "telegram.post"]

    def said(self):
        return [d for t, d in self.out if t == "message.received"]

    def press(self, ref, button):
        self.add("telegram.pressed", {"ext": "hub-design", "ref": ref, "button": button}, src="telegram")
        self.p.poll()

    def test_a_design_goes_as_a_post_with_a_shot_and_buttons_for_its_author(self):
        self.file()
        (post,) = self.posts()
        self.assertEqual(post["buttons"], ["❤️", "👎"])
        self.assertEqual(post["session"], "designer")      # a reply goes to the author
        self.assertIn("Landing", post["text"])
        self.assertIn("designer", post["text"])
        with open(post["path"], "rb") as f:
            self.assertEqual(f.read(), PNG)
        self.assertEqual(self.shots, ["/w/landing.html"])

    def test_a_press_goes_to_the_author_and_dislike_asks_why_once(self):
        self.file()
        ref = self.posts()[0]["ref"]
        self.press(ref, "❤️")
        (msg,) = self.said()
        self.assertEqual(msg["to"], "designer")
        self.assertIn("❤️", msg["text"])
        self.assertIn("/w/landing.html", msg["text"])
        self.press(ref, "👎")
        self.assertEqual(len(self.said()), 2)
        why = self.posts()[1]
        self.assertTrue(why["settle"])
        self.assertNotIn("session", why)                   # the reason comes back to the plugin, not straight to the author
        self.press(ref, "👎")
        self.assertEqual(len(self.posts()), 2)            # a second 👎 - no second question
        self.press(why["ref"], why["buttons"][2])
        self.assertIn("Illustration", self.said()[-1]["text"])
        self.assertEqual(self.said()[-1]["to"], "designer")
        self.press(why["ref"], why["buttons"][0])          # answered - a late press changes nothing
        self.assertEqual(len(self.said()), 4)

    def test_posts_ask_the_bot_to_bump_them_down_the_chat(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        design, why = self.posts()
        self.assertIs(design.get("bump"), True)
        self.assertIs(why.get("bump"), True)

    def test_why_buttons_in_order_and_keys_in_both_languages(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        self.assertEqual(self.posts()[1]["buttons"], ["Composition", "Typography", "Illustration", "Colors", "Everything"])
        ru = ["Композиция", "Типографика", "Иллюстрация", "Цвета", "Всё вместе"]
        for keys in (["Composition", "Typography", "Illustration", "Colors", "Everything"], ru):
            self.assertEqual([tgpost.why_key(b) for b in keys], ["composition", "type", "illustration", "colors", "all"])
        for old in ("Not pretty", "Некрасиво", "Cluttered", "Не то просил", "Не наш стиль"):
            self.assertIsNone(tgpost.why_key(old))

    def test_one_reason_asks_to_fix_it_and_resend_everything_asks_for_a_new_variant(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        why = self.posts()[1]
        self.press(why["ref"], "Colors")
        text = self.said()[-1]["text"]
        self.assertIn("Colors", text)
        self.assertIn("only this", text)
        self.assertIn("send the fixed version again", text)
        self.assertNotIn("new variant", text)
        self.file(path="/w/landing2.html")
        ref2 = self.posts()[-1]["ref"]
        self.press(ref2, "👎")
        self.press(self.posts()[-1]["ref"], "Всё вместе")
        text = self.said()[-1]["text"]
        self.assertIn("Everything", text)
        self.assertIn("new variant", text)
        self.assertNotIn("only this", text)

    def test_a_reason_in_words(self):
        self.file()
        ref = self.posts()[0]["ref"]
        self.press(ref, "👎")
        self.add("telegram.replied", {"ext": "hub-design", "ref": self.posts()[1]["ref"], "text": "too dark"}, src="telegram")
        self.p.poll()
        self.assertIn("too dark", self.said()[-1]["text"])
        self.assertIn("only this", self.said()[-1]["text"])

    def test_off_foreign_or_not_a_design_sends_nothing(self):
        self.cfg = {}
        self.file()
        self.cfg = ON
        self.file("maps")
        self.file(path="/w/shot.png")
        self.add("telegram.pressed", {"ext": "hub-design", "ref": "hd:1", "button": "❤️"}, src="session")   # not from the bot
        self.p.poll()
        self.assertEqual(self.out, [])
        with mock.patch.object(tgpost, "rules", lambda: None):   # the hub's bot has no design posts
            self.file()
        self.assertEqual(self.out, [])

    def test_the_shot_is_of_the_source_not_the_core_copy(self):
        # 22.10: owner.file.path is the core's copy in attachments/ - no assets beside it, outside the folders a shot may
        # open; all 15 live posts went without a picture. The source the session sent is shot, the copy only without it
        src = os.path.join(self.dir, "site", "landing.html")
        os.makedirs(os.path.dirname(src))
        with open(src, "w", encoding="utf-8") as f:
            f.write("<p>x</p>")
        copy = "/state/attachments/ab12/landing.html"
        self.add("owner.file", {"path": copy, "source": src, "sender": "designer", "channel": "session", "owner": False})
        self.add("owner.file", {"path": copy, "source": "/gone/landing.html", "sender": "designer", "channel": "session",
                                "owner": False})
        self.p.poll()
        self.assertEqual(self.shots, [src, copy])
        self.press(self.posts()[0]["ref"], "❤️")
        self.assertIn(src, self.said()[0]["text"])          # the author hears of his own file, not the copy

    def unposts(self):
        return [d["ref"] for t, d in self.out if t == "telegram.unpost"]

    def test_an_answer_on_the_page_removes_the_author_posts_from_telegram(self):
        # d275945, the owner: "if I answer in the chat, delete them in Telegram" - a message from the page (the author's
        # chat or the Hub Design chat, both /api/send) to the author takes back his open posts and their "Why?"
        self.sessions["designer-x"] = {"cwd": "/w"}
        self.file()
        self.file("designer-x")
        first, other = (p["ref"] for p in self.posts())
        self.press(first, "👎")
        why = self.posts()[2]["ref"]

        def say(to, src="web", channel="web", **extra):
            self.add("message.received", {"to": to, "text": "ok", "channel": channel, "owner": src != "session", **extra}, src=src)
            self.p.poll()
        say("maps")                                               # another session
        say("designer", src="telegram", channel="telegram")      # an answer in Telegram - the post stays
        say("designer", src="session", channel="session")        # a session, not the owner
        say("designer", action=True)                             # a page button, not an answer
        self.assertEqual(self.unposts(), [])
        say("designer")
        self.assertEqual(self.unposts(), [first, why])
        say("designer")                                          # once
        self.assertEqual(self.unposts(), [first, why])
        self.press(first, "❤️")                                   # a late press of a removed post - nothing
        self.assertEqual(len(self.said()), 1)
        say("designer-x")
        self.assertEqual(self.unposts(), [first, why, other])
        self.file()                                              # a new design after the answer - a new post
        self.assertEqual(len(self.posts()), 4)

    @unittest.skipUnless(".pptx" in (tgpost.rules() and tgpost.rules().TYPES or ()), "the hub code has no .pptx in design_posts.TYPES")
    def test_a_presentation_goes_as_a_post_carrying_the_file_and_is_not_shot(self):
        self.file(path="/w/Q4 deck.pptx")
        (post,) = self.posts()
        self.assertEqual(post["path"], "/w/Q4 deck.pptx")   # the bot sends it as a document with the buttons: not lost
        self.assertEqual(post["buttons"], ["❤️", "👎"])
        self.assertIn("Q4 deck", post["text"])
        self.assertEqual(self.shots, [])

    def test_video_and_pictures_get_no_post(self):
        for f in ("/w/a.mp4", "/w/a.mov", "/w/a.gif", "/w/a.png", "/w/a.md"):
            self.file(path=f)
        self.assertEqual(self.out, [])

    def test_no_shot_goes_as_text_with_the_path(self):
        self.p.shot = lambda path: None
        self.file()
        (post,) = self.posts()
        self.assertNotIn("path", post)
        self.assertIn("/w/landing.html", post["text"])

    def link_of(self, post):
        """(label, address) of the markdown link in the caption, or None."""
        m = re.search(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", post["text"])
        return m and (m.group(1), m.group(2))

    def test_the_post_carries_a_link_that_opens_the_design_in_hub_design(self):
        self.page = "https://hub.tail.ts.net/"
        self.file(path="/w/My Site (v2)/a&b.html")
        (post,) = self.posts()
        label, url = self.link_of(post)
        self.assertEqual(label, "Open in Hub Design")
        self.assertEqual(url, "https://hub.tail.ts.net/#/x/hub-design?open=%2Fw%2FMy%20Site%20%28v2%29%2Fa%26b.html")   # one address form with the page (designLink, lib.js)
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(url).fragment.split("?", 1)[1])["open"], ["/w/My Site (v2)/a&b.html"])

    def test_the_link_leads_to_the_source_not_the_core_copy_and_follows_the_language(self):
        self.page = "http://100.64.0.1:8787"
        src = os.path.join(self.dir, "landing.html")
        with open(src, "w", encoding="utf-8") as f:
            f.write("<p>x</p>")
        self.add("owner.file", {"path": "/state/attachments/ab12/landing.html", "source": src, "sender": "designer", "channel": "session", "owner": False})
        with mock.patch.object(tgpost, "_lang", lambda: "ru"):
            self.p.poll()
        (post,) = self.posts()
        label, url = self.link_of(post)
        self.assertEqual(label, "Открыть в Hub Design")
        self.assertIn(urllib.parse.quote(src, safe=""), url)
        self.assertNotIn("attachments", url)

    def test_no_page_address_no_link(self):
        self.file()
        (post,) = self.posts()
        self.assertIsNone(self.link_of(post))
        self.assertNotIn("Hub Design", post["text"])

    def test_a_link_goes_with_a_post_without_a_shot_and_not_with_a_presentation(self):
        self.page = "https://hub.tail.ts.net"
        self.p.shot = lambda path: None
        self.file()
        self.file(path="/w/Q4 deck.pptx")   # a presentation does not open on the canvas: nothing to link to
        first, deck = self.posts()
        self.assertIsNotNone(self.link_of(first))
        self.assertIsNone(self.link_of(deck))

    def test_the_default_page_address_is_the_tailnet_one_the_hub_writes(self):
        with open(os.path.join(self.dir, "tailnet.json"), "w", encoding="utf-8") as f:
            json.dump({"ok": True, "urls": {"web": "https://hub.tail.ts.net"}}, f)
        self.p = tgpost.Poster(self.dir, lambda p: PNG, lambda: self.cfg, title=lambda p: "Landing",
                               state=lambda: {"sessions": self.sessions}, emit=lambda t, d: self.out.append((t, d)))
        self.file()
        self.assertTrue(self.link_of(self.posts()[0])[1].startswith("https://hub.tail.ts.net/#/x/hub-design?open="))

    def test_a_restart_does_not_post_again_and_the_first_start_skips_old_files(self):
        self.file()
        self.p = self.poster()
        self.p.poll()
        self.assertEqual(len(self.posts()), 1)
        fresh = tempfile.mkdtemp(dir=TMP)
        shutil.copy(self.journal, os.path.join(fresh, "journal.jsonl"))
        self.dir = fresh
        self.poster().poll()
        self.assertEqual(len(self.posts()), 1)

    def test_the_bot_and_the_plugin_agree_which_file_is_a_design(self):
        # one rule for both: the bot skips exactly what the plugin posts (else a design twice or never)
        from modules.telegram import design_posts
        for sender, path, cfg in [("designer", "/w/a.html", ON), ("designer-x", "/w/a.md", ON), ("maps", "/w/a.html", ON),
                                  ("designer", "/w/a.png", ON), ("designer", "/w/a.html", {}), ("animator", "/w/a.mp4", ON),
                                  ("designer", "/w/a.pptx", ON), ("designer", "/w/a.svg", ON)]:
            self.out.clear()
            self.cfg = cfg
            self.sessions[sender] = {"cwd": "/w"}
            self.file(sender, path)
            self.assertEqual(bool(self.posts()), design_posts.claimed(cfg, sender, {"cwd": "/w"}, path), (sender, path))


class FakeCtl:
    """What tgpost uses of linkctl.Ctl: the question to post, the mark that it went, the answer."""

    def __init__(self, facts):
        self.facts, self.posted, self.answers = facts, False, []

    def to_post(self):
        return None if self.posted else self.facts

    def mark_posted(self):
        self.posted = True

    def answer(self, choice, via="page"):
        self.answers.append((choice, via))


@unittest.skipUnless(tgpost.rules(), "no hub code with modules/telegram/design_posts on PYTHONPATH")
class FirstQuestion(unittest.TestCase):
    """The question of the first start in Telegram: one post with three buttons; the press goes to the plugin."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(dir=TMP)
        self.journal = os.path.join(self.dir, "journal.jsonl")
        self.seq, self.out, self.sessions = 0, [], {"hub-core": {"kind": "hub"}, "writer": {"cwd": "/w"}}
        self.ctl = FakeCtl({"sources": 10, "styles": 2058, "gb": 2.1, "hours": "2-3"})
        self.add("core.started", {})
        self.p = tgpost.Poster(self.dir, lambda path: PNG, lambda: {}, state=lambda: {"sessions": self.sessions},
                               emit=lambda t, d: self.out.append((t, d)), ask=lambda: self.ctl)

    def add(self, type, data, src="session"):
        self.seq += 1
        with open(self.journal, "a", encoding="utf-8") as f:
            f.write(json.dumps({"seq": self.seq, "type": type, "src": src, "data": data}) + "\n")

    def press(self, button, ext="hub-design", ref="hd:first", src="telegram"):
        self.add("telegram.pressed", {"ext": ext, "ref": ref, "button": button}, src=src)
        self.p.poll()

    def test_the_question_goes_once_with_three_buttons_the_numbers_and_the_agents_it_lacks(self):
        self.p.poll()
        self.p.poll()
        (post,) = [d for t, d in self.out if t == "telegram.post"]
        self.assertEqual((post["ref"], post["bump"], bool(post["settle"])), ("hd:first", True, True))
        self.assertEqual(len(post["buttons"]), 3)
        for needle in ("10", "2058", "2.1", "2-3", "designer", "writer"):
            self.assertIn(needle, post["text"])
        self.assertIn("Not in the hub yet: designer", post["text"])   # the writer is a session of the hub, the designer is not
        self.assertTrue(self.ctl.posted)

    def test_nothing_waits_nothing_goes(self):
        self.ctl.posted = True
        self.p.poll()
        self.assertEqual(self.out, [])
        self.p.ask = lambda: None   # no plugin controller (an old process, a flagship hub)
        self.p.poll()
        self.assertEqual(self.out, [])

    def test_a_button_in_either_language_is_the_answer_and_a_foreign_press_is_not(self):
        import firstrun
        for lang, choice in (("en", "yes"), ("ru", "no"), ("en", "settings")):
            self.press(firstrun.STR[lang][choice])
        self.assertEqual(self.ctl.answers, [("yes", "tg"), ("no", "tg"), ("settings", "tg")])
        self.press("❤️")
        self.press(firstrun.STR["en"]["yes"], ext="other")
        self.press(firstrun.STR["en"]["yes"], src="web")
        self.press(firstrun.STR["en"]["yes"], ref="hd:7")
        self.assertEqual(len(self.ctl.answers), 3)


if __name__ == "__main__":
    unittest.main()
