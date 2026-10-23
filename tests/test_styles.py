"""The style reference library (styles.py): the folder, the index, the search, the card and, above all, that nothing outside the folder is ever reached.
Every style here is made up for the test."""
import json
import os
import shutil
import struct
import sys
import tempfile
import time
import unittest
import zlib

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import styles  # noqa: E402

MARLIN = """# Marlin - design system

> Calm blue-grey surfaces with one coral accent.

**Theme:** light

## Colors

| Name | Value | Role |
|---|---|---|
| Sea | #0B3C5D | Primary |
| Coral | `#FF6F61` | Accent |
| Fog | #F2F4F7 | Background |
| Sea again | #0b3c5d | duplicate, shown once |

## Typography

### Space Grotesk - headings
Weights 500 and 700.

### Inter - body
Weight 400.

## Spacing

| Step | Value |
|---|---|
| 1 | #123 |
"""
NIGHT = "# Night Owl\n\n**Theme:** dark\n\n- ink #101820\n"


def png():
    """A 2x2 PNG, enough for a picture the server hands out."""
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes([200, 100, 50] * 2) for _ in range(2))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def make_library(root):
    """Three invented styles in a folder: one with everything, one with a preview in a sub-folder, one bare."""
    os.makedirs(os.path.join(root, "previews"), exist_ok=True)
    for name, text in (("marlin__a1.md", MARLIN), ("night__b2.md", NIGHT), ("plain__c3.md", "# Plain\n")):
        with open(os.path.join(root, name), "w", encoding="utf-8") as f:
            f.write(text)
    with open(os.path.join(root, "previews", "marlin.png"), "wb") as f:
        f.write(png())
    index = {
        "a1": {"name": "Marlin", "file": "marlin__a1.md", "category": "Editorial", "tags": ["calm", "blue", "serif"], "preview": "previews/marlin.png",
               "site": "https://example.com/marlin", "description": "A calm editorial look."},
        "b2": {"name": "Night Owl", "file": "night__b2.md", "category": "Dark", "tags": ["blue", "neon"]},
        "c3": {"name": "plain", "file": "plain__c3.md", "category": "Editorial", "tags": []},
    }
    with open(os.path.join(root, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f)
    return index


class Folder(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="hd-styles-")
        self.state = os.path.join(self.tmp, "state")
        os.makedirs(self.state)
        self.env = os.environ.pop("HUB_DESIGN_STYLES", None)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)
        if self.env is not None:
            os.environ["HUB_DESIGN_STYLES"] = self.env

    def test_default_is_style_library_in_the_state_and_absent_means_off(self):
        self.assertIsNone(styles.folder({}, self.state))
        os.makedirs(os.path.join(self.state, "style-library"))
        self.assertEqual(styles.folder({}, self.state), os.path.realpath(os.path.join(self.state, "style-library")))

    def test_setting_of_the_plugin_beats_the_default_and_any_account_key_works(self):
        mine = os.path.join(self.tmp, "mine")
        os.makedirs(mine)
        os.makedirs(os.path.join(self.state, "style-library"))
        for key in ("eugenius-s:hub-design", "hub-design"):
            self.assertEqual(styles.folder({"extensions": {key: {"styles_dir": mine}}}, self.state), os.path.realpath(mine))
        self.assertEqual(styles.folder({"extensions": {"other": {"styles_dir": mine}}}, self.state), os.path.realpath(os.path.join(self.state, "style-library")))
        self.assertIsNone(styles.folder({"extensions": {"hub-design": {"styles_dir": os.path.join(self.tmp, "nope")}}}, self.state))

    def test_environment_overrides_for_tests(self):
        mine = os.path.join(self.tmp, "env")
        os.makedirs(mine)
        os.environ["HUB_DESIGN_STYLES"] = mine
        try:
            self.assertEqual(styles.folder({"extensions": {"hub-design": {"styles_dir": "x"}}}, self.state), os.path.realpath(mine))
        finally:
            del os.environ["HUB_DESIGN_STYLES"]


