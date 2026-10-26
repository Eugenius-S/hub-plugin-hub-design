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

    def add(self, type, data, src="session", ts=None):
        self.seq += 1
        with open(self.journal, "a", encoding="utf-8") as f:
            f.write(json.dumps({"seq": self.seq, "type": type, "src": src, "data": data, **({"ts": ts} if ts else {})}) + "\n")

    def file(self, sender="designer", path="/w/landing.html", ts=None):
        self.add("owner.file", {"path": path, "sender": sender, "channel": "session", "owner": False}, ts=ts)
        self.p.poll()

    def posts(self):
        return [d for t, d in self.out if t == "telegram.post"]

    def said(self):
        return [d for t, d in self.out if t == "message.received"]

    def press(self, ref, button):
        self.add("telegram.pressed", {"ext": "hub-design", "ref": ref, "button": button}, src="telegram")
        self.p.poll()

    def done(self, ref, *chosen):
        """«Done» of the multi-select post: the bot sends one fact with everything ticked."""
        self.add("telegram.pressed", {"ext": "hub-design", "ref": ref, "button": ", ".join(chosen), "chosen": list(chosen), "done": True},
                 src="telegram")
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
        self.press(why["ref"], why["buttons"][2])   # an old single-button "Why?" still works
        self.assertIn("graphics and illustration", self.said()[-1]["text"])
        self.assertEqual(self.said()[-1]["to"], "designer")
        self.press(why["ref"], why["buttons"][0])          # answered - a late press changes nothing
        self.assertEqual(len(self.said()), 4)

    def test_the_owners_dislike_and_its_reason_go_as_a_reject_to_the_designs_edit_lane(self):
        # the core gives a reject to the design's lane and the author mid-turn only on the owner's own reaction to that ref
        self.file()
        ref = self.posts()[0]["ref"]
        self.assertEqual(self.posts()[0]["lane"], "/w/landing.html")   # the core ties a reject to the post's design
        self.press(ref, "❤️")
        self.assertNotIn("lane", self.said()[-1])          # a like is not a reject
        self.press(ref, "👎")
        nope = self.said()[-1]
        self.assertEqual((nope["lane"], nope["reject"], nope["react"], nope["ref"]), ("/w/landing.html", True, self.seq, ref))
        why = self.posts()[1]
        self.assertEqual(why["lane"], "/w/landing.html")
        self.done(why["ref"], "Colors")
        reason = self.said()[-1]
        self.assertEqual((reason["lane"], reason["reject"], reason["react"], reason["ref"]),
                         ("/w/landing.html", True, self.seq, why["ref"]))
        self.assertIn("colors", reason["text"])

    def test_design_posts_do_not_ask_the_bot_to_bump_them_down_the_chat(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        design, why = self.posts()
        self.assertNotIn("bump", design)
        self.assertNotIn("bump", why)

    def batch(self, n=3, task="/w/ads-sale", sender="designer", ts=1000):
        """n designs of one task folder sent one after another; the refs of their posts."""
        for i in range(n):
            self.file(sender, f"{task}/v{i + 1}/index.html", ts=ts + i * 60)
        return [p["ref"] for p in self.posts()[-n:]]

    def batch_said(self):
        return [d for d in self.said() if d.get("batch")]

    def test_a_dislike_on_a_batch_goes_to_the_author_at_once_as_feedback_on_the_whole_batch(self):
        refs = self.batch()
        self.press(refs[1], "👎")
        (msg,) = self.said()
        self.assertEqual(msg["to"], "designer")
        self.assertIs(msg["batch"], True)
        for key in ("lane", "reject", "react", "ref"):   # not the edit lane: a lane is for one design
            self.assertNotIn(key, msg)
        self.assertIn("applies to the whole batch of 3 designs", msg["text"])
        self.assertIn("do not send the old variants", msg["text"])
        for i in (1, 2, 3):
            self.assertIn(f"/w/ads-sale/v{i}/index.html", msg["text"])

    def test_the_other_posts_of_a_batch_lose_their_buttons_and_keep_their_pictures(self):
        refs = self.batch()
        with mock.patch.object(tgpost.rules(), "BUTTONS_ONLY", True, create=True):
            self.press(refs[1], "👎")
        gone = [d for t, d in self.out if t == "telegram.unpost"]
        self.assertEqual(sorted(d["ref"] for d in gone), sorted([refs[0], refs[2]]))
        self.assertTrue(all(d == {"ref": d["ref"], "buttons_only": True} for d in gone))   # never a whole-post unpost
        self.press(refs[1], "👎")   # settled: a repeat touches nothing
        self.assertEqual(len([1 for t, d in self.out if t == "telegram.unpost"]), 2)

    def test_a_bot_without_buttons_only_is_not_asked_to_unpost_anything(self):
        refs = self.batch()
        with mock.patch.object(tgpost.rules(), "BUTTONS_ONLY", False, create=True):
            self.press(refs[0], "👎")
        self.assertEqual([t for t, d in self.out if t == "telegram.unpost"], [])
        self.assertEqual(len(self.batch_said()), 1)   # the feedback still goes

    def test_the_reasons_after_a_dislike_on_a_batch_are_about_the_whole_batch(self):
        refs = self.batch()
        self.press(refs[0], "👎")
        why = self.posts()[-1]
        self.assertEqual(why["lane"], "/w/ads-sale/v1/index.html")
        self.done(why["ref"], "Colors", "Balance")
        reason = self.said()[-1]
        self.assertIs(reason["batch"], True)
        for key in ("lane", "reject", "react", "ref"):
            self.assertNotIn(key, reason)
        self.assertIn("colors", reason["text"])
        self.assertIn("applies to the whole batch of 3 designs", reason["text"])
        self.assertIn("Feedback record: design=/w/ads-sale/v1/index.html; verdict=dislike; reasons=colors,balance", reason["text"])

    def test_words_in_reply_to_a_post_of_a_batch_go_to_the_author_as_about_the_whole_batch(self):
        refs = self.batch()
        mark = "\u0432 \u043e\u0442\u0432\u0435\u0442 \u043d\u0430 \u043f\u043e\u0441\u0442"   # the bot's mark, protocol text
        with mock.patch.object(tgpost.rules(), "BUTTONS_ONLY", True, create=True):
            self.add("message.received", {"to": "designer", "channel": "telegram", "owner": True,
                                          "text": f"new brief, redo it\n\n({mark} {refs[2]})"}, src="telegram")
            self.p.poll()
        (msg,) = self.batch_said()
        self.assertEqual(msg["to"], "designer")
        self.assertIn("new brief, redo it", msg["text"])
        self.assertIn("applies to the whole batch of 3 designs", msg["text"])
        self.assertEqual(len([1 for t, d in self.out if t == "telegram.unpost"]), 2)

    def test_words_on_a_single_design_are_not_touched_by_the_plugin(self):
        self.file(ts=1000)
        mark = "\u0432 \u043e\u0442\u0432\u0435\u0442 \u043d\u0430 \u043f\u043e\u0441\u0442"
        self.add("message.received", {"to": "designer", "channel": "telegram", "owner": True,
                                      "text": f"smaller logo\n\n({mark} {self.posts()[0]['ref']})"}, src="telegram")
        self.p.poll()
        self.assertEqual(self.said(), [])

    def test_a_like_is_for_this_design_only_and_a_liked_design_is_not_in_the_batch(self):
        refs = self.batch(4)
        self.press(refs[0], "❤️")
        (like,) = self.said()
        self.assertNotIn("batch", like)
        self.assertNotIn("whole batch", like["text"])
        self.assertEqual([t for t, d in self.out if t == "telegram.unpost"], [])   # the others still wait
        self.press(refs[3], "👎")
        self.assertIn("whole batch of 3 designs", self.batch_said()[0]["text"])
        self.assertNotIn("/w/ads-sale/v1/index.html", self.batch_said()[0]["text"])

    def test_the_last_design_left_in_a_batch_is_a_single_one(self):
        refs = self.batch(2)
        self.press(refs[0], "❤️")
        self.press(refs[1], "👎")
        nope = self.said()[-1]
        self.assertNotIn("batch", nope)
        self.assertEqual(nope["lane"], "/w/ads-sale/v2/index.html")   # as before: the edit lane

    def test_not_a_batch_other_author_other_folder_or_far_apart(self):
        self.cfg = {"telegram": {"design_posts": {"sessions": "*"}}}
        self.file("designer", "/w/ads-sale/v1/index.html", ts=1000)
        self.file("maps", "/w/ads-sale/v2/index.html", ts=1010)       # another author
        self.file("designer", "/w/poster/v1/index.html", ts=1020)      # another task folder
        self.file("designer", "/w/ads-sale/v3/index.html", ts=1000 + 3 * 3600)   # hours later
        for post in self.posts():
            self.press(post["ref"], "👎")
        self.assertEqual(self.batch_said(), [])
        self.assertEqual(len(self.said()), 4)
        self.assertTrue(all(d.get("reject") for d in self.said()))

    def test_a_batch_survives_a_restart_of_the_plugin(self):
        refs = self.batch()
        self.p = self.poster()
        self.press(refs[2], "👎")
        self.assertIn("whole batch of 3 designs", self.batch_said()[0]["text"])

    def test_why_buttons_in_order_and_keys_in_both_languages(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        en = ["Composition", "Typography", "Graphics & illustration", "Colors", "Angles (corners)", "Balance"]
        self.assertEqual(self.posts()[1]["buttons"], en)
        ru = ["Композиция", "Типографика", "Графика и иллюстрации", "Цвета", "Углы (скругления)", "Баланс"]
        for keys in (en, ru):
            self.assertEqual([tgpost.why_key(b) for b in keys], ["composition", "type", "illustration", "colors", "angles", "balance"])
        self.assertEqual([tgpost.why_key(b) for b in ("Illustration", "Иллюстрация", "Everything", "Всё вместе")],
                         ["illustration", "illustration", "all", "all"])
        for old in ("Not pretty", "Некрасиво", "Cluttered", "Не то просил", "Не наш стиль"):
            self.assertIsNone(tgpost.why_key(old))

    def test_one_reason_asks_to_fix_it_and_resend_everything_asks_for_a_new_variant(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        why = self.posts()[1]
        self.done(why["ref"], "Colors")
        text = self.said()[-1]["text"]
        self.assertIn("colors", text)
        self.assertIn("only this", text)
        self.assertIn("send the fixed version again", text)
        self.assertNotIn("new variant", text)
        self.file(path="/w/landing2.html")
        ref2 = self.posts()[-1]["ref"]
        self.press(ref2, "👎")
        self.done(self.posts()[-1]["ref"], *[tgpost.tr("en", f"why_{k}") for k in tgpost.WHY])   # every reason ticked
        text = self.said()[-1]["text"]
        self.assertIn("everything", text)
        self.assertIn("new variant", text)
        self.assertNotIn("only this", text)

    def test_a_post_follows_its_design_moved_to_the_task_folder_and_the_reason_names_the_folder(self):
        self.file()
        ref = self.posts()[0]["ref"]
        lay = os.path.join(self.dir, "hub-design", "layout")
        os.makedirs(lay, exist_ok=True)
        with open(os.path.join(lay, "moves.json"), "w", encoding="utf-8") as f:
            json.dump({"files": {"/w/landing.html": "/w/design/landing-promo/landing/index.html"}, "dirs": {}}, f)
        self.press(ref, "👎")
        self.done(self.posts()[1]["ref"], "Colors")
        msg = self.said()[-1]
        self.assertIn("(/w/design/landing-promo/landing/index.html)", msg["text"])
        self.assertIn("Save it in the task folder /w/design/landing-promo/ as a folder of its own", msg["text"])
        self.assertTrue(msg["text"].endswith('design=/w/design/landing-promo/landing/index.html; verdict=dislike; reasons=colors; words=""'))

    def test_the_reason_names_the_direction_folder_of_a_task_the_hub_raised_for_a_direction(self):
        self.sessions["canva"] = {"cwd": "/p/canva", "role": "worker"}
        reg = os.path.join(self.dir, "hub-design")
        os.makedirs(reg, exist_ok=True)
        with open(os.path.join(reg, "registry.json"), "w", encoding="utf-8") as f:
            json.dump({"v": 3, "items": [{"path": "/w/pack2/post-ai-1a/index.html", "session": "designer", "task": "d5"}],
                       "tasks": {"d5": {"title": "Canva pack", "by": "hub-core", "who": "designer", "dir": "canva"}}}, f)
        self.file(path="/w/pack2/post-ai-1a/index.html")
        self.press(self.posts()[0]["ref"], "👎")
        self.done(self.posts()[1]["ref"], "Colors")
        text = self.said()[-1]["text"]
        self.assertIn("Save it in the task folder /p/canva/design/pack2/ as a folder of its own", text)
        self.assertNotIn("task folder /w/", text)

    def test_the_why_post_is_a_multi_select_with_done_and_nothing_goes_before_done(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        why = self.posts()[1]
        self.assertEqual(why["multi"], {"done": "Done", "all": "Select all", "none": "Clear all"})
        self.assertEqual(len(self.said()), 1)              # the 👎 only; the ticks are the bot's business until Done

    def test_several_ticked_reasons_go_in_one_message_with_a_record_for_the_designer(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        why = self.posts()[1]
        self.done(why["ref"], "Colors", "Angles (corners)", "Balance")
        msg = self.said()[-1]
        self.assertEqual(len(self.said()), 2)
        self.assertEqual(msg["to"], "designer")
        self.assertIn("what did not work: colors, angles (corner radii), balance", msg["text"])
        self.assertIn("these aspects", msg["text"])
        self.assertNotIn("new variant", msg["text"])
        self.assertTrue(msg["text"].endswith('Feedback record: design=/w/landing.html; verdict=dislike; reasons=colors,angles,balance; words=""'))
        self.assertTrue(msg["reject"])
        self.done(why["ref"], "Colors")                    # answered - a late press changes nothing
        self.assertEqual(len(self.said()), 2)

    def test_ticks_and_words_together(self):
        self.file()
        self.press(self.posts()[0]["ref"], "👎")
        why = self.posts()[1]["ref"]
        self.add("telegram.replied", {"ext": "hub-design", "ref": why, "text": "too dark", "chosen": ["Colors"]}, src="telegram")
        self.p.poll()
        text = self.said()[-1]["text"]
        self.assertIn("what did not work: colors; in the owner's words: too dark", text)
        self.assertTrue(text.endswith('reasons=colors; words="too dark"'))

    def test_a_reason_in_words(self):
        self.file()
        ref = self.posts()[0]["ref"]
        self.press(ref, "👎")
        self.add("telegram.replied", {"ext": "hub-design", "ref": self.posts()[1]["ref"], "text": "too dark"}, src="telegram")
        self.p.poll()
        self.assertIn("too dark", self.said()[-1]["text"])
        self.assertIn("only this", self.said()[-1]["text"])
        self.assertIn("reasons=words", self.said()[-1]["text"])

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


@unittest.skipUnless(tgpost.rules(), "no hub code with modules/telegram/design_posts on PYTHONPATH")
class Author(unittest.TestCase):
    """The owner's rating of a design goes to its author (who wrote the file), not to the session that only sent it to him."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(dir=TMP)
        self.journal = os.path.join(self.dir, "journal.jsonl")
        self.seq, self.out = 0, []
        self.cfg = {"telegram": {"design_posts": {"sessions": "*"}}}
        self.sessions = {"router": {"cwd": "/w"}, "designer": {"cwd": "/d"}}
        self.authors = {"/w/landing.html": "designer"}
        self.add("core.started", {})
        self.p = tgpost.Poster(self.dir, lambda path: PNG, lambda: self.cfg, title=lambda p: "Landing", page=lambda: None,
                               state=lambda: {"sessions": self.sessions}, emit=lambda t, d: self.out.append((t, d)),
                               author=lambda path: self.authors.get(path))

    def add(self, type, data, src="session"):
        self.seq += 1
        with open(self.journal, "a", encoding="utf-8") as f:
            f.write(json.dumps({"seq": self.seq, "type": type, "src": src, "data": data}) + "\n")

    def file(self, sender="router", path="/w/landing.html"):
        self.add("owner.file", {"path": path, "sender": sender, "channel": "session", "owner": False})
        self.p.poll()

    def posts(self):
        return [d for t, d in self.out if t == "telegram.post"]

    def said(self, to=None):
        return [d for t, d in self.out if t == "message.received" and (to is None or d["to"] == to)]

    def press(self, ref, button):
        self.add("telegram.pressed", {"ext": "hub-design", "ref": ref, "button": button}, src="telegram")
        self.p.poll()

    def test_the_post_is_the_authors_not_the_senders(self):
        self.file()
        (post,) = self.posts()
        self.assertEqual(post["session"], "designer")      # the bot hands a reply to the post's session
        self.assertIn("designer", post["text"])
        self.assertNotIn("router", post["text"])
        self.assertEqual(self.said(), [])

    def test_a_like_goes_to_the_author_and_the_sender_gets_one_line(self):
        self.file()
        self.press(self.posts()[0]["ref"], "❤️")
        (to_author,) = self.said("designer")
        self.assertIn("❤️", to_author["text"])
        (copy,) = self.said("router")
        self.assertNotIn("\n", copy["text"])
        self.assertIn("designer", copy["text"])
        self.assertIn("/w/landing.html", copy["text"])
        self.assertIs(copy.get("fyi"), True)               # a note: it does not wake the sender
        for key in ("lane", "reject", "react", "ref", "batch"):
            self.assertNotIn(key, copy)

    def test_a_dislike_and_its_reasons_go_to_the_author_with_the_record(self):
        self.file()
        ref = self.posts()[0]["ref"]
        self.press(ref, "👎")
        why = self.posts()[1]
        self.assertEqual(len(self.said("designer")), 1)
        self.assertTrue(self.said("designer")[0]["reject"])   # the reject belongs to the author's edit lane
        self.add("telegram.pressed", {"ext": "hub-design", "ref": why["ref"], "button": "Colors", "chosen": ["Colors"], "done": True},
                 src="telegram")
        self.p.poll()
        last = self.said("designer")[-1]
        self.assertIn("Feedback record: design=/w/landing.html; verdict=dislike; reasons=colors", last["text"])
        copies = self.said("router")
        self.assertEqual(len(copies), 2)                    # the dislike and the reasons, a line each
        self.assertTrue(all("designer" in c["text"] and "\n" not in c["text"] for c in copies))
        self.assertNotIn("Feedback record", copies[-1]["text"])

    def test_words_in_a_telegram_reply_go_to_the_author_when_the_session_was_gone(self):
        self.file()
        self.add("telegram.replied", {"ext": "hub-design", "ref": self.posts()[0]["ref"], "text": "bigger logo"}, src="telegram")
        self.p.poll()
        (msg,) = self.said("designer")
        self.assertIn("bigger logo", msg["text"])
        (copy,) = self.said("router")
        self.assertIn("bigger logo", copy["text"])

    def test_a_reply_the_bot_handed_to_the_author_is_copied_to_the_sender(self):
        self.file()
        mark = "в ответ на пост"   # the bot's mark, protocol text
        self.add("message.received", {"to": "designer", "channel": "telegram", "owner": True,
                                      "text": f"smaller logo\n\n({mark} {self.posts()[0]['ref']})"}, src="telegram")
        self.p.poll()
        (copy,) = self.said("router")
        self.assertIn("smaller logo", copy["text"])
        self.assertIn("designer", copy["text"])
        self.assertEqual(self.said("designer"), [])         # the bot already did that one: no second copy to the author

    def test_the_author_is_the_sender_no_copy(self):
        self.file("designer")
        self.press(self.posts()[0]["ref"], "❤️")
        self.assertEqual([d["to"] for d in self.said()], ["designer"])

    def test_no_author_known_or_the_author_is_gone_as_before_the_sender(self):
        self.authors = {}
        self.file()
        self.assertEqual(self.posts()[0]["session"], "router")
        self.press(self.posts()[0]["ref"], "❤️")
        self.assertEqual([d["to"] for d in self.said()], ["router"])
        self.authors = {"/w/second.html": "designer"}
        del self.sessions["designer"]                       # removed since it wrote the file
        self.file(path="/w/second.html")
        self.assertEqual(self.posts()[1]["session"], "router")

    def test_the_author_of_a_batch_gets_the_whole_batch_feedback_and_the_sender_a_line(self):
        for i in range(3):
            self.authors[f"/w/ads/v{i + 1}/index.html"] = "designer"
            self.add("owner.file", {"path": f"/w/ads/v{i + 1}/index.html", "sender": "router", "channel": "session", "owner": False})
            self.p.poll()
        refs = [p["ref"] for p in self.posts()]
        self.press(refs[1], "👎")
        (batch,) = [d for d in self.said("designer") if d.get("batch")]
        self.assertIn("whole batch of 3 designs", batch["text"])
        (copy,) = self.said("router")
        self.assertIn("designer", copy["text"])
        self.assertNotIn("whole batch", copy["text"])

    def test_an_answer_on_the_page_to_the_author_takes_his_posts_out(self):
        self.file()
        ref = self.posts()[0]["ref"]
        self.add("message.received", {"to": "designer", "channel": "web", "owner": True, "text": "ok"}, src="web")
        self.p.poll()
        self.assertEqual([d for t, d in self.out if t == "telegram.unpost"], [{"ref": ref}])


if __name__ == "__main__":
    unittest.main()
