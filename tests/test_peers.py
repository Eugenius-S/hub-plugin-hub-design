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
