"""What the owner does with the ticked designs: move, delete into the trash, undo (invented folders, nothing real is touched)."""
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import layout  # noqa: E402
import organize  # noqa: E402


class Organize(unittest.TestCase):
    def setUp(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp(prefix="organize-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.state = self.at("state")
        self.cwd = self.at("work", "ads")
        self.design = self.at("work", "ads", "design")
        os.makedirs(self.state)
        self.ctx = organize.Ctx(lambda real: os.path.isfile(real) and real.startswith(self.tmp), [self.cwd, self.design], [self.cwd])

    def at(self, *parts):
        return os.path.join(self.tmp, *parts)

    def put(self, path, text="<html></html>"):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return path

    def read(self, *parts):
        with open(os.path.join(*parts), encoding="utf-8") as f:
            return f.read()

    def task(self, name, variants=("v1",)):
        """design/<name>/<variant>/index.html with an assets folder."""
        out = []
        for v in variants:
            out.append(self.put(os.path.join(self.design, name, v, "index.html"), '<img src="assets/a.png">'))
            self.put(os.path.join(self.design, name, v, "assets", "a.png"), "png")
        return out

    # --- units
    def test_a_design_folder_goes_whole_with_its_assets(self):
        (page,) = self.task("poster")
        todo, bad = organize.units([page], self.ctx)
        self.assertEqual(bad, [])
        self.assertEqual([(u["kind"], u["src"]) for u in todo], [("dir", os.path.join(self.design, "poster"))])

    def test_a_task_folder_goes_whole_only_when_every_design_in_it_is_ticked(self):
        a, b = self.task("poster", ("v1", "v2"))
        todo, _ = organize.units([a], self.ctx)
        self.assertEqual([u["src"] for u in todo], [os.path.dirname(a)])
        todo, _ = organize.units([a, b], self.ctx)
        self.assertEqual([u["src"] for u in todo], [os.path.join(self.design, "poster")])

    def test_the_design_folder_and_the_working_folder_are_never_a_unit(self):
        loose = self.put(os.path.join(self.design, "loose.html"))
        copy = self.put(os.path.join(self.design, "loose.r2.html"))
        todo, _ = organize.units([loose], self.ctx)
        self.assertEqual([(u["kind"], u["src"], u["copies"]) for u in todo], [("file", loose, [copy])])
        both = [self.put(os.path.join(self.design, "x.html"))]
        todo, _ = organize.units(both + [loose], self.ctx)
        self.assertTrue(all(u["kind"] == "file" for u in todo))

    def test_a_file_the_page_does_not_serve_is_refused(self):
        outside = os.path.join(tempfile.gettempdir(), "no-such-design.html")
        todo, bad = organize.units([outside], self.ctx)
        self.assertEqual(todo, [])
        self.assertEqual(bad[0]["why"], "denied")

    # --- move
    def test_move_takes_the_folder_to_the_target_and_the_map_names_every_design(self):
        a, b = self.task("poster", ("v1", "v2"))
        dest = os.path.join(self.design, "archive")
        got = organize.move(self.state, [a, b], dest, self.ctx)
        self.assertTrue(os.path.isfile(os.path.join(dest, "poster", "v1", "index.html")))
        self.assertTrue(os.path.isfile(os.path.join(dest, "poster", "v2", "assets", "a.png")))
        self.assertFalse(os.path.exists(os.path.join(self.design, "poster")))
        self.assertEqual(got["map"][a], os.path.join(dest, "poster", "v1", "index.html"))
        # the registry and the page follow through moves.json, as after layout.py --apply
        mv = layout.Moves(self.state)
        mv.fresh()
        self.assertEqual(layout.key(mv.remap(b)), layout.key(os.path.join(dest, "poster", "v2", "index.html")))

    def test_move_keeps_the_hand_edit_copies_with_the_file_and_its_assets(self):
        page = self.put(os.path.join(self.design, "loose.html"), '<img src="pic.png">')
        copy = self.put(os.path.join(self.design, "loose.r2.html"))
        self.put(os.path.join(self.design, "pic.png"), "png")
        dest = os.path.join(self.design, "later")
        organize.move(self.state, [page], dest, self.ctx)
        self.assertTrue(os.path.isfile(os.path.join(dest, "loose.html")))
        self.assertTrue(os.path.isfile(os.path.join(dest, "loose.r2.html")))
        self.assertTrue(os.path.isfile(os.path.join(dest, "pic.png")))   # the asset is copied: the others may read the original
        self.assertTrue(os.path.isfile(os.path.join(self.design, "pic.png")))
        self.assertFalse(os.path.exists(copy))

    def test_a_taken_name_gets_a_number_and_nothing_is_overwritten(self):
        (page,) = self.task("poster")
        dest = os.path.join(self.design, "archive")
        self.put(os.path.join(dest, "poster", "keep.html"), "mine")
        organize.move(self.state, [page], dest, self.ctx)
        self.assertEqual(self.read(dest, "poster", "keep.html"), "mine")
        self.assertTrue(os.path.isfile(os.path.join(dest, "poster-2", "v1", "index.html")))

    def test_move_to_a_folder_outside_the_known_ones_is_refused(self):
        (page,) = self.task("poster")
        with self.assertRaises(organize.Refused) as e:
            organize.move(self.state, [page], os.path.join(tempfile.gettempdir(), "elsewhere-x"), self.ctx)
        self.assertEqual(e.exception.code, 403)
        with self.assertRaises(organize.Refused):
            organize.move(self.state, [page], os.path.join(self.cwd, ".git", "x"), self.ctx)
        with self.assertRaises(organize.Refused):
            organize.move(self.state, [page], "relative/folder", self.ctx)
        self.assertTrue(os.path.isfile(page))

    def test_move_into_itself_or_to_where_it_already_is_changes_nothing(self):
        (page,) = self.task("poster")
        got = organize.move(self.state, [page], os.path.join(self.design, "poster"), self.ctx)
        self.assertEqual((got["id"], got["moved"]), (None, []))
        self.assertTrue(os.path.isfile(page))
        got = organize.move(self.state, [page], self.design, self.ctx)
        self.assertEqual(got["moved"], [])

    def test_undo_of_a_move_puts_everything_back_and_the_map_forgets_it(self):
        a, b = self.task("poster", ("v1", "v2"))
        dest = os.path.join(self.design, "archive")
        got = organize.move(self.state, [a, b], dest, self.ctx)
        back = organize.undo(self.state, got["id"])
        self.assertEqual(back["conflicts"], [])
        self.assertTrue(os.path.isfile(a) and os.path.isfile(b))
        self.assertFalse(os.path.exists(os.path.join(dest, "poster")))
        mv = layout.Moves(self.state)
        mv.fresh()
        self.assertEqual(mv.remap(a), a)
        with self.assertRaises(organize.Refused) as e:
            organize.undo(self.state, got["id"])
        self.assertEqual(e.exception.code, 409)

    def test_the_same_move_can_be_done_and_undone_twice(self):
        (page,) = self.task("poster")
        dest = os.path.join(self.design, "archive")
        for _ in range(2):
            got = organize.move(self.state, [page], dest, self.ctx)
            self.assertTrue(os.path.isfile(os.path.join(dest, "poster", "v1", "index.html")))
            organize.undo(self.state, got["id"])
            self.assertTrue(os.path.isfile(page))

    def test_undo_does_not_overwrite_what_took_the_old_place(self):
        (page,) = self.task("poster")
        dest = os.path.join(self.design, "archive")
        got = organize.move(self.state, [page], dest, self.ctx)
        self.put(os.path.join(self.design, "poster", "new.html"), "new")
        back = organize.undo(self.state, got["id"])
        self.assertTrue(back["conflicts"])
        self.assertTrue(os.path.isfile(os.path.join(dest, "poster", "v1", "index.html")))
        self.assertEqual(self.read(self.design, "poster", "new.html"), "new")

    def test_the_registry_follows_a_move_and_comes_back_with_the_undo(self):
        import registry
        a, b = self.task("poster", ("v1", "v2"))
        reg = registry.Registry(self.state)
        for p in (a, b):
            reg.items[registry.key_of(p)] = {"path": p, "session": "designer", "ts": 1, "last": 1, "rank": 2}
        dest = os.path.join(self.design, "archive")
        got = organize.move(self.state, [a, b], dest, self.ctx)
        reg.relocate()
        moved = {registry.key_of(v["path"]) for v in reg.listing()}
        self.assertEqual(moved, {registry.key_of(os.path.join(dest, "poster", v, "index.html")) for v in ("v1", "v2")})
        back = organize.undo(self.state, got["id"])
        self.assertTrue(reg.rename(back["back"]))
        reg.relocate()
        self.assertEqual({registry.key_of(v["path"]) for v in reg.listing()}, {registry.key_of(a), registry.key_of(b)})

    def test_the_layout_undo_leaves_the_steps_of_the_selection_alone(self):
        (page,) = self.task("poster")
        dest = os.path.join(self.design, "archive")
        organize.move(self.state, [page], dest, self.ctx)
        self.assertEqual(layout.undo(self.state), 0)
        self.assertTrue(os.path.isfile(os.path.join(dest, "poster", "v1", "index.html")))

    # --- delete
    def test_delete_goes_to_the_trash_and_is_recorded(self):
        (page,) = self.task("poster")
        got = organize.delete(self.state, [page], self.ctx, now=1_800_000_000)
        self.assertFalse(os.path.exists(os.path.join(self.design, "poster")))
        (item,) = got["deleted"]
        self.assertTrue(item["to"].startswith(os.path.join(self.state, "hub-design", "trash")))
        self.assertTrue(os.path.isfile(os.path.join(item["to"], "v1", "index.html")))
        self.assertTrue(os.path.isfile(os.path.join(item["to"], "v1", "assets", "a.png")))
        rows = organize.rows(self.state)
        self.assertEqual([(r["op"], r["id"]) for r in rows], [("delete", got["id"])])

    def test_undo_of_a_delete_brings_the_folder_back(self):
        (page,) = self.task("poster")
        got = organize.delete(self.state, [page], self.ctx)
        back = organize.undo(self.state, got["id"])
        self.assertEqual(back["restored"], 1)
        self.assertTrue(os.path.isfile(page))
        self.assertTrue(os.path.isfile(os.path.join(self.design, "poster", "v1", "assets", "a.png")))
        self.assertIn("undone", [r["op"] for r in organize.rows(self.state)])

    def test_delete_takes_the_copies_of_a_loose_file_and_brings_them_back(self):
        page = self.put(os.path.join(self.design, "loose.html"))
        copy = self.put(os.path.join(self.design, "loose.r3.html"))
        got = organize.delete(self.state, [page], self.ctx)
        self.assertFalse(os.path.exists(page) or os.path.exists(copy))
        organize.undo(self.state, got["id"])
        self.assertTrue(os.path.isfile(page) and os.path.isfile(copy))

    def test_a_deleted_design_does_not_come_back_over_a_new_one(self):
        (page,) = self.task("poster")
        got = organize.delete(self.state, [page], self.ctx)
        self.task("poster")
        back = organize.undo(self.state, got["id"])
        self.assertEqual(back["restored"], 0)
        self.assertTrue(back["conflicts"])
        self.assertTrue(os.path.isdir(os.path.dirname(os.path.dirname(got["deleted"][0]["to"]))))

    def test_delete_of_something_the_page_does_not_serve_changes_nothing(self):
        with self.assertRaises(organize.Refused):
            organize.delete(self.state, [os.path.join(self.tmp, "nothing.html")], self.ctx)

    def test_the_log_is_json_lines(self):
        (page,) = self.task("poster")
        organize.delete(self.state, [page], self.ctx)
        with open(organize.log_path(self.state), encoding="utf-8") as f:
            for line in f:
                json.loads(line)


if __name__ == "__main__":
    unittest.main()
