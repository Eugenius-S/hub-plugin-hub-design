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


if __name__ == "__main__":
    unittest.main()
