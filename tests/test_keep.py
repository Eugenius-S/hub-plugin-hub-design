"""The versions of a design: the current one and three past ones stay, older ones go to the trash, the trash is emptied after a day
(invented folders, nothing real is touched)."""
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
        return sorted(n for n in os.listdir(parent) if not n.startswith("."))

    # --- rounds of a folder
    def test_five_rounds_of_a_folder_leave_the_newest_four(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]   # kolo is the oldest, kolo-5 the newest
        out = self.run_keep(pages)
        self.assertEqual(self.left(task), ["kolo-2", "kolo-3", "kolo-4", "kolo-5"])
        self.assertEqual((out["families"], out["versions"], out["deleted"]), (1, 5, 1))
        self.assertTrue(out["id"])

    def test_four_rounds_are_left_alone(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 5)]
        out = self.run_keep(pages)
        self.assertEqual(len(self.left(task)), 4)
        self.assertEqual((out["deleted"], out["id"]), (0, None))

    def test_the_order_is_by_the_time_of_the_file_not_by_the_number(self):
        task = os.path.join(self.design, "poster")
        ages = {"kolo": 1, "kolo-2": 9, "kolo-3": 8, "kolo-4": 7, "kolo-5": 6}   # the plain name was touched last: it is the current one
        pages = [self.folder(task, n, age=a * DAY) for n, a in ages.items()]
        self.run_keep(pages)
        self.assertEqual(self.left(task), ["kolo", "kolo-3", "kolo-4", "kolo-5"])

    def test_a_folder_goes_whole_with_its_assets_into_the_trash(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        out = self.run_keep(pages)
        (row,) = [r for r in organize.rows(self.state) if r["op"] == "delete"]
        self.assertTrue(any(i["src"] == os.path.join(task, "kolo") and os.path.isfile(os.path.join(i["dst"], "assets", "a.png")) for i in row["items"]))
        self.assertEqual(row["id"], out["id"])

    def test_the_deletion_can_be_undone(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        out = self.run_keep(pages)
        organize.undo(self.state, out["id"])
        self.assertEqual(len(self.left(task)), 5)
        self.assertTrue(os.path.isfile(os.path.join(task, "kolo", "assets", "a.png")))

    # --- loose files
    def test_loose_files_with_endings_are_versions(self):
        names = ["site.html", "site-v2.html", "site_v3.html", "site-r4.html", "site-5b.html", "site-6c.html"]
        pages = [self.put(os.path.join(self.design, "web", n), age=(20 - i) * DAY) for i, n in enumerate(names)]
        self.run_keep(pages)
        self.assertEqual(self.left(os.path.join(self.design, "web")), sorted(names[2:]))

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
        self.assertEqual(self.left(d), sorted(names[2:]))

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
    def test_hand_edit_copies_keep_the_newest_three(self):
        page = self.put(os.path.join(self.design, "web", "home.html"), age=5 * DAY)
        for n in range(1, 6):
            self.put(os.path.join(self.design, "web", "home.r%d.html" % n), age=(20 - n) * DAY)
        out = self.run_keep([page])
        self.assertEqual(self.left(os.path.join(self.design, "web")), ["home.html", "home.r3.html", "home.r4.html", "home.r5.html"])
        self.assertEqual(out["copies"], 2)

    def test_the_copies_go_with_their_design(self):
        d = os.path.join(self.design, "web")
        names = ["site.html", "site-2.html", "site-3.html", "site-4.html", "site-5.html"]
        pages = [self.put(os.path.join(d, n), age=(20 - i) * DAY) for i, n in enumerate(names)]
        self.put(os.path.join(d, "site.r1.html"), age=30 * DAY)
        self.run_keep(pages)
        self.assertEqual(self.left(d), sorted(names[1:]))
        self.assertFalse(os.path.exists(os.path.join(d, "site.r1.html")))

    # --- pulls of Claude Design
    def test_pulls_of_claude_design_keep_the_newest_four(self):
        base = os.path.join(self.design, "proj", "claude-design")
        stamps = ["20260101-100000", "20260102-100000", "20260103-100000", "20260104-100000", "20260105-100000", "20260106-100000"]
        pages = [self.put(os.path.join(base, s, "index.html"), age=(30 - i) * DAY) for i, s in enumerate(stamps)]
        self.put(os.path.join(base, stamps[0], "assets", "a.png"), age=30 * DAY)
        out = self.run_keep(pages)
        self.assertEqual(self.left(base), stamps[2:])
        self.assertEqual(out["deleted"], 2)

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
        self.assertEqual(self.left(task), ["kolo", "kolo-4", "kolo-5", "kolo-6"])

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
        self.assertEqual((len(out["units"]), out["id"]), (1, None))
        self.assertGreater(out["bytes"], 0)
        self.assertEqual(organize.rows(self.state), [])

    def test_a_second_pass_does_nothing(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 7)]
        self.run_keep(pages)
        again = self.run_keep(pages)
        self.assertEqual((again["deleted"], again["id"]), (0, None))

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
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        out = self.run_keep(pages)
        self.assertFalse(os.path.exists(old))
        row = next(r for r in organize.rows(self.state) if r["id"] == out["id"])
        self.assertTrue(os.path.exists(row["items"][0]["dst"]))

    def test_an_empty_trash_is_fine(self):
        self.assertEqual(keep.purge(self.state, now=NOW), {"runs": 0, "bytes": 0})

    def test_undo_of_an_emptied_run_is_refused(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        out = self.run_keep(pages)
        keep.purge(self.state, now=NOW + 2 * DAY)
        with self.assertRaises(organize.Refused) as e:
            organize.undo(self.state, out["id"])
        self.assertEqual(e.exception.code, 410)

    def test_the_text_of_the_plan_names_what_goes(self):
        task = os.path.join(self.design, "poster")
        pages = [self.folder(task, "kolo" + ("" if i == 1 else "-%d" % i), age=(10 - i) * DAY) for i in range(1, 6)]
        text = keep.text_of(self.run_keep(pages, dry=True))
        self.assertIn("kolo  ", text)
        self.assertIn("1 ", text.split("\n")[0])


if __name__ == "__main__":
    unittest.main()
