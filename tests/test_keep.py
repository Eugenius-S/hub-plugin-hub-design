"""The versions of a design: the current one and one past one stay, older light ones go to the archive beside, heavy ones to the trash,
the trash is emptied after a day (invented folders, nothing real is touched)."""
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import keep  # noqa: E402
import organize  # noqa: E402

DAY = 24 * 3600
NOW = 2_000_000_000.0


class Keep(unittest.TestCase):
    def setUp(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp(prefix="keep-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.state = os.path.join(self.tmp, "state")
        self.cwd = os.path.join(self.tmp, "work", "ads")
        self.design = os.path.join(self.cwd, "design")
        os.makedirs(self.state)
        self.ctx = organize.Ctx(lambda real: os.path.isfile(real) and real.startswith(self.tmp), [self.cwd, self.design], [self.cwd])

    def put(self, path, age=DAY, text="<html></html>"):
        """A file that is `age` seconds old at NOW."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        os.utime(path, (NOW - age, NOW - age))
        return path

    def folder(self, parent, name, age=DAY):
        """parent/name/index.html with an assets folder."""
        page = self.put(os.path.join(parent, name, "index.html"), age, '<img src="assets/a.png">')
        self.put(os.path.join(parent, name, "assets", "a.png"), age, "png")
        return page

    def run_keep(self, paths, dry=False, **kw):
        return keep.sweep(self.state, paths, self.ctx, now=NOW, dry=dry, **kw)

    def left(self, parent):
        return sorted(n for n in os.listdir(parent) if not n.startswith(".") and n != "_archive")

    def archived(self, parent):
        a = os.path.join(parent, "_archive")
        return sorted(n for n in os.listdir(a) if not n.startswith(".")) if os.path.isdir(a) else []

    def heavy(self, parent, name, age=DAY):
        """parent/name/index.html with a render beside it: a heavy version."""
        page = self.folder(parent, name, age)
        self.put(os.path.join(parent, name, "render.mp4"), age, "mp4")
        return page

    # --- the owner's rule: the current version and one past one; older light ones to the archive beside, heavy ones to the trash
    def test_the_current_and_one_past_stay_light_go_to_the_archive_heavy_to_the_trash_liked_stays(self):
        task = os.path.join(self.design, "poster")
        names = ["kolo", "kolo-2", "kolo-3", "kolo-4", "kolo-5", "kolo-6"]   # the oldest first: kolo-6 is current, kolo-5 the past one
        pages = {n: (self.heavy if n == "kolo" else self.folder)(task, n, age=(20 - i) * DAY) for i, n in enumerate(names)}
        out = self.run_keep(list(pages.values()), marks={self.key(pages["kolo-3"]): {"liked": NOW - DAY}})
        self.assertEqual(self.left(task), ["kolo-3", "kolo-5", "kolo-6"])
        self.assertEqual(self.archived(task), ["kolo-2", "kolo-4"])
        self.assertTrue(os.path.isfile(os.path.join(task, "_archive", "kolo-2", "assets", "a.png")))
        (trash,) = [r for r in organize.rows(self.state) if r["op"] == "delete"]
        self.assertEqual([i["src"] for i in trash["items"]], [os.path.join(task, "kolo")])
        self.assertEqual((out["deleted"], out["archived"], out["kept"]["liked"]), (1, 2, 1))
        keep.purge(self.state, now=NOW + 2 * DAY)   # the trash is emptied, the archive is not
        self.assertEqual(self.archived(task), ["kolo-2", "kolo-4"])
        for i in out["ids"]:
            if i != out["id"]:
                organize.undo(self.state, i)
        self.assertEqual(self.left(task), ["kolo-2", "kolo-3", "kolo-4", "kolo-5", "kolo-6"])
        self.assertEqual(self.archived(task), [])

    def test_the_trash_and_the_archive_both_undo(self):
        task = os.path.join(self.design, "poster")
        names = ["kolo", "kolo-2", "kolo-3", "kolo-4"]
        for i, n in enumerate(names):
            (self.heavy if n == "kolo" else self.folder)(task, n, age=(20 - i) * DAY)
        out = self.run_keep([os.path.join(task, n, "index.html") for n in names])
        self.assertEqual(len(out["ids"]), 2)
        for i in out["ids"]:
            organize.undo(self.state, i)
        self.assertEqual(self.left(task), names)
        self.assertTrue(os.path.isfile(os.path.join(task, "kolo", "render.mp4")))

    def test_a_dry_run_counts_the_archive_and_the_trash_apart(self):
        task = os.path.join(self.design, "poster")
        names = ["kolo", "kolo-2", "kolo-3", "kolo-4"]
        pages = [(self.heavy if n == "kolo" else self.folder)(task, n, age=(20 - i) * DAY) for i, n in enumerate(names)]
        out = self.run_keep(pages, dry=True)
        self.assertEqual(self.left(task), names)
        self.assertEqual(([u["to"] for u in sorted(out["units"], key=lambda u: u["name"])]), ["trash", "archive"])
        self.assertGreater(out["archive_bytes"], 0)
        self.assertGreater(out["trash_bytes"], 0)
        self.assertIn("to the archive", keep.text_of(out).split("\n")[0])

    def test_a_second_pass_leaves_the_archive_alone(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        self.run_keep(pages)
        moved = [os.path.join(task, "_archive", n, "index.html") for n in self.archived(task)]
        again = self.run_keep(pages + moved)
        self.assertEqual((again["deleted"], again["archived"], again["ids"]), (0, 0, []))
        self.assertEqual(self.archived(task), ["kolo", "kolo-2", "kolo-3"])

    def test_a_batch_of_pictures_is_heavy_the_small_assets_of_a_page_are_not(self):
        task = os.path.join(self.design, "poster")
        light = self.folder(task, "kolo-2")
        for i in range(12):
            self.put(os.path.join(task, "kolo-2", "assets", "s%d.png" % i), text="png")
        self.assertFalse(keep.heavy(os.path.dirname(light)))
        big = self.folder(task, "kolo")
        for i in range(12):
            self.put(os.path.join(task, "kolo", "shots", "s%d.png" % i), text="x" * (512 * 1024))
        self.assertTrue(keep.heavy(os.path.dirname(big)))

    # --- rounds of a folder
    def test_five_rounds_of_a_folder_leave_the_newest_two(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]   # kolo is the oldest, kolo-5 the newest
        out = self.run_keep(pages)
        self.assertEqual(self.left(task), ["kolo-4", "kolo-5"])
        self.assertEqual(self.archived(task), ["kolo", "kolo-2", "kolo-3"])
        self.assertEqual((out["families"], out["versions"], out["deleted"], out["archived"]), (1, 5, 0, 3))
        self.assertTrue(out["ids"])

    def test_two_rounds_are_left_alone(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 3)]
        out = self.run_keep(pages)
        self.assertEqual(len(self.left(task)), 2)
        self.assertEqual((out["deleted"], out["archived"], out["ids"]), (0, 0, []))

    def test_the_order_is_by_the_time_of_the_file_not_by_the_number(self):
        task = os.path.join(self.design, "poster")
        ages = {"kolo": 1, "kolo-2": 9, "kolo-3": 8, "kolo-4": 7, "kolo-5": 6}   # the plain name was touched last: it is the current one
        pages = [self.folder(task, n, age=a * DAY) for n, a in ages.items()]
        self.run_keep(pages)
        self.assertEqual(self.left(task), ["kolo", "kolo-5"])

    def poster(self, n=5):
        """kolo (heavy: a render beside it), kolo-2 … kolo-n, the oldest first."""
        task = os.path.join(self.design, "poster")
        return task, [(self.heavy if i == 1 else self.folder)(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, n + 1)]

    def test_a_folder_goes_whole_with_its_assets_into_the_trash(self):
        task, pages = self.poster()
        out = self.run_keep(pages)
        (row,) = [r for r in organize.rows(self.state) if r["op"] == "delete"]
        self.assertTrue(any(i["src"] == os.path.join(task, "kolo") and os.path.isfile(os.path.join(i["dst"], "assets", "a.png"))
                            and os.path.isfile(os.path.join(i["dst"], "render.mp4")) for i in row["items"]))
        self.assertEqual(row["id"], out["id"])
        self.assertTrue(os.path.isfile(os.path.join(task, "_archive", "kolo-2", "assets", "a.png")))   # a light one goes whole to the archive

    def test_the_deletion_can_be_undone(self):
        task, pages = self.poster()
        out = self.run_keep(pages)
        organize.undo(self.state, out["id"])
        self.assertEqual(self.left(task), ["kolo", "kolo-4", "kolo-5"])
        self.assertTrue(os.path.isfile(os.path.join(task, "kolo", "assets", "a.png")))

    # --- loose files
    def test_loose_files_with_endings_are_versions(self):
        names = ["site.html", "site-v2.html", "site_v3.html", "site-r4.html", "site-5b.html", "site-6c.html"]
        pages = [self.put(os.path.join(self.design, "web", n), age=(20 - i) * DAY) for i, n in enumerate(names)]
        self.run_keep(pages)
        self.assertEqual(self.left(os.path.join(self.design, "web")), sorted(names[4:]))
        self.assertEqual(self.archived(os.path.join(self.design, "web")), sorted(names[:4]))

    def test_a_series_of_numbers_without_a_base_is_not_a_family(self):
        d = os.path.join(self.design, "bf")
        pages = [self.put(os.path.join(d, "bf-post-%02d.html" % i), age=(20 - i) * DAY) for i in range(1, 8)]
        out = self.run_keep(pages)
        self.assertEqual((out["families"], out["deleted"]), (0, 0))
        self.assertEqual(len(self.left(d)), 7)

    def test_a_number_with_a_base_is_a_round(self):
        d = os.path.join(self.design, "bf")
        names = ["bf-post.html"] + ["bf-post-%d.html" % i for i in range(2, 7)]
        pages = [self.put(os.path.join(d, n), age=(20 - i) * DAY) for i, n in enumerate(names)]
        self.run_keep(pages)
        self.assertEqual(self.left(d), sorted(names[4:]))

    def test_different_designs_do_not_share_a_family(self):
        d = os.path.join(self.design, "web")
        pages = [self.put(os.path.join(d, "%s-v%d.html" % (n, i)), age=(30 - i) * DAY) for n in ("home", "pricing") for i in range(1, 4)]
        out = self.run_keep(pages)
        self.assertEqual((out["families"], out["deleted"]), (2, 0))

    def test_a_file_and_a_folder_of_one_name_are_not_one_family(self):
        d = os.path.join(self.design, "web")
        pages = [self.put(os.path.join(d, "home.html"), age=9 * DAY)] + [self.folder(d, "home-%d" % i, age=(9 - i) * DAY) for i in range(2, 7)]
        self.run_keep(pages)
        self.assertTrue(os.path.isfile(os.path.join(d, "home.html")))

    # --- copies of the canvas
    def test_hand_edit_copies_keep_the_newest_one(self):
        page = self.put(os.path.join(self.design, "web", "home.html"), age=5 * DAY)
        for n in range(1, 6):
            self.put(os.path.join(self.design, "web", "home.r%d.html" % n), age=(20 - n) * DAY)
        out = self.run_keep([page])
        self.assertEqual(self.left(os.path.join(self.design, "web")), ["home.html", "home.r5.html"])
        self.assertEqual(self.archived(os.path.join(self.design, "web")), ["home.r1.html", "home.r2.html", "home.r3.html", "home.r4.html"])
        self.assertEqual((out["copies"], out["deleted"]), (4, 0))

    def test_the_copies_go_with_their_design(self):
        d = os.path.join(self.design, "web")
        names = ["site.html", "site-2.html", "site-3.html", "site-4.html", "site-5.html"]
        pages = [self.put(os.path.join(d, n), age=(20 - i) * DAY) for i, n in enumerate(names)]
        self.put(os.path.join(d, "site.r1.html"), age=30 * DAY)
        self.run_keep(pages)
        self.assertEqual(self.left(d), sorted(names[3:]))
        self.assertFalse(os.path.exists(os.path.join(d, "site.r1.html")))
        self.assertIn("site.r1.html", self.archived(d))

    # --- pulls of Claude Design
    def test_pulls_of_claude_design_keep_the_newest_two(self):
        base = os.path.join(self.design, "proj", "claude-design")
        stamps = ["20260101-100000", "20260102-100000", "20260103-100000", "20260104-100000", "20260105-100000", "20260106-100000"]
        pages = [self.put(os.path.join(base, s, "index.html"), age=(30 - i) * DAY) for i, s in enumerate(stamps)]
        self.put(os.path.join(base, stamps[0], "assets", "a.png"), age=30 * DAY)
        out = self.run_keep(pages)
        self.assertEqual(self.left(base), stamps[4:])
        self.assertEqual(self.archived(base), stamps[:4])
        self.assertEqual((out["deleted"], out["archived"]), (0, 4))

    # --- care
    def test_versions_made_in_the_last_hours_are_not_taken(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 0 else "-%d" % (i + 1)), age=600 + 100 * (6 - i)) for i in range(6)]   # a designer is at work: all six are minutes old
        out = self.run_keep(pages)
        self.assertEqual((out["deleted"], len(self.left(task))), (0, 6))

    def test_an_old_round_edited_just_now_is_the_current_one(self):
        task = os.path.join(self.design, "poster")
        ages = {"kolo": 600, "kolo-2": 9 * DAY, "kolo-3": 8 * DAY, "kolo-4": 7 * DAY, "kolo-5": 6 * DAY, "kolo-6": 5 * DAY}
        pages = [self.folder(task, n, age=a) for n, a in ages.items()]
        self.run_keep(pages)
        self.assertEqual(self.left(task), ["kolo", "kolo-6"])

    def test_a_file_outside_a_design_folder_is_left_alone(self):
        d = os.path.join(self.cwd, "site")
        pages = [self.put(os.path.join(d, "a%s.html" % ("" if i == 1 else "-v%d" % i)), age=(20 - i) * DAY) for i in range(1, 8)]
        out = self.run_keep(pages)
        self.assertEqual((out["deleted"], len(self.left(d))), (0, 7))

    def test_a_file_the_plugin_does_not_serve_is_left_alone(self):
        d = os.path.join(self.design, "poster")
        pages = [self.put(os.path.join(d, "a%s.html" % ("" if i == 1 else "-v%d" % i)), age=(20 - i) * DAY) for i in range(1, 8)]
        ctx = organize.Ctx(lambda real: False, [self.cwd, self.design], [self.cwd])
        out = keep.sweep(self.state, pages, ctx, now=NOW)
        self.assertEqual((out["deleted"], len(self.left(d))), (0, 7))

    def test_a_folder_with_a_design_inside_stays(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        self.put(os.path.join(task, "kolo", "inner", "page.html"), age=20 * DAY)
        self.run_keep(pages)
        self.assertIn("kolo", self.left(task))

    def test_a_dry_run_moves_nothing_and_counts(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        out = self.run_keep(pages, dry=True)
        self.assertEqual(len(self.left(task)), 5)
        self.assertEqual((len(out["units"]), out["id"], out["ids"]), (3, None, []))
        self.assertGreater(out["bytes"], 0)
        self.assertEqual(organize.rows(self.state), [])

    def test_a_second_pass_does_nothing(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 7)]
        self.run_keep(pages)
        again = self.run_keep(pages)
        self.assertEqual((again["deleted"], again["archived"], again["ids"]), (0, 0, []))

    # --- the trash
    def trashed(self, run_at):
        """A run in the trash made at `run_at`."""
        run = organize.new_id(run_at)
        box = organize.trash_folder(self.state, run, run_at)
        self.put(os.path.join(box, "0-old", "index.html"), text="x" * 100)
        return box

    def test_the_trash_older_than_a_day_is_emptied(self):
        old, fresh = self.trashed(NOW - 2 * DAY), self.trashed(NOW - 3600)
        out = keep.purge(self.state, now=NOW)
        self.assertFalse(os.path.exists(old))
        self.assertTrue(os.path.exists(fresh))
        self.assertEqual((out["runs"], out["bytes"]), (1, 100))

    def test_a_sweep_empties_the_old_trash_and_not_its_own(self):
        old = self.trashed(NOW - 2 * DAY)
        _, pages = self.poster()
        out = self.run_keep(pages)
        self.assertFalse(os.path.exists(old))
        row = next(r for r in organize.rows(self.state) if r["id"] == out["id"])
        self.assertTrue(os.path.exists(row["items"][0]["dst"]))

    def test_an_empty_trash_is_fine(self):
        self.assertEqual(keep.purge(self.state, now=NOW), {"runs": 0, "bytes": 0})

    def test_undo_of_an_emptied_run_is_refused(self):
        _, pages = self.poster()
        out = self.run_keep(pages)
        keep.purge(self.state, now=NOW + 2 * DAY)
        with self.assertRaises(organize.Refused) as e:
            organize.undo(self.state, out["id"])
        self.assertEqual(e.exception.code, 410)

    # --- what the owner chose or got is kept for good
    def key(self, page):
        return keep.registry.key_of(page)

    def five(self, names, folder="poster"):
        task = os.path.join(self.design, folder)
        pages = {n: self.folder(task, n, age=(20 - i) * DAY) for i, n in enumerate(names)}   # the first is the oldest
        return task, pages

    def test_a_version_sent_to_the_owner_stays_beyond_the_one(self):
        task, pages = self.five(["kolo", "kolo-2", "kolo-3", "kolo-4", "kolo-5", "kolo-6"])
        marks = {self.key(pages["kolo-2"]): {"sent": NOW - 5 * DAY}}
        out = self.run_keep(list(pages.values()), marks=marks)
        self.assertEqual(self.left(task), ["kolo-2", "kolo-5", "kolo-6"])
        self.assertEqual(out["kept"]["sent"], 1)

    def test_a_version_the_owner_liked_stays_and_the_rest_go_as_before(self):
        task, pages = self.five(["kolo", "kolo-2", "kolo-3", "kolo-4", "kolo-5", "kolo-6", "kolo-7"])
        out = self.run_keep(list(pages.values()), marks={self.key(pages["kolo"]): {"liked": NOW - DAY}})
        self.assertEqual(self.left(task), ["kolo", "kolo-6", "kolo-7"])
        self.assertEqual(out["kept"]["liked"], 1)

    def test_without_marks_the_same_designs_go(self):
        task, pages = self.five(["kolo", "kolo-2", "kolo-3", "kolo-4", "kolo-5", "kolo-6"])
        self.run_keep(list(pages.values()), marks={})
        self.assertEqual(self.left(task), ["kolo-5", "kolo-6"])

    def test_the_last_round_of_variants_stays_while_none_is_liked(self):
        names = ["ad-1a", "ad-1b", "ad-2a", "ad-2b", "ad-2c", "ad-3a", "ad-3b"]   # the oldest first; round 3 is the last
        task, pages = self.five(names)
        # the newest two by time are ad-3a and ad-3b: the whole round 3, the rest goes
        out = self.run_keep(list(pages.values()))
        self.assertEqual(self.left(task), ["ad-3a", "ad-3b"])
        task, pages = self.five(["ad-3a", "ad-1a", "ad-1b", "ad-2a", "ad-2b", "ad-3b"], "second")   # round 3 is old by the clock: still the last round
        out = self.run_keep(list(pages.values()))
        self.assertEqual(self.left(task), ["ad-2b", "ad-3a", "ad-3b"])   # the newest two (ad-3b, ad-2b) and ad-3a held by its round
        self.assertEqual(out["kept"]["round"], 1)

    def test_once_a_variant_is_liked_the_other_variants_of_its_round_are_past_versions(self):
        task, pages = self.five(["ad-3a", "ad-1a", "ad-1b", "ad-2a", "ad-2b", "ad-3b"])
        self.run_keep(list(pages.values()), marks={self.key(pages["ad-3b"]): {"liked": NOW - DAY}})
        self.assertEqual(self.left(task), ["ad-2b", "ad-3b"])   # ad-3a is old: it goes like any other

    def test_the_text_of_the_plan_names_what_goes(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        text = keep.text_of(self.run_keep(pages, dry=True))
        self.assertIn("kolo  ", text)
        self.assertIn("to the archive: 3 ", text.split("\n")[0])
        self.assertIn("-> archive", text)


if __name__ == "__main__":
    unittest.main()
