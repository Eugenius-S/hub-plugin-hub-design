"""The style fetcher (fetcher.py) against a made-up site on localhost: format of the library it writes, skipping what is there, stopping on a refusal and
continuing, the owner's stop, a broken index, and the /__canvas/fetch endpoints. No real site is asked; every style here is made up for the test."""
import http.client
import http.server
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="hd-fetch-test-")
os.environ["HUB_STATE_DIR"] = os.path.join(TMP, "state")   # never the live hub
os.environ["HUB_CONFIG"] = os.path.join(TMP, "hub.json")
os.environ["HUB_DESIGN_PORT"] = "0"
os.environ.pop("HUB_DESIGN_STYLES", None)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "tests"))
import fetcher  # noqa: E402
import server  # noqa: E402
import styles  # noqa: E402
from sources.refero import Refero  # noqa: E402
from test_sources import page  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 40


def uid(n):
    return f"{n:08d}-0000-4000-8000-{n:012d}"


class Site(http.server.BaseHTTPRequestHandler):
    """/sitemap.xml, /style/<id>, /img/<id>.png; `plan` says what each address does: a status, "challenge", a redirect, "ok"."""
    plan = {}
    names = {}
    hits = []

    def log_message(self, *a):
        pass

    def reply(self, code, body=b"", ctype="text/html; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        Site.hits.append(self.path)
        base = f"http://127.0.0.1:{self.server.server_address[1]}"
        if self.path == "/sitemap.xml":
            rows = "".join(f"<url><loc>{base}/style/{i}</loc><lastmod>2026-05-0{k % 9 + 1}</lastmod></url>" for k, i in enumerate(self.names))
            return self.reply(200, f"<urlset>{rows}</urlset>".encode(), "application/xml")
        what = self.plan.get(self.path, "ok")
        if what == "challenge":
            return self.reply(200, b"<html><title>Just a moment...</title><body>captcha</body></html>")
        if what == "redirect":
            return self.reply(302, b"", extra={"Location": "http://evil.example/x"})
        if isinstance(what, int):
            return self.reply(what)
        if self.path.startswith("/img/"):
            return self.reply(200, PNG, "image/png")
        sid = self.path.rsplit("/", 1)[-1]
        if self.path.startswith("/style/") and sid in self.names:
            md = f"# {self.names[sid]} - design system\n\n" + "line of the style file\n" * 80
            return self.reply(200, page(md=md, h1=self.names[sid], og=f"{base}/img/{sid}.png").encode())
        self.reply(404)


class Quiet(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):   # the client hangs up on a refused redirect: that is the point, not a trace
        pass


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.makedirs(os.environ["HUB_STATE_DIR"], exist_ok=True)
        cls.httpd = Quiet(("127.0.0.1", 0), Site)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.root_url = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def setUp(self):
        Site.plan, Site.hits = {}, []
        Site.names = {uid(1): "Alder", uid(2): "Birch", uid(3): "Cedar"}
        self.lib = os.path.join(TMP, "lib-" + self.id().rsplit(".", 1)[-1])   # not made: the fetcher makes it
        self.pauses = []
        self.f = self.make()

    def make(self, sleep=None):
        src = Refero(hosts=(f"127.0.0.1:{self.port}",), image_hosts=(f"127.0.0.1:{self.port}",), scheme="http")
        return fetcher.Fetcher(lambda: self.lib, [src], sleep=sleep or self.pauses.append)

    def run_to_end(self, urls=None, f=None):
        f = f or self.f
        ok, code, _ = f.start(urls or [self.root_url + "/"])
        self.assertTrue(ok, code)
        f.join(20)
        return f.status()

    def index(self):
        with open(os.path.join(self.lib, "index.json"), encoding="utf-8") as fh:
            return json.load(fh)


class Run(Base):
    def test_fills_the_library_in_the_format_the_style_window_reads(self):
        st = self.run_to_end()
        self.assertEqual((st["state"], st["total"], st["done"], st["added"], st["skipped"], st["failed"]), ("done", 3, 3, 3, 0, 0))
        lib = styles.load(self.lib)
        self.assertEqual([e["name"] for e in lib.entries], ["Alder", "Birch", "Cedar"])
        e = lib.by_id[uid(1)]
        self.assertEqual((e["file"], e["category"], e["tags"], e["preview"]), (f"alder__{uid(1)}.md", "SaaS", ["calm", "blue"], f"previews/{uid(1)}.png"))
        self.assertEqual(e["site"], "https://marlin.example/home")
        self.assertTrue(lib.path(uid(2)).endswith(f"birch__{uid(2)}.md") and lib.preview(uid(2)).endswith(f"{uid(2)}.png"))
        with open(lib.preview(uid(1)), "rb") as fh:
            self.assertEqual(fh.read(), PNG)
        with open(lib.path(uid(3)), encoding="utf-8", newline="") as fh:
            text = fh.read()
        self.assertTrue(text.startswith("# Cedar - design system\n") and "\r" not in text)
        self.assertEqual(self.index()[uid(1)]["lastmod"], "2026-05-01")

    def test_the_second_press_skips_what_is_there_and_asks_for_nothing_but_the_list(self):
        self.run_to_end()
        Site.hits = []
        st = self.run_to_end()
        self.assertEqual((st["state"], st["added"], st["skipped"]), ("done", 0, 3))
        self.assertEqual(Site.hits, ["/sitemap.xml"])

    def test_one_style_link_does_not_touch_the_sitemap(self):
        st = self.run_to_end([f"{self.root_url}/style/{uid(2)}"])
        self.assertEqual((st["total"], st["added"]), (1, 1))
        self.assertNotIn("/sitemap.xml", Site.hits)

    def test_a_pause_before_each_style_and_a_shorter_one_before_its_picture(self):
        self.run_to_end()
        self.assertEqual(len(self.pauses), 6)
        self.assertEqual(self.pauses[1], fetcher.IMAGE_GAP)
        lo, hi = fetcher.GAP
        self.assertTrue(all(lo <= p <= hi for p in self.pauses[0::2]))
        Site.hits = []
        self.pauses.clear()
        self.run_to_end()
        self.assertEqual(self.pauses, [])   # skipped styles are not waited for

    def test_a_refusal_stops_the_run_with_its_word_and_the_next_press_goes_on(self):
        for code, word in ((403, "forbidden"), (429, "rate")):
            with self.subTest(code=code):
                shutil.rmtree(self.lib, ignore_errors=True)
                Site.plan = {f"/style/{uid(2)}": code}
                st = self.run_to_end()
                self.assertEqual((st["state"], st["code"], st["http"], st["added"]), ("blocked", word, code, 1))
                self.assertEqual(sorted(self.index()), [uid(1)])
                Site.plan = {}
                st = self.run_to_end()
                self.assertEqual((st["state"], st["added"], st["skipped"]), ("done", 2, 1))

    def test_a_captcha_page_stops_the_run(self):
        Site.plan = {f"/style/{uid(1)}": "challenge"}
        st = self.run_to_end()
        self.assertEqual((st["state"], st["code"], st["added"]), ("blocked", "captcha", 0))

    def test_a_dead_page_is_counted_and_skipped_three_in_a_row_stop(self):
        Site.plan = {f"/style/{uid(2)}": 404}
        st = self.run_to_end()
        self.assertEqual((st["state"], st["added"], st["failed"], st["done"]), ("done", 2, 1, 3))
        Site.names = {uid(i): f"S{i}" for i in range(1, 8)}
        Site.plan = {f"/style/{uid(i)}": 404 for i in range(3, 8)}
        shutil.rmtree(self.lib, ignore_errors=True)
        st = self.run_to_end()
        self.assertEqual((st["state"], st["code"], st["added"], st["failed"]), ("error", "site_changed", 2, 3))

    def test_a_failing_site_is_asked_again_then_the_style_is_counted(self):
        Site.plan = {f"/style/{uid(3)}": 503}
        st = self.run_to_end()
        self.assertEqual((st["state"], st["added"], st["failed"]), ("done", 2, 1))
        self.assertEqual(Site.hits.count(f"/style/{uid(3)}"), fetcher.RETRIES + 1)

    def test_a_style_without_a_picture_is_still_a_style(self):
        Site.plan = {f"/img/{uid(1)}.png": 404}
        st = self.run_to_end()
        self.assertEqual((st["added"], st["failed"]), (3, 0))
        self.assertEqual(self.index()[uid(1)]["preview"], "")
        self.assertFalse(styles.load(self.lib).by_id[uid(1)]["preview"])

    def test_a_redirect_to_a_foreign_site_is_not_followed(self):
        Site.plan = {f"/style/{uid(1)}": "redirect"}
        st = self.run_to_end()
        self.assertEqual((st["added"], st["failed"]), (2, 1))
        self.assertFalse(any("evil" in h for h in Site.hits))

    def test_the_owner_stops_it_and_the_next_press_continues(self):
        def sleep(t):
            if not self.pauses:
                f.stop()
            self.pauses.append(t)
        f = self.make(sleep=sleep)
        st = self.run_to_end(f=f)
        self.assertEqual((st["state"], st["code"], st["added"]), ("stopped", "", 0))
        self.pauses.clear()
        st = self.run_to_end(f=self.make())
        self.assertEqual((st["state"], st["added"]), ("done", 3))


class Library(Base):
    def test_what_was_in_the_index_stays(self):
        os.makedirs(self.lib)
        with open(os.path.join(self.lib, "old.md"), "w", encoding="utf-8") as fh:
            fh.write("# Old\n")
        before = {"keep": {"uuid": "keep", "name": "Old", "file": "old.md", "extra": [1]}}
        with open(os.path.join(self.lib, "index.json"), "w", encoding="utf-8") as fh:
            json.dump(before, fh)
        self.run_to_end()
        got = self.index()
        self.assertEqual(got["keep"], before["keep"])
        self.assertEqual(len(got), 4)

    def test_a_list_index_stays_a_list(self):
        os.makedirs(self.lib)
        with open(os.path.join(self.lib, "old.md"), "w", encoding="utf-8") as fh:
            fh.write("# Old\n")
        with open(os.path.join(self.lib, "index.json"), "w", encoding="utf-8") as fh:
            json.dump([{"id": "keep", "name": "Old", "file": "old.md"}], fh)
        self.run_to_end()
        got = self.index()
        self.assertIsInstance(got, list)
        self.assertEqual(sorted(e["id"] for e in got), sorted(["keep", uid(1), uid(2), uid(3)]))
        self.assertEqual(len(styles.load(self.lib).entries), 4)
        st = self.run_to_end()
        self.assertEqual((st["added"], st["skipped"]), (0, 3))   # no duplicates on the next press
        self.assertEqual(len(self.index()), 4)

    def test_a_broken_index_is_not_overwritten(self):
        os.makedirs(self.lib)
        with open(os.path.join(self.lib, "index.json"), "w", encoding="utf-8") as fh:
            fh.write("{not json")
        st = self.run_to_end()
        self.assertEqual((st["state"], st["code"], st["added"]), ("error", "index_broken", 0))
        with open(os.path.join(self.lib, "index.json"), encoding="utf-8") as fh:
            self.assertEqual(fh.read(), "{not json")

    def test_an_entry_whose_file_is_gone_is_fetched_again(self):
        self.run_to_end()
        os.remove(os.path.join(self.lib, f"birch__{uid(2)}.md"))
        st = self.run_to_end()
        self.assertEqual((st["added"], st["skipped"]), (1, 2))
        self.assertEqual(len(styles.load(self.lib).entries), 3)


class Start(Base):
    def test_refusals_say_why_and_ask_nobody(self):
        f = self.f
        self.assertEqual(f.start([]), (False, "no_links", ""))
        self.assertEqual(f.start(["  ", 5, None]), (False, "no_links", ""))
        self.assertEqual(f.start(["hello"]), (False, "bad_link", "hello"))
        self.assertEqual(f.start(["https://styles.example.org/"]), (False, "no_source", "https://styles.example.org/"))
        self.assertEqual(f.start([self.root_url + "/", "https://styles.example.org/"])[1:], ("no_source", "https://styles.example.org/"))   # one foreign link refuses all
        self.assertEqual(f.start([f"https://x.example/{i}" for i in range(fetcher.LINKS_MAX + 1)])[1], "too_many")
        self.assertEqual(Site.hits, [])
        self.assertEqual(f.status()["state"], "idle")

    def test_a_second_start_while_running_is_busy_and_several_links_make_one_run(self):
        gate = threading.Event()
        f = self.make(sleep=lambda t: gate.wait(10))
        self.assertTrue(f.start([self.root_url + "/", f"{self.root_url}/style/{uid(1)}"])[0])   # the same style twice is one
        self.assertEqual(f.start([self.root_url + "/"])[1], "busy")
        for _ in range(100):
            if f.status()["total"]:
                break
            time.sleep(0.02)
        self.assertEqual((f.status()["state"], f.status()["total"]), ("running", 3))
        f.stop()
        self.assertEqual(f.status()["state"], "stopping")
        gate.set()
        f.join(20)
        self.assertEqual(f.status()["state"], "stopped")
        self.assertIn("127.0.0.1:%d" % self.port, f.status()["hosts"])


class Endpoints(Base):
    ORIGIN = "http://localhost:8787"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.srv = server.serve(0)
        cls.sport = cls.srv.server_address[1]
        server.PORT = cls.sport
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.saved = server.FETCH
        server.FETCH = self.f

    def tearDown(self):
        server.FETCH = self.saved

    def call(self, method, body=None, origin=ORIGIN, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.sport, timeout=10)
        h = {"Host": host or f"localhost:{self.sport}"}
        if origin:
            h["Origin"] = origin
        raw = None if body is None else json.dumps(body).encode()
        if raw:
            h["Content-Type"] = "application/json"
        c.request(method, "/__canvas/fetch", body=raw, headers=h)
        r = c.getresponse()
        data = json.loads(r.read() or b"{}")
        c.close()
        return r, data

    def test_only_the_hub_page_may_start_or_read(self):
        for method, body in (("GET", None), ("POST", {"action": "start", "urls": [self.root_url + "/"]})):
            for origin, host in (("http://evil.example", None), (None, None), (self.ORIGIN, "evil.example")):
                r, _ = self.call(method, body, origin, host)
                self.assertEqual(r.status, 403, (method, origin, host))
        self.assertEqual(Site.hits, [])

    def test_start_progress_and_stop(self):
        r, st = self.call("GET")
        self.assertEqual((r.status, st["state"], st["count"]), (200, "idle", 0))
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), self.ORIGIN)
        r, st = self.call("POST", {"action": "start", "urls": [self.root_url + "/"]})
        self.assertEqual(r.status, 200)
        self.f.join(20)
        r, st = self.call("GET")
        self.assertEqual((st["state"], st["added"]), ("done", 3))
        self.assertEqual(st["urls"], [self.root_url + "/"])
        self.assertEqual(st["count"], 0)   # the library of the plugin is another folder: the count is what the Style window has

    def test_wrong_requests_get_a_word(self):
        r, st = self.call("POST", {"action": "start", "urls": ["https://styles.example.org/"]})
        self.assertEqual((r.status, st["error"], st["link"]), (400, "no_source", "https://styles.example.org/"))
        r, st = self.call("POST", {"action": "dance"})
        self.assertEqual((r.status, st["error"]), (400, "action"))
        c = http.client.HTTPConnection("127.0.0.1", self.sport, timeout=10)
        c.request("POST", "/__canvas/fetch", body=b"{nope", headers={"Host": f"localhost:{self.sport}", "Origin": self.ORIGIN, "Content-Length": "5"})
        self.assertEqual(c.getresponse().status, 400)
        c.close()
        r, st = self.call("POST", {"action": "stop"})
        self.assertEqual((r.status, st["state"]), (200, "idle"))

    def test_the_target_is_the_library_folder_of_the_plugin(self):
        os.environ["HUB_DESIGN_STYLES"] = self.lib
        try:
            self.assertEqual(styles.target({}, "x"), os.path.realpath(self.lib))
            self.assertIsNone(styles.folder({}, "x"))   # not made yet: the Style button is hidden
            os.makedirs(self.lib)
            self.assertEqual(styles.folder({}, "x"), os.path.realpath(self.lib))
        finally:
            del os.environ["HUB_DESIGN_STYLES"]


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
