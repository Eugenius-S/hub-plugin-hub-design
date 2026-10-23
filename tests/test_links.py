"""The memory of the style links (links.py) and what the settings tab does with them (linkctl.py): the links survive a restart, the styles that were in the
library before get their link without a file touched, deleting a link takes its styles and only theirs, the questions about the previews.
Everything is made up in a temporary folder; no site is asked and nothing of the live library is read."""
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="hd-links-test-")
os.environ["HUB_STATE_DIR"] = os.path.join(TMP, "state")
os.environ["HUB_CONFIG"] = os.path.join(TMP, "hub.json")
sys.path.insert(0, HERE)
import fetcher  # noqa: E402
import linkctl  # noqa: E402
import links  # noqa: E402

REFERO = "https://styles.refero.design"
A, B = "https://github.com/acme/set-a", "https://github.com/acme/set-b"


def write(path, data=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


class Lib(unittest.TestCase):
    """A library folder with styles s1..s4: s1 by A, s2 by A and B, s3 by B, s4 by no link (an old one)."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="case-", dir=TMP)
        self.root = os.path.join(self.dir, "lib")
        self.state = os.path.join(self.dir, "state")
        self.idx = {}
        for n, by in ((1, [A]), (2, [A, B]), (3, [B]), (4, None)):
            sid = f"s{n}"
            write(os.path.join(self.root, f"{sid}.md"), b"# style\n")
            write(os.path.join(self.root, "previews", f"{sid}.png"), b"png")
            write(os.path.join(self.root, "previews", f"{sid}.mp4"), b"mp4")
            e = {"uuid": sid, "name": f"Style {n}", "file": f"{sid}.md", "preview": f"previews/{sid}.png", "cover_video": f"previews/{sid}.mp4"}
            if by:
                e["source_urls"] = list(by)
            self.idx[sid] = e
        write(os.path.join(self.root, "other.md"), b"not a style of the index")
        self.save()

    def save(self):
        write(os.path.join(self.root, "index.json"), json.dumps(self.idx).encode())

    def nopic(self, *ids):
        """The styles have no picture: not in the entry and not on the disk (a picture on the disk would be taken for theirs)."""
        for sid in ids:
            self.idx[sid]["preview"] = ""
            os.remove(os.path.join(self.root, "previews", sid + ".png"))
        self.save()

    def index(self):
        with open(os.path.join(self.root, "index.json"), encoding="utf-8") as f:
            return json.load(f)

    def has(self, rel):
        return os.path.exists(os.path.join(self.root, rel))


class Memory(Lib):
    def mem(self):
        return links.Links(os.path.join(self.state, links.NAME))

    def test_links_survive_a_restart_and_a_removed_default_does_not_come_back(self):
        m = self.mem()
        self.assertEqual(m.seed(["https://a.example", "https://b.example"]), ["https://a.example", "https://b.example"])
        m.add("https://mine.example")
        m.remove("https://a.example")
        again = self.mem()
        self.assertEqual(again.urls(), ["https://b.example", "https://mine.example"])
        self.assertEqual(again.items()[0], {"url": "https://b.example", "default": True})
        self.assertEqual(again.seed(["https://a.example"]), [])   # once
        self.assertEqual(again.urls(), ["https://b.example", "https://mine.example"])

    def test_the_option_is_on_by_default_and_remembered(self):
        m = self.mem()
        self.assertTrue(m.auto)
        m.set_auto(False)
        self.assertFalse(self.mem().auto)

    def test_a_broken_file_is_a_fresh_memory(self):
        write(os.path.join(self.state, links.NAME), b"{not json")
        m = self.mem()
        self.assertEqual((m.urls(), m.seeded, m.auto), ([], False, True))

    def test_a_declined_link_is_forgotten_with_the_link(self):
        m = self.mem()
        m.add("https://a.example")
        m.decline(["https://a.example"])
        m.remove("https://a.example")
        self.assertEqual(self.mem().declined(), [])


class Bind(Lib):
    def test_the_old_styles_get_the_link_they_came_from_and_nothing_is_touched(self):
        self.idx = {"r1": {"uuid": "r1", "file": "r1.md", "url": "https://styles.refero.design/style/r1"},
                    "ios:x": {"id": "ios:x", "file": "ios--x.md", "set": "ios", "source": "Meliwat/awesome-ios-design-md"},
                    "mine": {"uuid": "mine", "file": "mine.md"}}
        self.save()
        before = sorted(os.listdir(self.root))
        saved = {REFERO, "https://github.com/meliwat/awesome-ios-design-md"}
        self.assertEqual(links.bind_existing(self.root, saved), 2)
        idx = self.index()
        self.assertEqual(idx["r1"]["source_urls"], [REFERO])
        self.assertEqual(idx["ios:x"]["source_urls"], ["https://github.com/meliwat/awesome-ios-design-md"])
        self.assertNotIn("source_urls", idx["mine"])
        self.assertEqual(sorted(os.listdir(self.root)), sorted(before + [links.BAK]))   # only the copy of the index is new
        self.assertEqual(links.bind_existing(self.root, saved), 0)

    def test_a_link_that_is_not_remembered_binds_nothing(self):
        self.idx = {"r1": {"uuid": "r1", "file": "r1.md", "url": "https://styles.refero.design/style/r1"}}
        self.save()
        self.assertEqual(links.bind_existing(self.root, {A}), 0)
        self.assertNotIn(links.BAK, os.listdir(self.root))


class Delete(Lib):
    def test_preview_counts_and_touches_nothing(self):
        before = sorted(os.listdir(os.path.join(self.root, "previews")))
        self.assertEqual(links.preview_delete(self.root, A), {"n": 1, "kept": 1})
        self.assertEqual(links.preview_delete(self.root, B), {"n": 1, "kept": 1})
        self.assertEqual(sorted(os.listdir(os.path.join(self.root, "previews"))), before)
        self.assertEqual(self.index(), self.idx)

    def test_a_link_takes_its_styles_and_keeps_the_ones_another_link_holds(self):
        self.assertEqual(links.delete(self.root, A), {"n": 1, "kept": 1})
        idx = self.index()
        self.assertEqual(sorted(idx), ["s2", "s3", "s4"])
        for rel in ("s1.md", "previews/s1.png", "previews/s1.mp4"):
            self.assertFalse(self.has(rel), rel)
        for rel in ("s2.md", "previews/s2.png", "s3.md", "s4.md", "previews/s4.mp4", "other.md"):
            self.assertTrue(self.has(rel), rel)
        self.assertEqual(idx["s2"]["source_urls"], [B])   # it lost this link only
        self.assertEqual(links.delete(self.root, B), {"n": 2, "kept": 0})   # now s2 goes with B
        self.assertEqual(sorted(self.index()), ["s4"])
        self.assertFalse(self.has("s2.md") or self.has("previews/s3.png"))

    def test_a_style_no_link_holds_is_never_deleted(self):
        links.delete(self.root, A)
        links.delete(self.root, B)
        self.assertEqual(sorted(self.index()), ["s4"])
        self.assertTrue(self.has("s4.md") and self.has("previews/s4.png"))

    def test_a_path_in_an_entry_cannot_leave_the_library(self):
        outside = os.path.join(self.dir, "outside.md")
        write(outside, b"keep")
        self.idx["s1"]["file"] = "../outside.md"
        self.idx["s1"]["preview"] = os.path.abspath(outside)
        self.save()
        links.delete(self.root, A)
        self.assertTrue(os.path.exists(outside))

    def test_a_list_index_is_kept_a_list(self):
        self.idx = [{**e, "id": e["uuid"]} for e in self.idx.values()]
        write(os.path.join(self.root, "index.json"), json.dumps(self.idx).encode())
        self.assertEqual(links.delete(self.root, A), {"n": 1, "kept": 1})
        data = self.index()
        self.assertIsInstance(data, list)
        self.assertEqual([e["id"] for e in data], ["s2", "s3", "s4"])

    def test_the_source_cleans_its_traces(self):
        class Src:
            host_names = ("x",)

            def __init__(self):
                self.seen = []

            def matches(self, url):
                return url.startswith("https://github.com")

            def remove_traces(self, root, link):
                self.seen.append((root, link))
        s = Src()
        links.delete(self.root, A, [s])
        self.assertEqual(s.seen, [(self.root, A)])

    def test_counts(self):
        self.assertEqual(links.counts(self.root), {A: 2, B: 2})


class Previews(Lib):
    def test_a_picture_a_designer_put_is_taken_for_the_style_that_has_none(self):
        self.idx["s1"]["preview"] = ""
        self.idx["ios:x"] = {"id": "ios:x", "file": "ios--x.md", "preview": ""}
        self.save()
        write(os.path.join(self.root, "previews", "s1.png"), b"a picture")
        write(os.path.join(self.root, "previews", "ios--x.webp"), b"")   # an empty file is not a picture
        self.assertEqual(links.adopt_previews(self.root), 1)
        self.assertEqual(self.index()["s1"]["preview"], "previews/s1.png")
        self.assertEqual(self.index()["ios:x"]["preview"], "")
        self.assertEqual(links.adopt_previews(self.root), 0)

    def test_the_question_is_about_the_styles_with_a_link_and_without_a_picture(self):
        self.nopic("s1", "s3", "s4")
        rows = links.without_preview(self.root)
        self.assertEqual(sorted(r[0] for r in rows), ["s1", "s3"])   # s4 came by no link: not from a download of ours
        self.assertEqual(sorted(r[0] for r in links.without_preview(self.root, {A})), ["s3"])
        self.assertEqual(links.preview_name("ios-design-md:foo bar"), "ios-design-md--foo--bar")


class FakeFetch:
    def __init__(self):
        self.state, self.started = "idle", []

    def status(self):
        return {"state": self.state}

    def start(self, urls):
        self.started.append(list(urls))
        return True, "", ""

    def join(self, timeout=0):
        pass


class Ctl(Lib):
    def make(self, defaults=(A, B), fetch=None):
        self.fetch = fetch or FakeFetch()
        self.facts = []
        self.ctl = linkctl.Ctl(links.Links(os.path.join(self.state, links.NAME)), self.fetch, lambda: self.root, self.state,
                               lambda t, d: self.facts.append((t, d)), list(defaults))
        return self.ctl

    def test_the_first_start_puts_the_default_links_binds_the_old_styles_and_downloads(self):
        for e in self.idx.values():
            e.pop("source_urls", None)
            e["set"], e["source"] = "x", "acme/set-a"
        self.save()
        c = self.make()
        self.assertEqual(c.startup(watch=False), "seeded")
        self.assertEqual(c.links.urls(), [A, B])
        self.assertEqual(self.fetch.started, [[A, B]])
        self.assertEqual(links.counts(self.root), {A: 4})   # the 2058 of the owner are bound, not fetched again

    def test_the_second_start_does_nothing_and_a_removed_default_stays_removed(self):
        c = self.make()
        c.startup(watch=False)
        c.links.remove(A)
        c = self.make()
        self.assertEqual(c.startup(watch=False), "")
        self.assertEqual(self.fetch.started, [])
        self.assertEqual(c.links.urls(), [B])

    def test_with_the_option_off_the_links_are_put_but_nothing_is_downloaded(self):
        c = self.make()
        c.links.set_auto(False)
        self.assertEqual(c.startup(watch=False), "seeded")
        self.assertEqual((self.fetch.started, c.links.urls()), ([], [A, B]))
        c = self.make(fetch=FakeFetch())   # the option from hub.json wins over the tab
        self.assertEqual(self.make().startup(watch=False, auto=False), "")

    def test_the_owner_is_told_once_about_the_styles_without_a_preview_after_the_background_download(self):
        self.nopic("s1")
        c = self.make()
        c.startup(watch=False)
        c.finished()
        self.assertEqual(len(self.facts), 1)
        kind, data = self.facts[0]
        self.assertEqual((kind, data["asked"], data["id"]), ("owner.notify", True, linkctl.NOTE_ID))
        self.assertIn("1", data["title"])
        c.finished()
        self.assertEqual(len(self.facts), 1)   # a second end of a run says nothing: it was not a background one

    def test_nothing_is_said_when_every_style_has_its_picture(self):
        c = self.make()
        c.startup(watch=False)
        c.finished()
        self.assertEqual(self.facts, [])

    def test_the_question_is_not_asked_while_a_run_is_on_and_not_after_no(self):
        self.nopic("s1")
        c = self.make()
        c.links.seed([A, B])
        self.assertEqual(c.status()["nopreview"]["n"], 1)
        self.fetch.state = "running"
        self.assertEqual(c.status()["nopreview"]["n"], 0)
        self.fetch.state = "done"
        self.assertEqual(c.act({"action": "decline"})[0], 200)
        self.assertEqual(c.status()["nopreview"]["n"], 0)
        self.assertEqual(self.make().status()["nopreview"]["n"], 0)   # remembered

    def test_the_task_for_the_designer_is_a_list_in_the_state_folder(self):
        self.nopic("s1", "s3")
        c = self.make()
        c.links.seed([A, B])
        code, res = c.act({"action": "nopreview"})
        self.assertEqual((code, res["n"]), (200, 2))
        with open(res["path"], encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(sorted(x["id"] for x in data["styles"]), ["s1", "s3"])
        item = next(x for x in data["styles"] if x["id"] == "s1")
        self.assertEqual((item["md"], item["preview_to"]), (os.path.join(self.root, "s1.md"), os.path.join(self.root, "previews", "s1")))
        self.assertTrue(res["path"].startswith(self.state))   # not in the owner's library
        self.assertEqual(c.status()["nopreview"]["n"], 0)

    def test_the_list_can_be_written_without_closing_the_question(self):
        self.nopic("s1")
        c = self.make()
        c.links.seed([A, B])
        code, res = c.act({"action": "nopreview", "decline": False})
        self.assertEqual((code, res["n"]), (200, 1))
        self.assertEqual(c.status()["nopreview"]["n"], 1)   # the task may not have been sent: the question stays until "decline"
        c.act({"action": "decline"})
        self.assertEqual(c.status()["nopreview"]["n"], 0)

    def test_the_tab_adds_links_and_refuses_what_is_not_a_link(self):
        c = self.make()
        self.assertEqual(c.act({"action": "add", "url": "styles.refero.design/"})[1], {"link": REFERO})
        self.assertEqual(c.act({"action": "add", "url": "not a link"})[1]["error"], "bad_link")
        self.assertEqual(c.act({"action": "add", "url": ""})[1]["error"], "bad_link")
        self.assertEqual(c.act({"action": "fly"})[1]["error"], "action")
        self.assertEqual(c.links.urls(), [REFERO])

    def test_removing_a_link_leaves_its_styles_and_deleting_it_asks_for_the_number_first(self):
        c = self.make()
        c.links.seed([A, B])
        self.assertEqual(c.act({"action": "remove", "url": A})[0], 200)
        self.assertEqual((c.links.urls(), sorted(self.index())), ([B], ["s1", "s2", "s3", "s4"]))
        c.links.add(A)
        self.assertEqual(c.act({"action": "delete_preview", "url": A})[1], {"n": 1, "kept": 1})
        self.assertEqual(sorted(self.index()), ["s1", "s2", "s3", "s4"])
        code, res = c.act({"action": "delete", "url": A})
        self.assertEqual((code, res), (200, {"n": 1, "kept": 1}))
        self.assertEqual((c.links.urls(), sorted(self.index())), ([B], ["s2", "s3", "s4"]))

    def test_deleting_an_unknown_link_or_during_a_run_is_refused_and_touches_nothing(self):
        c = self.make()
        c.links.seed([A, B])
        self.assertEqual(c.act({"action": "delete", "url": "https://github.com/acme/none"})[1]["error"], "no_link")
        self.fetch.state = "running"
        self.assertEqual(c.act({"action": "delete", "url": A})[1]["error"], "busy")
        self.assertEqual((c.links.urls(), sorted(self.index())), ([A, B], ["s1", "s2", "s3", "s4"]))

    def test_status_counts_the_styles_of_every_link(self):
        c = self.make()
        c.links.seed([A, B, "https://github.com/acme/empty"])
        st = c.status()
        self.assertEqual([(x["url"], x["n"], x["default"]) for x in st["links"]], [(A, 2, True), (B, 2, True), ("https://github.com/acme/empty", 0, True)])
        self.assertTrue(st["auto"])


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
