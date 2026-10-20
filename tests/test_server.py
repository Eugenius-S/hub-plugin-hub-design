"""Процесс канваса: отдаёт только файлы веба из папок сессий и проектов, подкладывает agent.js, чужим не отвечает."""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="dc-test-")
# живой хаб не трогаем: состояние и настройки — временные, безусловно
os.environ["HUB_STATE_DIR"] = os.path.join(TMP, "state")
os.environ["HUB_CONFIG"] = os.path.join(TMP, "hub.json")
os.environ["DESIGN_CANVAS_PORT"] = "0"
sys.path.insert(0, HERE)
import server  # noqa: E402

SITE = os.path.join(TMP, "site")
OUT = os.path.join(TMP, "outside")


def setUpModule():
    os.makedirs(os.path.join(SITE, "assets"))
    os.makedirs(os.path.join(SITE, ".git"))
    os.makedirs(OUT)
    os.makedirs(os.environ["HUB_STATE_DIR"])
    with open(os.path.join(SITE, "index.html"), "w", encoding="utf-8") as f:
        f.write("<!doctype html><html><body><h1>Привет</h1></body></html>")
    with open(os.path.join(SITE, "assets", "clip.mp4"), "wb") as f:
        f.write(bytes(range(256)) * 4)
    with open(os.path.join(SITE, ".git", "config.json"), "w") as f:
        f.write("{}")
    with open(os.path.join(SITE, "secret.env"), "w") as f:
        f.write("KEY=1")
    with open(os.path.join(OUT, "x.html"), "w") as f:
        f.write("<p>чужое</p>")
    with open(os.environ["HUB_CONFIG"], "w", encoding="utf-8") as f:
        json.dump({"projects": {"site": {"path": SITE}}}, f)


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


class Server(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = server.serve(0)
        cls.port = cls.srv.server_address[1]
        server.PORT = cls.port
        server._roots["at"] = 0
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def get(self, path, headers=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Host": host or f"localhost:{self.port}"}
        h.update(headers or {})
        c.request("GET", path, headers=h)
        r = c.getresponse()
        body = r.read()
        c.close()
        return r, body

    def url(self, path):
        return "/f" + path

    def test_html_gets_agent_before_body_end(self):
        r, body = self.get(self.url(os.path.join(os.path.realpath(SITE), "index.html")))
        self.assertEqual(r.status, 200)
        text = body.decode()
        self.assertIn('<script src="/__canvas/agent.js"></script></body>', text)
        self.assertIn('"http://localhost:8787"', text)
        self.assertIn("frame-ancestors 'self' http://localhost:", r.getheader("Content-Security-Policy"))
        self.assertEqual(r.getheader("Cache-Control"), "no-store")

    def test_agent_served(self):
        r, body = self.get("/__canvas/agent.js")
        self.assertEqual(r.status, 200)
        self.assertIn(b"__canvasAgent", body)

    def test_outside_hidden_and_unknown_types_refused(self):
        for p in (os.path.join(OUT, "x.html"), os.path.join(SITE, ".git", "config.json"), os.path.join(SITE, "secret.env"),
                  os.path.join(SITE, "..", "outside", "x.html"), "/etc/hosts"):
            r, _ = self.get(self.url(os.path.realpath(p) if os.path.exists(p) else p))
            self.assertEqual(r.status, 404, p)

    def test_foreign_host_and_cross_site_refused(self):
        page = self.url(os.path.join(os.path.realpath(SITE), "index.html"))
        r, _ = self.get(page, host=f"evil.example:{self.port}")
        self.assertEqual(r.status, 403)
        r, _ = self.get(page, headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status, 403)
        r, _ = self.get(page, headers={"Sec-Fetch-Site": "same-site"})
        self.assertEqual(r.status, 200)

    def test_stat_follows_newest_file_in_folder(self):
        html = os.path.join(os.path.realpath(SITE), "index.html")
        q = "/__canvas/stat?path=" + html
        _, b1 = self.get(q)
        later = time.time() + 5
        css = os.path.join(SITE, "assets", "styles.css")
        with open(css, "w") as f:
            f.write("h1{}")
        os.utime(css, (later, later))
        _, b2 = self.get(q)
        self.assertGreater(json.loads(b2)["mtime"], json.loads(b1)["mtime"])
        r, _ = self.get("/__canvas/stat?path=" + os.path.join(os.path.realpath(OUT), "x.html"))
        self.assertEqual(r.status, 404)

    def test_range_for_video(self):
        r, body = self.get(self.url(os.path.join(os.path.realpath(SITE), "assets", "clip.mp4")), headers={"Range": "bytes=10-19"})
        self.assertEqual(r.status, 206)
        self.assertEqual(body, bytes(range(10, 20)))
        self.assertEqual(r.getheader("Content-Range"), "bytes 10-19/1024")

    def test_session_cwd_is_a_root(self):
        try:
            from core import journal
        except ImportError:
            self.skipTest("кода хаба нет в PYTHONPATH")
        j = journal.Journal(os.path.join(os.environ["HUB_STATE_DIR"], "journal.jsonl"))
        work = os.path.join(TMP, "work")
        os.makedirs(work, exist_ok=True)
        with open(os.path.join(work, "a.html"), "w") as f:
            f.write("<p>a</p>")
        r, _ = self.get(self.url(os.path.join(os.path.realpath(work), "a.html")))
        self.assertEqual(r.status, 404)
        j.append("session.requested", "designer", {"session_id": "s-d", "cwd": work, "role": "agent"})
        server._roots["at"] = 0
        try:
            r, _ = self.get(self.url(os.path.join(os.path.realpath(work), "a.html")))
            self.assertEqual(r.status, 200)
        finally:
            server._roots["at"] = 0


class Inject(unittest.TestCase):
    def test_no_body_tag_appends(self):
        self.assertTrue(server.inject(b"<p>x</p>").endswith(b'agent.js"></script>'))

    def test_last_body_wins(self):
        out = server.inject(b"<body><!-- </body> --></body>")
        self.assertTrue(out.endswith(b"</script></body>"))


if __name__ == "__main__":
    unittest.main()
