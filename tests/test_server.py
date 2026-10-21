"""Процесс Hub Design: отдаёт только файлы веба из папок сессий и проектов, подкладывает agent.js, чужим не отвечает."""
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
os.environ["HUB_DESIGN_PORT"] = "0"
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
        self.assertLess(text.index("/__canvas/anchor.js"), text.index("/__canvas/agent.js"))   # приметы пина — до агента
        self.assertIn('"http://localhost:8787"', text)
        self.assertIn("frame-ancestors 'self' http://localhost:", r.getheader("Content-Security-Policy"))
        self.assertEqual(r.getheader("Cache-Control"), "no-store")

    def test_raw_html_has_no_agent_and_download_is_attachment(self):
        page = self.url(os.path.join(os.path.realpath(SITE), "index.html"))
        r, body = self.get(page + "?raw=1")
        self.assertEqual(r.status, 200)
        self.assertNotIn(b"__canvas", body)
        self.assertIsNone(r.getheader("Content-Disposition"))
        r, body = self.get(page + "?raw=1&dl=1")
        self.assertIn("attachment", r.getheader("Content-Disposition"))
        self.assertIn("index.html", r.getheader("Content-Disposition"))
        self.assertNotIn(b"__canvas", body)

    def test_agent_served(self):
        r, body = self.get("/__canvas/agent.js")
        self.assertEqual(r.status, 200)
        self.assertIn(b"__canvasAgent", body)

    def test_anchor_served(self):
        r, body = self.get("/__canvas/anchor.js")
        self.assertEqual(r.status, 200)
        self.assertIn(b"HubAnchor", body)

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

    def test_have_tells_ok_missing_denied_for_the_hub_page_only(self):
        ok = os.path.join(os.path.realpath(SITE), "index.html")
        gone = os.path.join(os.path.realpath(SITE), "weekly", "weekly-2026-10-17.html")
        out = os.path.join(os.path.realpath(OUT), "x.html")
        nowhere = "/!Проекты/Icons8/analytics/weekly/weekly-2026-10-17.html"
        from urllib.parse import urlencode
        q = "/__canvas/have?" + urlencode([("path", p) for p in (ok, gone, out, nowhere)])
        r, body = self.get(q, headers={"Origin": "http://localhost:8787"})
        self.assertEqual(r.status, 200)
        self.assertEqual(json.loads(body), {ok: "ok", gone: "missing", out: "denied", nowhere: "missing"})
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), "http://localhost:8787")
        r, _ = self.get(q, headers={"Origin": "http://evil.example"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))   # читать ответ может только страница хаба
        r, _ = self.get(q, headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status, 403)

    def test_times_give_edit_time_only_for_files_we_may_show(self):
        ok = os.path.join(os.path.realpath(SITE), "index.html")
        out = os.path.join(os.path.realpath(OUT), "x.html")
        gone = os.path.join(os.path.realpath(SITE), "weekly", "nope.html")
        from urllib.parse import urlencode
        q = "/__canvas/times?" + urlencode([("path", p) for p in (ok, out, gone)])
        r, body = self.get(q, headers={"Origin": "http://localhost:8787"})
        self.assertEqual(r.status, 200)
        got = json.loads(body)
        self.assertEqual(list(got), [ok])
        self.assertGreater(got[ok], 1e9)
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), "http://localhost:8787")
        r, _ = self.get(q, headers={"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status, 403)

    def test_missing_document_is_a_page_not_raw_json(self):
        gone = os.path.join(os.path.realpath(SITE), "weekly", "a&b.html")
        r, body = self.get(self.url(gone))
        self.assertEqual(r.status, 404)
        self.assertIn("text/html", r.getheader("Content-Type"))
        self.assertIn("Файл не найден", body.decode())
        self.assertIn("a&amp;b.html", body.decode())                    # путь экранирован
        self.assertNotIn("no file", body.decode())
        self.assertIn("frame-ancestors", r.getheader("Content-Security-Policy"))   # в рамке показывается
        r, body = self.get(self.url(os.path.join(os.path.realpath(SITE), "gone.png")))
        self.assertEqual(json.loads(body), {"error": "no file"})        # не документ — как было

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

    def test_early_catcher_first_after_head(self):
        tag = server.EARLY_TAG
        self.assertIn(b"<head>" + tag + b"<title>", server.inject(b"<!doctype html><html><HEAD><title>x</title></HEAD><body></body></html>").replace(b"<HEAD>", b"<head>"))
        self.assertTrue(server.inject(b"<html lang=ru><body>x</body>").startswith(b"<html lang=ru>" + tag))
        self.assertTrue(server.inject(b"<!DOCTYPE html><p>x</p>").startswith(b"<!DOCTYPE html>" + tag))   # doctype остаётся первым — иначе режим совместимости
        self.assertTrue(server.inject(b"<p>x</p>").startswith(tag))
        self.assertEqual(server.inject(b"<head></head><body></body>").count(tag), 1)

    def test_early_js_is_served_and_catches_errors_not_console(self):
        src = open(os.path.join(server.HERE, "early.js"), encoding="utf-8").read()
        self.assertIn('addEventListener("error"', src)
        self.assertIn('addEventListener("unhandledrejection"', src)
        self.assertNotIn("console.error", src.replace("не console.error", ""))


if __name__ == "__main__":
    unittest.main()
