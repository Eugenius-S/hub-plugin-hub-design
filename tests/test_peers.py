"""Designs of the other machines (peers.py): each machine writes its registry and small shots to a shared folder, reads the others';
a file is written only when it changed, shots of gone designs are erased, the start screen gets names and pictures, never files."""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import unittest.mock

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="hd-peers-test-")
# never touch the live hub: state and settings are temporary, unconditionally
os.environ["HUB_STATE_DIR"] = os.path.join(TMP, "state")
os.environ["HUB_CONFIG"] = os.path.join(TMP, "hub.json")
os.environ["HUB_DESIGN_PORT"] = "0"
sys.path.insert(0, HERE)
import peers  # noqa: E402

JPEG = b"\xff\xd8\xff\xe0fake-jpeg"


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


class Shooter:
    """A stand-in for Chrome: writes a fake JPEG and counts the runs."""
    def __init__(self, ok=True):
        self.ok, self.runs = ok, []

    def __call__(self, real, out):
        self.runs.append(real)
        if self.ok:
            with open(out, "wb") as f:
                f.write(JPEG)
        return self.ok


class Export(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(dir=TMP)
        self.site = tempfile.mkdtemp(dir=TMP)
        self.a = self.design("a.html")
        self.b = self.design("b.html")

    def design(self, name):
        path = os.path.join(self.site, name)
        with open(path, "w") as f:
            f.write("<p>%s</p>" % name)
        return path

    def rows(self, *paths):
        return [{"path": p, "session": "designer", "ts": 10, "last": 20} for p in paths]

    def doc(self, me="mac-one"):
        with open(os.path.join(self.root, me, peers.FILE), encoding="utf-8") as f:
            return json.load(f)

    def test_the_first_pass_writes_the_registry_and_a_shot_of_each_design(self):
        shoot = Shooter()
        res = peers.export(self.root, self.rows(self.a, self.b), shoot, title=lambda p: "Title " + os.path.basename(p), me="mac-one")
        self.assertEqual((res["written"], res["shot"], res["left"]), (True, 2, 0))
        doc = self.doc()
        self.assertEqual(doc["machine"], "mac-one")
        self.assertEqual(sorted(it["name"] for it in doc["items"]), ["Title a.html", "Title b.html"])
        for it in doc["items"]:
            self.assertTrue(os.path.isfile(os.path.join(self.root, "mac-one", peers.SHOTS, it["shot"])))
            self.assertNotIn(self.site, json.dumps(it))   # no paths of this machine travel: only the file name

    def test_nothing_changed_nothing_is_written_and_chrome_does_not_run(self):
        peers.export(self.root, self.rows(self.a, self.b), Shooter(), me="mac-one")
        path = os.path.join(self.root, "mac-one", peers.FILE)
        before = os.path.getmtime(path)
        shoot = Shooter()
        res = peers.export(self.root, self.rows(self.a, self.b), shoot, me="mac-one")
        self.assertEqual((res["written"], shoot.runs), (False, []))
        self.assertEqual(os.path.getmtime(path), before)

    def test_an_edited_design_is_shot_again_only_it(self):
        stamps = {self.a: 1, self.b: 1}
        peers.export(self.root, self.rows(self.a, self.b), Shooter(), stamp=stamps.get, me="mac-one")
        stamps[self.a] = 2
        shoot = Shooter()
        peers.export(self.root, self.rows(self.a, self.b), shoot, stamp=stamps.get, me="mac-one")
        self.assertEqual(shoot.runs, [self.a])

    def test_a_gone_design_leaves_the_registry_and_its_shot_is_erased(self):
        peers.export(self.root, self.rows(self.a, self.b), Shooter(), me="mac-one")
        shots = os.path.join(self.root, "mac-one", peers.SHOTS)
        self.assertEqual(len(os.listdir(shots)), 2)
        peers.export(self.root, self.rows(self.a), Shooter(), me="mac-one")
        self.assertEqual([it["file"] for it in self.doc()["items"]], ["a.html"])
        self.assertEqual(os.listdir(shots), [peers.item_id(self.a) + ".jpg"])

    def test_a_process_that_sees_no_design_yet_does_not_empty_the_export(self):
        # 23.10: after a restart of the process the files were "not served" for a while: an empty registry went to the other machine, its tile of the start screen vanished
        peers.export(self.root, self.rows(self.a, self.b), Shooter(), me="mac-one", hub="Nexus-Mac")
        shots = os.path.join(self.root, "mac-one", peers.SHOTS)
        res = peers.export(self.root, [], Shooter(), me="mac-one", hub="", allow_empty=False)
        self.assertFalse(res["written"])
        self.assertEqual(len(self.doc()["items"]), 2)
        self.assertEqual(len(os.listdir(shots)), 2)
        peers.export(self.root, self.rows(self.a, self.b), Shooter(), me="mac-one", hub="")
        self.assertEqual(self.doc()["hub"], "Nexus-Mac")   # no hub name read yet: the old one stays
        peers.export(self.root, [], Shooter(), me="mac-one", allow_empty=True)   # really none for good: the export is emptied
        self.assertEqual(self.doc()["items"], [])

    def test_the_loop_empties_the_export_only_after_several_empty_passes_in_a_row(self):
        peers.export(self.root, self.rows(self.a), Shooter(), me=peers.machine())
        seen = []

        def sleep(_):
            seen.append(len(self.doc(peers.machine())["items"]))
            if len(seen) >= peers.EMPTY_PASSES:
                raise SystemExit
        with unittest.mock.patch.object(peers.time, "sleep", sleep):
            with self.assertRaises(SystemExit):
                peers.run(lambda: self.root, lambda: [], Shooter(), None, None)
        self.assertEqual(seen, [1] * (peers.EMPTY_PASSES - 1) + [0])

    def test_a_design_that_cannot_be_shot_is_not_retried_every_pass(self):
        peers.export(self.root, self.rows(self.a), Shooter(ok=False), me="mac-one")
        self.assertEqual(self.doc()["items"][0]["shot"], "")
        shoot = Shooter()
        peers.export(self.root, self.rows(self.a), shoot, me="mac-one")
        self.assertEqual(shoot.runs, [])

    def test_a_big_registry_is_shot_a_few_per_pass(self):
        paths = [self.design("d%d.html" % i) for i in range(5)]
        res = peers.export(self.root, self.rows(*paths), Shooter(), me="mac-one", limit=2)
        self.assertEqual((res["shot"], res["left"]), (2, 3))
        res = peers.export(self.root, self.rows(*paths), Shooter(), me="mac-one", limit=2)
        self.assertEqual((res["shot"], res["left"]), (2, 1))

    def test_a_missing_file_is_not_exported(self):
        peers.export(self.root, self.rows(self.a, os.path.join(self.site, "gone.html")), Shooter(), me="mac-one")
        self.assertEqual([it["file"] for it in self.doc()["items"]], ["a.html"])


class Groups(unittest.TestCase):
    """The grouping of the designs of another machine: by the direction (a name), never by a path of its system."""
    SESSIONS = [
        {"name": "hub-core", "cwd": "C:/Hub", "kind": "hub"},
        {"name": "ads", "cwd": "C:/Work/Ads", "role": ""},
        {"name": "ads-b", "cwd": "C:/Work/Ads/sub", "role": "worker"},
        {"name": "x", "cwd": "C:/Work/X", "role": "worker"}, {"name": "y", "cwd": "C:/Work/X", "role": "worker"},
        {"name": "designer", "cwd": "C:/Work/D", "role": ""},
    ]

    def test_directions_and_the_deepest_folder_name_the_group(self):
        dirs = peers.direction_dirs(self.SESSIONS, {"ads"})
        self.assertEqual(sorted(n for _k, n in dirs), ["X", "ads", "ads-b"])   # two in one folder - the folder name; hub and specialists are none
        self.assertEqual(peers.folder_label(r"C:\Work\Ads\sub\a\i.html", dirs), "ads-b")   # the deepest wins
        self.assertEqual(peers.folder_label("c:/work/ads/design/i.html", dirs), "ads")             # Windows paths do not care for case
        self.assertEqual(peers.folder_label("C:/Work/D/i.html", dirs), "")                          # a specialist's folder is no direction
        self.assertEqual(peers.folder_label("C:/Elsewhere/i.html", dirs), "")

    def test_the_export_carries_the_group_and_the_hub_name_and_the_read_gives_them_back(self):
        root = tempfile.mkdtemp(dir=TMP)
        site = tempfile.mkdtemp(dir=TMP)
        path = os.path.join(site, "a.html")
        with open(path, "w") as f:
            f.write("<p>a</p>")
        rows = [{"path": path, "session": "ads", "ts": 1, "last": 2, "dir": "ads"}]
        peers.export(root, rows, Shooter(), me="pc-two", hub="Nexus-Win")
        got = peers.peers(root, me="mac-one")
        self.assertEqual((got[0]["hub"], got[0]["items"][0]["dir"]), ("Nexus-Win", "ads"))
        with open(os.path.join(root, "pc-two", peers.FILE), encoding="utf-8") as f:
            text = f.read()
        self.assertNotIn(site.replace("\\", "/"), text.replace("\\\\", "/"))   # only the file name, no path of this system

    def test_an_old_registry_without_the_fields_reads_as_no_group_and_no_hub_name(self):
        root = tempfile.mkdtemp(dir=TMP)
        os.makedirs(os.path.join(root, "old"))
        with open(os.path.join(root, "old", peers.FILE), "w", encoding="utf-8") as f:
            json.dump({"v": 1, "machine": "old", "os": "mac", "items": [{"id": "a" * 16, "name": "A", "last": 1}]}, f)
        got = peers.peers(root, me="me")
        self.assertEqual((got[0]["hub"], got[0]["items"][0]["dir"]), ("", ""))


class Layout(unittest.TestCase):
    """The common folders of the start screen, the same rules as lib.js (isService, isDesigner)."""

    def test_covers_icons_and_test_pages_are_service(self):
        for path in ("/p/design/motion-loader/index.html", "/p/design/pack-icons/a.html", "/x/cover.html", "/x/a.svg", "/home/work-tmp/z/a.html"):
            self.assertTrue(peers.is_service(path), path)
        for path in ("/p/design/poster-bf-sale/index.html", "/x/landing.html"):
            self.assertFalse(peers.is_service(path), path)

    def test_the_designers_own_session_and_its_edit_lanes_are_the_designer(self):
        for name in ("designer", "hd-edits", "hd-edits-3", "Designer-2"):
            self.assertTrue(peers.is_designer(name), name)
        for name in ("", None, "ads-a", "designer-x", "redesigner"):
            self.assertFalse(peers.is_designer(name), name)


class Read(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(dir=TMP)

    def put(self, machine, items, os_name="windows", shots=()):
        d = os.path.join(self.root, machine)
        os.makedirs(os.path.join(d, peers.SHOTS), exist_ok=True)
        with open(os.path.join(d, peers.FILE), "w", encoding="utf-8") as f:
            json.dump({"v": 1, "machine": machine, "os": os_name, "items": items}, f)
        for s in shots:
            with open(os.path.join(d, peers.SHOTS, s), "wb") as f:
                f.write(JPEG)

    def test_a_text_file_is_no_design_whatever_the_other_machine_exported(self):
        self.put("pc-two", [{"id": "0123456789abcdef", "name": "Ideas", "file": "ideas.md", "last": 9},
                            {"id": "fedcba9876543210", "name": "Deck", "file": "deck.PDF", "last": 5},
                            {"id": "1111111111111111", "name": "Plan", "file": "plan.txt", "last": 4}])
        out = peers.peers(self.root, me="mac-one")
        self.assertEqual([it["name"] for it in out[0]["items"]], ["Deck"])

    def test_the_others_are_read_newest_first_and_this_machine_is_skipped(self):
        sid = "0123456789abcdef.jpg"
        self.put("pc-two", [{"id": "0123456789abcdef", "name": "Old", "file": "old.html", "last": 5, "shot": sid},
                            {"id": "fedcba9876543210", "name": "New", "file": "new.html", "last": 9, "shot": "fedcba9876543210.jpg"}], shots=[sid])
        self.put("mac-one", [{"id": "1111111111111111", "name": "Mine", "last": 1}], os_name="mac")
        out = peers.peers(self.root, me="mac-one")
        self.assertEqual([p["machine"] for p in out], ["pc-two"])
        self.assertEqual([it["name"] for it in out[0]["items"]], ["New", "Old"])
        self.assertEqual([it["shot"] for it in out[0]["items"]], ["", sid])   # a shot that is not there yet is not promised

    def test_a_broken_or_foreign_folder_is_ignored(self):
        os.makedirs(os.path.join(self.root, ".git"))
        os.makedirs(os.path.join(self.root, "junk"))
        with open(os.path.join(self.root, "junk", peers.FILE), "w") as f:
            f.write("{not json")
        self.assertEqual(peers.peers(self.root, me="mac-one"), [])

    def test_a_shot_outside_the_folder_is_never_served(self):
        self.put("pc-two", [], shots=["0123456789abcdef.jpg"])
        self.assertTrue(peers.shot_path(self.root, "pc-two", "0123456789abcdef.jpg"))
        for name, shot in (("..", "0123456789abcdef.jpg"), ("pc-two", "../registry.json"), ("pc-two", "x.png"), ("../pc-two", "0123456789abcdef.jpg")):
            self.assertIsNone(peers.shot_path(self.root, name, shot), (name, shot))


class Folder(unittest.TestCase):
    def setUp(self):
        env = unittest.mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("HUB_DESIGN_PEERS", None)

    def test_off_without_an_option_and_without_a_self_syncing_hub(self):
        code = tempfile.mkdtemp(dir=TMP)
        self.assertIsNone(peers.folder({}, code=code))

    def test_a_hub_that_syncs_itself_gives_the_folder_by_itself(self):
        code = tempfile.mkdtemp(dir=TMP)
        os.makedirs(os.path.join(code, "hub-sync"))
        open(os.path.join(code, "hub-sync", "sync.py"), "w").close()
        self.assertEqual(peers.folder({}, code=code), os.path.realpath(os.path.join(code, "hub-sync", "design")))

    def test_the_option_wins_and_an_empty_one_turns_it_off(self):
        code = tempfile.mkdtemp(dir=TMP)
        os.makedirs(os.path.join(code, "hub-sync"))
        open(os.path.join(code, "hub-sync", "sync.py"), "w").close()
        there = os.path.join(TMP, "shared")
        self.assertEqual(peers.folder({"extensions": {"someone:hub-design": {"peers_dir": there}}}, code=code), os.path.realpath(there))
        self.assertIsNone(peers.folder({"extensions": {"hub-design": {"peers_dir": ""}}}, code=code))
        os.environ["HUB_DESIGN_PEERS"] = ""
        self.assertIsNone(peers.folder({"extensions": {"hub-design": {"peers_dir": there}}}, code=code))


class Routes(unittest.TestCase):
    """/__canvas/peers and /__canvas/peer-shot of the plugin process."""
    ORIGIN = {"Origin": "http://localhost:8787"}

    @classmethod
    def setUpClass(cls):
        import server
        cls.server = server
        cls.srv = server.serve(0)
        cls.port = cls.srv.server_address[1]
        server.PORT = cls.port
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self):
        self.root = tempfile.mkdtemp(dir=TMP)
        env = unittest.mock.patch.dict(os.environ, {"HUB_DESIGN_PEERS": self.root})
        env.start()
        self.addCleanup(env.stop)
        Read.put(self, "pc-two", [{"id": "0123456789abcdef", "name": "Promo", "file": "index.html", "session": "designer", "last": 9,
                                   "shot": "0123456789abcdef.jpg"}], shots=["0123456789abcdef.jpg"])

    def get(self, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("GET", path, headers={"Host": f"localhost:{self.port}", **(headers or {})})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r, body

    def test_the_hub_page_gets_the_other_machines(self):
        with unittest.mock.patch.object(peers, "machine", return_value="mac-one"):
            r, body = self.get("/__canvas/peers", self.ORIGIN)
        data = json.loads(body)
        self.assertEqual((r.status, data["on"], data["machine"]), (200, True, "mac-one"))
        self.assertEqual([(p["machine"], p["os"], p["items"][0]["name"]) for p in data["peers"]], [("pc-two", "windows", "Promo")])

    def test_off_says_so_and_lists_nothing(self):
        os.environ["HUB_DESIGN_PEERS"] = ""
        r, body = self.get("/__canvas/peers", self.ORIGIN)
        self.assertEqual(json.loads(body), {"on": False, "machine": peers.machine(), "peers": []})

    def test_a_shot_is_served_as_jpeg_and_nothing_else_is(self):
        r, body = self.get("/__canvas/peer-shot?m=pc-two&s=0123456789abcdef.jpg")
        self.assertEqual((r.status, r.getheader("Content-Type"), body), (200, "image/jpeg", JPEG))
        r, _ = self.get("/__canvas/peer-shot?m=pc-two&s=" + "../registry.json")
        self.assertEqual(r.status, 404)
        r, _ = self.get("/__canvas/peer-shot?m=pc-two&s=0123456789abcdef.jpg", {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status, 403)

    def test_the_shot_of_this_machine_is_a_small_jpeg_from_chrome(self):
        seen = {}

        def fake(real, win, scale, fmt="png"):
            seen.update(win=win, scale=scale, fmt=fmt)
            return JPEG
        out = os.path.join(self.root, "x.jpg")
        with unittest.mock.patch.object(self.server, "chrome_shot", fake), unittest.mock.patch.object(self.server, "size_of", return_value=None):
            self.assertTrue(self.server.peer_shot(os.path.join(self.root, "a.html"), out))
        self.assertEqual(seen["fmt"], "jpeg")
        self.assertAlmostEqual(seen["win"][0] * seen["scale"], peers.SHOT_WIDTH)
        with open(out, "rb") as f:
            self.assertEqual(f.read(), JPEG)


class Projects(unittest.TestCase):
    SESSIONS = [{"name": "rewarded-ads", "cwd": "/w/Rewarded-ads", "role": "worker"}, {"name": "ads-passport", "cwd": "/w/ads-passport", "role": "worker"},
                {"name": "black-friday-2026", "cwd": "/w/Black Friday", "role": "worker"}, {"name": "hub-core", "cwd": "/w/hub", "kind": "hub"}]

    def setUp(self):
        self.dirs = peers.direction_dirs(self.SESSIONS, set())
        self.names = peers.direction_names(self.SESSIONS, set())

    def test_a_design_saved_in_a_project_folder_goes_to_the_direction_of_that_name(self):
        self.assertEqual(peers.project_label("/home/o/design/rewarded-ads/a.html", "", self.dirs, self.names), "rewarded-ads")
        self.assertEqual(peers.project_label("C:\\home\\design\\Black_Friday\\a.html", "", self.dirs, self.names), "black-friday-2026")
        self.assertEqual(peers.project_label("/home/o/design/ads_passport/a.html", "", self.dirs, self.names), "ads-passport")

    def test_a_shared_word_of_two_directions_decides_nothing_and_a_lone_hub_none(self):
        self.assertEqual(peers.project_label("/home/o/design/ads/a.html", "", self.dirs, self.names), "")   # "ads" is in two directions: no guessing
        self.assertEqual(peers.project_label("/home/o/design/hub-digest/a.html", "", self.dirs, self.names), "")   # "hub" is no word
        self.assertEqual(peers.project_label("/home/o/design/ouch-templates/a.html", "", self.dirs, self.names), "")

    def test_the_beginning_of_a_word_and_the_hub_sign(self):
        dirs = peers.direction_dirs([{"name": "ai-animations", "cwd": "D:\\W\\AI animations", "role": "worker"}, {"name": "hub-work", "cwd": "D:\\W\\Agent-hub", "role": "worker"},
                                     {"name": "rewarded-ads", "cwd": "D:\\W\\!Ads", "role": "worker"}], set())
        win = lambda folder, title="": peers.project_label("C:\\Users\\o\\design\\%s\\v2\\x.html" % folder, title, dirs)
        self.assertEqual(win("ai-anim-summary"), "ai-animations")
        self.assertEqual(win("anim-dashboard"), "ai-animations")
        self.assertEqual(win("ai-animations-report"), "ai-animations")
        for folder in ("hd-motion", "hd-spacing", "hub-design-carpets", "hub-recap", "hub-spacing"):
            self.assertEqual(win(folder), "hub-work", folder)
        self.assertEqual(win("hub"), "")                       # "hub" alone says nothing
        self.assertEqual(win("motion-loader"), "")
        self.assertEqual(win("style-previews", "Hub Design: style previews"), "")   # the folder is the place: the title does not move it
        self.assertEqual(win("ani-x"), "")                     # three signs are not a beginning
        self.assertEqual(peers.project_label("/h/design/hub-recap/a.html", "", [("/p/A", "ads")]), "")   # no hub direction: none

    def test_a_folder_no_direction_owns_goes_to_the_direction_that_asked_for_the_task_named_like_it(self):
        folders = [("rewarded-ads", "Rewarded-ads Ouch, beat 8, EN"), ("ads-passport", "Pulse landing, round 2")]
        label = lambda path, title="": peers.project_label(path, title, self.dirs, self.names, folders)
        self.assertEqual(label("/h/design/ouch-templates/a.html"), "rewarded-ads")
        self.assertEqual(label("/h/design/ouch-templates/tenner-post-a.html"), "rewarded-ads")
        self.assertEqual(label("/h/design/misc/a.html", "Ouch email"), "")   # a project folder: its place on disk, not the title
        self.assertEqual(label("/h/x/a.html", "Ouch email"), "rewarded-ads")   # no project folder: the title
        self.assertEqual(label("/h/design/misc/a.html"), "")
        self.assertEqual(peers.task_near("ouch pulse", folders), "")   # two directions equally near - nothing
        self.assertEqual(peers.task_near("ouch", folders + [("rewarded-ads", "Ouch again")]), "rewarded-ads")   # one direction asked for both: its label
        self.assertEqual(label("/h/design/rewarded-ads/a.html"), "rewarded-ads")   # a direction speaks before a task
        self.assertEqual(peers.project_label("/h/design/ouch-templates/a.html", "", [], None, folders), "rewarded-ads")

    def test_the_title_and_the_file_name_are_the_last_resort(self):
        self.assertEqual(peers.project_label("/home/o/x/a.html", "Black Friday, banner 2", self.dirs, self.names), "black-friday-2026")
        self.assertEqual(peers.project_label("/home/o/x/passport-card.html", "", self.dirs, self.names), "ads-passport")
        self.assertEqual(peers.project_of("/a/design/x.html"), "")


if __name__ == "__main__":
    unittest.main()


class Homes(unittest.TestCase):
    def test_a_session_of_a_direction_has_the_label_of_its_folder(self):
        sessions = [{"name": "rewarded-ads", "cwd": "/w/ads", "role": "worker"}, {"name": "ads-two", "cwd": "/w/ads", "role": "worker"},
                    {"name": "motion", "cwd": "/w/motion", "role": "worker"}, {"name": "designer", "cwd": "/d", "role": "agent"},
                    {"name": "hub", "cwd": "/h", "kind": "hub", "role": "worker"}]
        homes = peers.direction_homes(sessions, set())
        self.assertEqual(homes, {"rewarded-ads": "ads", "ads-two": "ads", "motion": "motion"})   # two directions in one folder - the folder name; the designer and the hub are none


class PlaceNames(unittest.TestCase):
    def test_the_name_of_a_tile_no_direction_owns_is_short_and_has_no_path(self):
        self.assertEqual(peers.short_title("Poster of the Black Friday sale: D:/work/x"), "Poster of the Black Friday sale")
        self.assertEqual(peers.short_title("Ouch, beat 8 \u2014 /Users/a/b"), "Ouch, beat 8")
        self.assertLessEqual(len(peers.short_title("A very long title that goes on and on for many many words indeed yes")), 49)
        self.assertEqual(peers.short_title(""), "")

    def test_a_headline_is_a_few_words_not_the_start_of_a_brief(self):
        self.assertEqual(peers.headline_of("Ролик Ouch"), "Ролик Ouch")
        for service in ("Задача владельца (d95926)", "Задача владельца d95926", "Owner task (d12)", "Задача от hub-dev (d7)", "(d95926)", "d95926"):
            self.assertEqual(peers.headline_of(service), "", service)   # the id of a task and the service name of a task of the owner are no headline
        self.assertEqual(peers.headline_of("Ролик Ouch (d95926)"), "Ролик Ouch")
        self.assertEqual(peers.place_label("/x/a/report.html", "Landing", "Задача владельца (d95926)"), "Landing")
        for brief in ("Role: the hub's designer", "Trial: the same brief went to Claude Design", "Довести PR Hub Design за Windows", "Сейчас у gen-y2k почти 7 мин ждёт\u2026",
                      "Cut\u2026", "Poster D:/work/x", "", "An overly long headline of three words aaaaaaaaaaaa"):
            self.assertEqual(peers.headline_of(brief), "", brief)

    def test_place_label_goes_folder_of_the_task_then_headline_then_title_then_file_and_index_is_named_by_its_folder(self):
        self.assertEqual(peers.place_label("/u/design/poster-bf-sale/v2/index.html", "T", "Ролик Ouch"), "Poster bf sale")   # the folder of the task first, readable
        self.assertEqual(peers.place_label("/u/x/report.html", "Неделя", "Ролик Ouch"), "Ролик Ouch")
        self.assertEqual(peers.place_label("/u/x/report.html", "Неделя", "Role: the hub's designer \u2014 read only\u2026"), "Неделя")
        self.assertEqual(peers.place_label("/x/y/z.html", "Email 1: Kyoto, D:/a"), "Email 1: Kyoto")
        self.assertEqual(peers.place_label("/x/y/z.html"), "Z")
        self.assertEqual(peers.place_label("/x/y/index.html"), "Y")