class Index(unittest.TestCase):
    def setUp(self):
        self.root = os.path.realpath(tempfile.mkdtemp(prefix="hd-styles-"))
        self.out = os.path.realpath(tempfile.mkdtemp(prefix="hd-outside-"))
        make_library(self.root)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)
        shutil.rmtree(self.out, ignore_errors=True)

    def write_index(self, data):
        with open(os.path.join(self.root, "index.json"), "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.utime(os.path.join(self.root, "index.json"), ns=(time.time_ns() + 10**9, time.time_ns() + 10**9))   # the cache sees a change at once

    def test_loads_a_dict_and_a_list_alike(self):
        lib = styles.load(self.root)
        self.assertEqual([e["name"] for e in lib.entries], ["Marlin", "Night Owl", "plain"])
        self.write_index([{"id": "x1", "name": "Listed", "file": "plain__c3.md"}, {"uuid": "x2", "name": "By uuid", "file": "plain__c3.md"}])
        self.assertEqual(sorted(styles.load(self.root).by_id), ["x1", "x2"])

    def test_no_index_or_nothing_usable_is_no_library(self):
        self.assertIsNone(styles.load(None))
        self.assertIsNone(styles.load(self.out))
        self.write_index({"a": {"name": "No file", "file": "ghost.md"}})
        self.assertIsNone(styles.load(self.root))
        with open(os.path.join(self.root, "index.json"), "w") as f:
            f.write("{broken")
        os.utime(os.path.join(self.root, "index.json"), ns=(time.time_ns() + 3 * 10**9,) * 2)
        self.assertIsNone(styles.load(self.root))

    def test_entries_that_point_outside_the_folder_are_dropped(self):
        with open(os.path.join(self.out, "evil.md"), "w") as f:
            f.write("# outside")
        with open(os.path.join(self.out, "evil.png"), "wb") as f:
            f.write(png())
        self.write_index({
            "ok": {"name": "Fine", "file": "plain__c3.md"},
            "dots": {"name": "Dots", "file": "../" + os.path.basename(self.out) + "/evil.md"},
            "abs": {"name": "Absolute", "file": os.path.join(self.out, "evil.md")},
            "sub": {"name": "Sub", "file": "previews/marlin.png"},
            "txt": {"name": "Not md", "file": "index.json"},
            "back": {"name": "Backslash", "file": "..\\evil.md"},
        })
        self.assertEqual(list(styles.load(self.root).by_id), ["ok"])

    def test_a_name_with_a_line_break_is_refused(self):
        # a name like that is legal on macOS and Linux; it would add lines to the message to the designer
        for bad in ("a\nb.md", "a\rb.md", "a\x00b.md"):
            self.assertIsNone(styles._inside(self.root, bad), repr(bad))
        self.assertTrue(styles._inside(self.root, "plain__c3.md"))

    def test_a_preview_outside_or_not_a_picture_is_dropped_but_the_style_stays(self):
        self.write_index({
            "a": {"name": "A", "file": "plain__c3.md", "preview": "../" + os.path.basename(self.out) + "/evil.png"},
            "b": {"name": "B", "file": "plain__c3.md", "preview": "night__b2.md"},
            "c": {"name": "C", "file": "plain__c3.md", "preview": "previews/marlin.png"},
            "d": {"name": "D", "file": "plain__c3.md", "preview": "C:/Windows/win.ini"},
        })
        lib = styles.load(self.root)
        self.assertEqual({k: bool(e["preview"]) for k, e in lib.by_id.items()}, {"a": False, "b": False, "c": True, "d": False})
        self.assertIsNone(lib.preview("a"))
        self.assertEqual(lib.preview("c"), os.path.join(self.root, "previews", "marlin.png"))

    def test_a_cover_is_a_video_inside_the_folder_or_nothing(self):
        for name in ("a.mp4", "b.webm"):
            with open(os.path.join(self.root, "previews", name), "wb") as f:
                f.write(b"\x00")
        self.write_index({
            "a": {"name": "A", "file": "plain__c3.md", "cover_video": "previews/a.mp4"},
            "b": {"name": "B", "file": "plain__c3.md", "cover_video": "previews/b.webm"},
            "c": {"name": "C", "file": "plain__c3.md", "cover_video": "previews/marlin.png"},
            "d": {"name": "D", "file": "plain__c3.md", "cover_video": "../" + os.path.basename(self.out) + "/evil.mp4"},
            "e": {"name": "E", "file": "plain__c3.md", "cover_video": ""},
            "f": {"name": "F", "file": "plain__c3.md"},
        })
        lib = styles.load(self.root)
        self.assertEqual({k: bool(e["cover"]) for k, e in lib.by_id.items()}, {"a": True, "b": True, "c": False, "d": False, "e": False, "f": False})
        self.assertEqual(lib.cover("a"), os.path.join(self.root, "previews", "a.mp4"))
        self.assertIsNone(lib.cover("c"))
        self.assertEqual(styles.brief(lib.by_id["a"])["cover"], True)
        self.assertNotIn("cover", styles.brief(lib.by_id["f"]))   # the card of a style without one is as it was

    def test_a_link_out_of_the_folder_is_not_followed(self):
        with open(os.path.join(self.out, "secret.md"), "w") as f:
            f.write("# secret")
        link = os.path.join(self.root, "link__z9.md")
        try:
            os.symlink(os.path.join(self.out, "secret.md"), link)
        except (OSError, NotImplementedError):
            self.skipTest("no symlinks here")
        self.write_index({"z": {"name": "Linked", "file": "link__z9.md"}, "ok": {"name": "Fine", "file": "plain__c3.md"}})
        self.assertEqual(list(styles.load(self.root).by_id), ["ok"])

    def test_the_site_is_kept_only_as_a_web_address(self):
        self.write_index({"a": {"name": "A", "file": "plain__c3.md", "site": "javascript:alert(1)"}, "b": {"name": "B", "file": "plain__c3.md", "site": "https://example.com"}})
        lib = styles.load(self.root)
        self.assertEqual((lib.by_id["a"]["site"], lib.by_id["b"]["site"]), ("", "https://example.com"))

    def test_index_is_read_again_when_it_changes(self):
        self.assertEqual(len(styles.load(self.root).entries), 3)
        self.write_index({"only": {"name": "Only", "file": "plain__c3.md"}})
        self.assertEqual(len(styles.load(self.root).entries), 1)


class Stale(unittest.TestCase):
    """The probe must not wait for a re-read of a big index: a changed index.json is answered with the library in the cache, the new one loads behind."""
    def setUp(self):
        self.root = os.path.realpath(tempfile.mkdtemp(prefix="hd-stale-"))
        make_library(self.root)
        styles._cache.clear()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def change(self):
        path = os.path.join(self.root, "index.json")
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        data["d4"] = {"name": "Fourth", "file": "plain__c3.md", "category": "Dark", "tags": []}
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.utime(path, ns=(time.time_ns() + 5_000_000_000, time.time_ns() + 5_000_000_000))

    def test_cold_cache_loads_in_place(self):
        self.assertEqual(len(styles.load(self.root, stale_ok=True).entries), 3)

    def test_changed_index_answers_with_the_old_library_and_reloads_behind(self):
        old = styles.load(self.root)
        self.change()
        self.assertIs(styles.load(self.root, stale_ok=True), old)   # no re-read in the request
        self.assertEqual(len(styles.load(self.root).entries), 4)    # the strict call (or the one behind) gives the new one

    def test_warm_loads_the_library_into_the_cache(self):
        styles.warm(self.root)
        self.assertIsNotNone(styles._cache.get(os.path.join(self.root, "index.json")))


class Search(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = os.path.realpath(tempfile.mkdtemp(prefix="hd-styles-"))
        make_library(cls.root)
        cls.lib = styles.load(cls.root)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.root, ignore_errors=True)

    def names(self, **kw):
        total, items = self.lib.search(**kw)
        return total, [i["name"] for i in items]

    def test_everything_alphabetically_and_by_category_with_counts(self):
        self.assertEqual(self.names(), (3, ["Marlin", "Night Owl", "plain"]))
        self.assertEqual(self.names(cat="Editorial"), (2, ["Marlin", "plain"]))
        self.assertEqual(self.lib.cats, [{"name": "Editorial", "n": 2}, {"name": "Dark", "n": 1}])

    def test_search_by_name_category_and_tag_every_word_must_hit(self):
        self.assertEqual(self.names(q="owl"), (1, ["Night Owl"]))
        self.assertEqual(self.names(q="DARK"), (1, ["Night Owl"]))
        self.assertEqual(self.names(q="blue"), (2, ["Marlin", "Night Owl"]))
        self.assertEqual(self.names(q="blue neon"), (1, ["Night Owl"]))
        self.assertEqual(self.names(q="blue calm editorial"), (1, ["Marlin"]))
        self.assertEqual(self.names(q="nothing like it"), (0, []))
        self.assertEqual(self.names(q="blue", cat="Dark"), (1, ["Night Owl"]))

    def test_a_hit_in_the_name_goes_before_a_hit_in_tags(self):
        root = os.path.realpath(tempfile.mkdtemp(prefix="hd-styles-"))
        try:
            with open(os.path.join(root, "a.md"), "w") as f:
                f.write("# a")
            with open(os.path.join(root, "index.json"), "w") as f:
                json.dump([{"id": "1", "name": "Aaa", "file": "a.md", "tags": ["fog"]}, {"id": "2", "name": "Zzz fog", "file": "a.md"}], f)
            _, items = styles.load(root).search(q="fog")
            self.assertEqual([i["name"] for i in items], ["Zzz fog", "Aaa"])
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_paging_and_the_limit_that_cannot_be_exceeded(self):
        self.assertEqual(self.names(offset=1, limit=1), (3, ["Night Owl"]))
        self.assertEqual(self.names(offset=5, limit=2), (3, []))
        self.assertEqual(self.names(limit=0), (3, []))
        root = os.path.realpath(tempfile.mkdtemp(prefix="hd-styles-"))
        try:
            with open(os.path.join(root, "a.md"), "w") as f:
                f.write("# a")
            with open(os.path.join(root, "index.json"), "w") as f:
                json.dump([{"id": str(n), "name": f"S{n:04d}", "file": "a.md"} for n in range(200)], f)
            total, items = styles.load(root).search(limit=10**6)
            self.assertEqual((total, len(items)), (200, styles.PAGE_MAX))
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_a_list_row_is_short_it_carries_no_paths(self):
        _, items = self.lib.search(q="marlin")
        self.assertEqual(items[0], {"id": "a1", "name": "Marlin", "category": "Editorial", "tags": ["calm", "blue", "serif"], "preview": True, "labels": []})


class Card(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = os.path.realpath(tempfile.mkdtemp(prefix="hd-styles-"))
        make_library(cls.root)
        cls.lib = styles.load(cls.root)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.root, ignore_errors=True)

    def test_card_has_the_full_path_of_the_file_and_what_is_read_from_it(self):
        d = styles.detail(self.lib, "a1")
        self.assertEqual(d["path"], os.path.join(self.root, "marlin__a1.md"))
        self.assertTrue(os.path.isabs(d["path"]))
        self.assertEqual((d["name"], d["category"], d["site"], d["description"]), ("Marlin", "Editorial", "https://example.com/marlin", "A calm editorial look."))
        self.assertEqual(d["theme"], "light")
        self.assertEqual(d["tagline"], "Calm blue-grey surfaces with one coral accent.")
        self.assertEqual(d["fonts"], ["Space Grotesk", "Inter"])
        self.assertEqual([c["hex"] for c in d["palette"]], ["#0b3c5d", "#ff6f61", "#f2f4f7"])   # only the colors table, the duplicate once, the spacing table is not colors
        self.assertEqual(d["palette"][0], {"name": "Sea", "hex": "#0b3c5d", "role": "Primary"})
        self.assertEqual(d["tags"], ["calm", "blue", "serif"])

    def test_a_bare_file_gives_a_card_without_a_palette(self):
        d = styles.detail(self.lib, "c3")
        self.assertEqual((d["palette"], d["fonts"], d["theme"], d["tagline"]), ([], [], "", ""))

    def test_unknown_id_and_a_file_that_vanished_give_nothing(self):
        self.assertIsNone(styles.detail(self.lib, "nope"))
        self.assertIsNone(styles.detail(self.lib, "../index"))
        root = os.path.realpath(tempfile.mkdtemp(prefix="hd-styles-"))
        try:
            make_library(root)
            lib = styles.load(root)
            os.remove(os.path.join(root, "night__b2.md"))
            self.assertIsNone(styles.detail(lib, "b2"))
            self.assertIsNone(lib.path("b2"))
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def test_parse_survives_odd_text(self):
        self.assertEqual(styles.parse(""), {"tagline": "", "theme": "", "palette": [], "fonts": []})
        d = styles.parse("**Theme:** purple\n| a | #12 |\n| b | #abcdef |\n")   # no "Colors" heading: the whole text is looked at
        self.assertEqual((d["theme"], [c["hex"] for c in d["palette"]]), ("", ["#abcdef"]))
        many = "## Colors\n" + "\n".join(f"| c{n} | #{n:06x} |" for n in range(1, 60))
        self.assertEqual(len(styles.parse(many)["palette"]), styles.PALETTE_MAX)


if __name__ == "__main__":
    unittest.main()
