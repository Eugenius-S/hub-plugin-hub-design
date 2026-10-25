"""Task folders: the plan of moves of the old designs, doing it, undoing it, and following the moves (invented folders, nothing real is touched)."""
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import layout  # noqa: E402


class Layout(unittest.TestCase):
    def setUp(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp(prefix="layout-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.state = self.at("state")
        os.makedirs(self.state)
        self.home = self.at("design")             # the designer's folder
        self.ads = self.at("work", "Ads")         # a direction folder
        self.ctx = layout.Ctx([{"key": self.ads, "cwd": self.ads, "label": "ads-bruno", "names": ["ads-bruno"]}],
                              {"designer": self.home}, {"d1": {"title": "Постер к Чёрной пятнице", "by": "ads-bruno", "who": "designer"},
                                                        "d2": {"title": "Story Kyoto", "by": "", "who": "designer"}})

    def at(self, *parts):
        return os.path.join(self.tmp, *parts)

    def put(self, path, text="<html></html>"):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return path

    def read(self, path):
        with open(path, encoding="utf-8") as f:
            return f.read()

    def moves(self, plan):
        return {m["from"]: m["to"] for m in plan["moves"]}

    def test_slug_is_short_latin(self):
        self.assertEqual(layout.slug("Постер к Чёрной пятнице"), "poster-chernoy-pyatnitse")
        self.assertEqual(layout.slug("Story for Kyoto: the sale!"), "story-kyoto-sale")
        self.assertLessEqual(len(layout.slug("a very long title " * 10)), layout.SLUG_MAX)
        self.assertEqual(layout.slug(""), "")

    def test_a_loose_design_of_a_direction_task_goes_to_its_task_folder_with_its_assets(self):
        src = self.put(self.at("design", "poster.html"), '<img src="assets/a.png"><link href="../shared/x.css">')
        self.put(self.at("design", "assets", "a.png"), "png")
        self.put(self.at("shared", "x.css"), "css")
        self.put(self.at("design", "poster.r1.html"), '<img src="assets/a.png">')
        rows = [{"path": src, "session": "designer", "task": "d1"}]
        p = layout.plan(rows, self.ctx)
        want = self.ads + "/design/poster-chernoy-pyatnitse/poster/index.html"
        self.assertEqual(self.moves(p), {src: want})
        m = p["moves"][0]
        self.assertEqual(m["copies"], [[self.at("design", "poster.r1.html"), os.path.dirname(want) + "/index.r1.html"]])
        self.assertEqual(m["assets"], [[self.at("design", "assets", "a.png"), os.path.dirname(want) + "/assets/a.png"]])
        self.assertEqual(m["rewrite"], 1)
        # the dry plan moves nothing
        self.assertTrue(os.path.isfile(src))

        layout.apply(self.state, p)
        self.assertFalse(os.path.exists(src))
        self.assertTrue(os.path.isfile(want))
        self.assertTrue(os.path.isfile(os.path.dirname(want) + "/index.r1.html"))
        self.assertTrue(os.path.isfile(os.path.dirname(want) + "/assets/a.png"))
        self.assertTrue(os.path.isfile(self.at("design", "assets", "a.png")))   # the original asset stays for other designs
        css = os.path.relpath(self.at("shared", "x.css"), os.path.dirname(want))
        self.assertIn(f'href="{css}"', self.read(want))
        self.assertIn('src="assets/a.png"', self.read(want))
        with open(os.path.join(self.state, "hub-design", "layout", "moves.json"), encoding="utf-8") as f:
            self.assertEqual(json.load(f)["files"], {layout.key(src): want})
        mv = layout.Moves(self.state)
        self.assertTrue(mv.fresh())
        self.assertEqual(mv.remap(src), want)
        self.assertEqual(mv.remap("/elsewhere/x.html"), "/elsewhere/x.html")

        # undo puts everything back, the copy we made is erased, the text is the old one
        self.assertGreater(layout.undo(self.state), 0)
        self.assertTrue(os.path.isfile(src))
        self.assertIn('href="../shared/x.css"', self.read(src))
        self.assertTrue(os.path.isfile(self.at("design", "poster.r1.html")))
        self.assertFalse(os.path.exists(want))
        self.assertFalse(os.path.exists(self.ads + "/design/poster-chernoy-pyatnitse"))
        self.assertTrue(mv.fresh())
        self.assertEqual(mv.remap(src), src)

    def test_a_folder_of_one_design_moves_whole(self):
        src = self.put(self.at("design", "promo", "kolo", "index.html"), '<img src="fonts/f.woff2">')
        self.put(self.at("design", "promo", "kolo", "fonts", "f.woff2"), "f")
        p = layout.plan([{"path": src, "session": "designer", "task": "d1"}], self.ctx)
        want = self.ads + "/design/promo/kolo/index.html"
        self.assertEqual(self.moves(p), {src: want})
        self.assertEqual(p["moves"][0]["kind"], "dir")
        layout.apply(self.state, p)
        self.assertTrue(os.path.isfile(self.ads + "/design/promo/kolo/fonts/f.woff2"))
        mv = layout.Moves(self.state)
        mv.fresh()
        self.assertEqual(mv.remap(self.at("design", "promo", "kolo", "fonts", "f.woff2")), self.ads + "/design/promo/kolo/fonts/f.woff2")
        layout.undo(self.state)
        self.assertTrue(os.path.isfile(src))

    def test_a_folder_of_its_own_right_in_the_root_is_unclear(self):
        src = self.put(self.at("design", "landing", "index.html"))
        p = layout.plan([{"path": src, "session": "designer", "task": "d2"}], self.ctx)
        self.assertEqual(p["moves"], [])
        self.assertEqual([x["path"] for x in p["unclear"]], [src])

    def test_a_project_folder_goes_whole_to_the_one_direction_its_designs_have(self):
        a = self.put(self.at("design", "bf", "post-1.html"))
        b = self.put(self.at("design", "bf", "post-2.html"))
        p = layout.plan([{"path": a, "session": "designer", "task": "d1"}, {"path": b, "session": "designer"}], self.ctx)
        self.assertEqual(self.moves(p), {a: self.ads + "/design/bf/post-1/index.html", b: self.ads + "/design/bf/post-2/index.html"})

    def test_a_guess_by_the_name_moves_no_file_to_a_direction(self):
        a = self.put(self.at("design", "bruno-promo", "card.html"))
        p = layout.plan([{"path": a, "session": "designer"}], self.ctx)
        self.assertEqual(self.moves(p), {a: self.home + "/bruno-promo/card/index.html"})

    def test_a_project_folder_stays_the_task_folder(self):
        a = self.put(self.at("design", "canva-bf", "pack", "bf-post-01.html"))
        b = self.put(self.at("design", "canva-bf", "bf-post-1a.html"))
        p = layout.plan([{"path": a, "session": "designer", "task": "d2"}, {"path": b, "session": "designer", "task": None}], self.ctx)
        self.assertEqual(self.moves(p), {a: self.home + "/canva-bf/bf-post-01/index.html", b: self.home + "/canva-bf/bf-post-1a/index.html"})

    def test_in_place_is_not_moved_and_a_pdf_keeps_its_name(self):
        ok = self.put(self.ads + "/design/sale/banner/index.html")
        pdf = self.put(self.ads + "/design/sale/deck.pdf", "%PDF")
        p = layout.plan([{"path": ok, "session": "ads-bruno"}, {"path": pdf, "session": "ads-bruno"}], self.ctx)
        self.assertEqual(p["placed"], 1)
        self.assertEqual(self.moves(p), {pdf: self.ads + "/design/sale/deck/deck.pdf"})

    def test_working_files_and_unclear_ones_stay_and_are_listed(self):
        tpl = self.put(self.at("smm", "analytics", "template.html"))           # a template a script reads, made by the designer
        rep = self.put(self.at("state", "week-recap", "report.html"))           # a report of a plugin
        lost = self.put(self.at("design", "mock.html"))                          # no task, no project folder
        taken = self.put(self.at("design", "poster.html"))
        self.put(self.ads + "/design/poster-chernoy-pyatnitse/poster/index.html")   # its place is taken
        p = layout.plan([{"path": tpl, "session": "designer"}, {"path": rep, "session": "week-recap"}, {"path": lost, "session": "designer"},
                         {"path": taken, "session": "designer", "task": "d1"}], self.ctx)
        self.assertEqual(p["moves"], [])
        self.assertEqual({x["path"] for x in p["left"]}, {tpl, rep})
        self.assertEqual({x["path"]: x["why"].split(":")[0] for x in p["unclear"]}, {lost: "no task", taken: "the place is taken"})

    def test_found_files_without_the_registry_are_planned_too(self):
        f = self.put(self.ads + "/design/promo/v1.html")
        found = layout.scan([self.ads + "/design"])
        self.assertEqual(found, [f])
        p = layout.plan([], self.ctx, found)
        self.assertEqual(self.moves(p), {f: self.ads + "/design/promo/v1/index.html"})

    def test_dry_writes_the_plan_and_moves_nothing(self):
        src = self.put(self.at("design", "poster.html"))
        p = layout.dry(self.state, [{"path": src, "session": "designer", "task": "d1"}], self.ctx, [])
        self.assertEqual(len(p["moves"]), 1)
        txt = self.read(os.path.join(self.state, "hub-design", "layout", "plan.txt"))
        self.assertIn("ads-bruno: 1", txt)
        self.assertTrue(os.path.isfile(src))
        self.assertFalse(os.path.exists(os.path.join(self.state, "hub-design", "layout", "moves.jsonl")))


if __name__ == "__main__":
    unittest.main()
