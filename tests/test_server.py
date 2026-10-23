"""The Hub Design process: serves only web files from session and project folders, injects agent.js, never answers foreign sites."""
import glob
import http.client
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import unittest
import unittest.mock

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="dc-test-")
# never touch the live hub: state and settings are temporary, unconditionally
os.environ["HUB_STATE_DIR"] = os.path.join(TMP, "state")
os.environ["HUB_CONFIG"] = os.path.join(TMP, "hub.json")
os.environ["HUB_DESIGN_PORT"] = "0"
sys.path.insert(0, HERE)
import server  # noqa: E402

def furl(path):
    return "/f/" + path.replace("\\", "/").lstrip("/")   # /f/Users/me/a.html, on Windows /f/C:/a.html


SITE = os.path.join(TMP, "site")
OUT = os.path.join(TMP, "outside")


def setUpModule():
    os.makedirs(os.path.join(SITE, "assets"))
    os.makedirs(os.path.join(SITE, ".git"))
    os.makedirs(OUT)
    os.makedirs(os.environ["HUB_STATE_DIR"])
    with open(os.path.join(SITE, "index.html"), "w", encoding="utf-8") as f:
        f.write("<!doctype html><html><body><h1>Hello, café</h1></body></html>")
    with open(os.path.join(SITE, "assets", "clip.mp4"), "wb") as f:
        f.write(bytes(range(256)) * 4)
    with open(os.path.join(SITE, ".git", "config.json"), "w") as f:
        f.write("{}")
    with open(os.path.join(SITE, "secret.env"), "w") as f:
        f.write("KEY=1")
    with open(os.path.join(SITE, "notes.md"), "w", encoding="utf-8") as f:
        f.write("# Launch notes\n\nA **bold** line <script>alert(1)</script> and [link](javascript:x)\n\n- one\n- two\n")
    with open(os.path.join(SITE, "logo.svg"), "w", encoding="utf-8") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>')
    with open(os.path.join(SITE, "doc.pdf"), "wb") as f:
        f.write(b"%PDF-1.4\n%%EOF\n")
    with open(os.path.join(OUT, "x.html"), "w") as f:
        f.write("<p>foreign</p>")
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
        return furl(path)

    def test_html_gets_agent_before_body_end(self):
        r, body = self.get(self.url(os.path.join(os.path.realpath(SITE), "index.html")))
        self.assertEqual(r.status, 200)
        text = body.decode()
        self.assertIn('<script src="/__canvas/agent.js"></script></body>', text)
        self.assertLess(text.index("/__canvas/anchor.js"), text.index("/__canvas/agent.js"))   # pin fingerprints come before the agent
        self.assertLess(text.index("/__canvas/snap.js"), text.index("/__canvas/agent.js"))     # so do the smart guides
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

    def test_pdf_is_the_viewer_svg_is_a_picture_markdown_is_no_design(self):
        from urllib.parse import urlencode
        svg = self.url(os.path.join(os.path.realpath(SITE), "logo.svg"))
        r, body = self.get(svg + "?player=1")   # on the canvas: a picture in <img> (the scripts of the svg do not run), not the svg itself
        self.assertIn("text/html", r.getheader("Content-Type"))
        self.assertIn(b"<img", body)
        r, body = self.get(svg)
        self.assertEqual(r.getheader("Content-Type"), "image/svg+xml")
        self.assertTrue(body.startswith(b"<svg"))
        md = os.path.join(os.path.realpath(SITE), "notes.md")
        r, body = self.get(self.url(md))   # Markdown is no design: not served at all (neither a page nor raw text)
        self.assertEqual(r.status, 404)
        self.assertNotIn(b"__canvas", body)
        with unittest.mock.patch.object(server, "chrome_path", return_value=None):
            r, _ = self.get("/__canvas/thumb?" + urlencode({"path": md}))
            self.assertEqual(r.status, 404)   # Markdown is no card: no shot
            r, _ = self.get("/__canvas/thumb?" + urlencode({"path": os.path.join(os.path.realpath(SITE), "logo.svg")}))
            self.assertEqual(r.status, 501)   # an svg is shot (here - no Chrome)
        pdf = self.url(os.path.join(os.path.realpath(SITE), "doc.pdf"))
        r, body = self.get(pdf)
        self.assertEqual(r.getheader("Content-Type"), "application/pdf")
        self.assertTrue(body.startswith(b"%PDF"))
        r, body = self.get(pdf + "?player=1")
        self.assertIn(b"application/pdf", body)

    def test_agent_served(self):
        r, body = self.get("/__canvas/agent.js")
        self.assertEqual(r.status, 200)
        self.assertIn(b"__canvasAgent", body)

    def test_anchor_served(self):
        r, body = self.get("/__canvas/anchor.js")
        self.assertEqual(r.status, 200)
        self.assertIn(b"HubAnchor", body)

    def test_snap_served(self):
        r, body = self.get("/__canvas/snap.js")
        self.assertEqual(r.status, 200)
        self.assertIn(b"HubSnap", body)

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
        nowhere = "/!Projects/demo/analytics/weekly/weekly-2026-10-17.html"
        from urllib.parse import urlencode
        q = "/__canvas/have?" + urlencode([("path", p) for p in (ok, gone, out, nowhere)])
        r, body = self.get(q, headers={"Origin": "http://localhost:8787"})
        self.assertEqual(r.status, 200)
        self.assertEqual(json.loads(body), {ok: "ok", gone: "missing", out: "denied", nowhere: "missing"})
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), "http://localhost:8787")
        r, _ = self.get(q, headers={"Origin": "http://evil.example"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))   # only the hub page may read the answer
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

    def test_missing_document_page_speaks_the_hub_language(self):
        gone = os.path.join(os.path.realpath(SITE), "weekly", "nope.html")
        r, body = self.get(self.url(gone) + "&lang=ru" if "?" in self.url(gone) else self.url(gone) + "?lang=ru")
        self.assertEqual(r.status, 404)
        self.assertIn("Файл не найден", body.decode())
        self.assertIn('lang="ru"', body.decode())
        r, body = self.get(self.url(gone), headers={"Accept-Language": "ru-RU,ru;q=0.9"})   # no ?lang=: the browser's
        self.assertIn("Файл не найден", body.decode())
        r, body = self.get(self.url(gone), headers={"Accept-Language": "de"})
        self.assertIn("File not found", body.decode())

    def test_pdf_error_carries_a_code_for_the_page(self):
        e = server.PdfError("Chrome did not print the PDF in 30 s", "timeout", 30)
        self.assertEqual((e.code, e.n), ("timeout", 30))
        self.assertEqual(server.PdfError("x").code, "")

    def test_missing_document_is_a_page_not_raw_json(self):
        gone = os.path.join(os.path.realpath(SITE), "weekly", "a&b.html")
        r, body = self.get(self.url(gone))
        self.assertEqual(r.status, 404)
        self.assertIn("text/html", r.getheader("Content-Type"))
        self.assertIn("File not found", body.decode())
        self.assertIn("a&amp;b.html", body.decode())                    # the path is escaped
        self.assertNotIn("no file", body.decode())
        self.assertIn("frame-ancestors", r.getheader("Content-Security-Policy"))   # shown in a frame
        r, body = self.get(self.url(os.path.join(os.path.realpath(SITE), "gone.png")))
        self.assertEqual(json.loads(body), {"error": "no file"})        # not a document: as before

    def test_range_for_video(self):
        r, body = self.get(self.url(os.path.join(os.path.realpath(SITE), "assets", "clip.mp4")), headers={"Range": "bytes=10-19"})
        self.assertEqual(r.status, 206)
        self.assertEqual(body, bytes(range(10, 20)))
        self.assertEqual(r.getheader("Content-Range"), "bytes 10-19/1024")

    def test_session_cwd_is_a_root(self):
        try:
            from core import journal
        except ImportError:
            self.skipTest("hub code is not on PYTHONPATH")
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


    def size_file(self, name, text):
        path = os.path.join(os.path.realpath(SITE), name)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
        return path

    def test_size_of_takes_meta_first_then_declared_html_body(self):
        meta = self.size_file("poster-meta.html", '<!doctype html><meta name="hub-frame" content="1080x1350"><style>body{width:500px;height:500px}</style><p>x</p>')
        self.assertEqual(server.size_of(meta), (1080, 1350))
        body = self.size_file("poster-body.html", "<style>/* body{width:9px} */ html,body{margin:0}\nbody{width:1080px;height:1350px;background:#000}</style><p>x</p>")
        self.assertEqual(server.size_of(body), (1080, 1350))
        inline = self.size_file("poster-inline.html", '<body style="width:800px;height:600px"><p>x</p>')
        self.assertEqual(server.size_of(inline), (800, 600))
        only_w = self.size_file("poster-w.html", "<style>body{width:900px}</style><p>x</p>")
        self.assertEqual(server.size_of(only_w), (900, None))

    def test_size_of_ignores_media_percent_and_rubbish(self):
        for name, text in (("plain.html", "<p>x</p>"),
                           ("media.html", "<style>@media (min-width:600px){body{width:1080px;height:1350px}}</style><p>x</p>"),
                           ("pct.html", "<style>body{width:100%;height:100vh}</style><p>x</p>"),
                           ("tiny.html", '<meta name="hub-frame" content="3x4"><p>x</p>'),
                           ("bad.html", '<meta name="hub-frame" content="широкий"><p>x</p>')):
            self.assertIsNone(server.size_of(self.size_file(name, text)), name)

    def test_size_endpoint_is_for_the_hub_page_and_files_inside_roots(self):
        from urllib.parse import urlencode
        meta = self.size_file("poster-ep.html", '<meta name="hub-frame" content="1080x1350"><p>x</p>')
        plain = self.size_file("plain-ep.html", "<p>x</p>")
        out = os.path.join(os.path.realpath(OUT), "x.html")
        q = "/__canvas/size?" + urlencode([("path", p) for p in (meta, plain, out)])
        r, body = self.get(q, headers={"Origin": "http://localhost:8787"})
        self.assertEqual(r.status, 200)
        self.assertEqual(json.loads(body), {meta: [1080, 1350]})
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), "http://localhost:8787")
        r, _ = self.get(q, headers={"Origin": "http://evil.example"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))

    def test_card_gives_state_title_and_time_for_the_hub_page(self):
        from urllib.parse import urlencode
        page = self.size_file("card.html", "<!doctype html><title>Чёрная пятница\n  пост</title><p>x</p>")
        r, body = self.get("/__canvas/card?" + urlencode({"path": page}), headers={"Origin": "http://localhost:8787"})
        self.assertEqual(r.status, 200)
        card = json.loads(body)
        self.assertEqual((card["state"], card["title"]), ("ok", "Чёрная пятница пост"))
        self.assertGreater(card["mtime"], 0)
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), "http://localhost:8787")
        clip = os.path.join(os.path.realpath(SITE), "assets", "clip.mp4")
        r, body = self.get("/__canvas/card?" + urlencode({"path": clip}))
        self.assertEqual((json.loads(body)["state"], json.loads(body)["title"]), ("ok", ""))
        deck = os.path.join(os.path.realpath(SITE), "deck.pptx")
        with open(deck, "wb") as f:
            f.write(b"PK")
        r, body = self.get("/__canvas/card?" + urlencode({"path": deck}))
        self.assertEqual((json.loads(body)["state"], json.loads(body)["title"]), ("ok", ""))   # a presentation: a card with its file
        r, body = self.get("/__canvas/card?" + urlencode({"path": os.path.join(OUT, "x.html")}))
        self.assertEqual(json.loads(body)["state"], "denied")
        r, body = self.get("/__canvas/card?" + urlencode({"path": os.path.join(os.path.realpath(SITE), "notes.md")}))   # Markdown is no design: not served, no title
        self.assertEqual((json.loads(body)["state"], json.loads(body)["title"]), ("denied", ""))
        r, body = self.get("/__canvas/card?" + urlencode({"path": os.path.join(os.path.realpath(SITE), "doc.pdf")}))
        self.assertEqual((json.loads(body)["state"], json.loads(body)["title"]), ("ok", ""))

    def test_thumb_without_chrome_is_501_and_outside_is_404(self):
        from urllib.parse import urlencode
        page = self.size_file("thumb.html", "<p>x</p>")
        env = os.environ.pop("HUB_TEST_CHROME", None)
        try:
            with unittest.mock.patch.object(server, "chrome_path", return_value=None):
                r, _ = self.get("/__canvas/thumb?" + urlencode({"path": page}))
                self.assertEqual(r.status, 501)
        finally:
            if env is not None:
                os.environ["HUB_TEST_CHROME"] = env
        r, _ = self.get("/__canvas/thumb?" + urlencode({"path": os.path.join(OUT, "x.html")}))
        self.assertEqual(r.status, 404)

    def test_tg_shot_says_why_there_is_no_picture(self):
        # 22.10: posts went without a picture and the log was silent - a refused path or no Chrome is said aloud
        import io
        page = self.size_file("tgshot.html", "<p>x</p>")
        for path, chrome, why in [(os.path.join(OUT, "x.html"), "/bin/x", "not a design in the hub's folders"),
                                  (page, None, "nothing shot it")]:
            err = io.StringIO()
            with unittest.mock.patch.object(server, "chrome_path", return_value=chrome), \
                    unittest.mock.patch.object(server, "thumb", side_effect=lambda *a, **k: None) if chrome is None else \
                    unittest.mock.patch.object(server, "thumb", side_effect=AssertionError("must not shoot")), \
                    unittest.mock.patch("sys.stderr", err):
                self.assertIsNone(server.tg_shot(path))
            self.assertIn(why, err.getvalue())

    def test_pdf_card_tile_is_the_first_page_not_the_headless_chrome_viewer(self):
        # the headless Chrome has no PDF viewer and shoots "Couldn't load plugin": a PDF is never given to it
        from urllib.parse import urlencode
        pdf = os.path.join(os.path.realpath(SITE), "doc.pdf")
        png = b"\x89PNG\r\n\x1a\nfake"
        with unittest.mock.patch.object(server, "pdf_shot", return_value=png), \
                unittest.mock.patch.object(server.subprocess, "Popen", side_effect=AssertionError("Chrome")):
            r, body = self.get("/__canvas/thumb?" + urlencode({"path": pdf}))
            self.assertEqual((r.status, r.getheader("Content-Type"), body), (200, "image/png", png))
        for n in os.listdir(server.thumb_dir()):
            os.remove(os.path.join(server.thumb_dir(), n))
        with unittest.mock.patch.object(server, "pdf_shot", return_value=None):
            r, _ = self.get("/__canvas/thumb?" + urlencode({"path": pdf}))
            self.assertEqual(r.status, 501)   # no rasterizer: an icon on the card

    def test_video_is_readable_by_the_hub_page_for_the_card_frame(self):
        clip = os.path.join(os.path.realpath(SITE), "assets", "clip.mp4")
        r, _ = self.get(self.url(clip), headers={"Origin": "http://localhost:8787"})
        self.assertEqual(r.status, 200)
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), "http://localhost:8787")
        r, _ = self.get(self.url(clip), headers={"Origin": "http://evil.example"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))

    def test_video_player_page(self):
        clip = os.path.join(os.path.realpath(SITE), "assets", "clip.mp4")
        r, body = self.get(self.url(clip) + "?player=1")
        self.assertEqual(r.status, 200)
        self.assertIn("text/html", r.getheader("Content-Type"))
        self.assertIn(b"<video", body)

    def test_roots_remember_session_folders_when_the_journal_is_unreadable(self):
        keep = dict(server._roots)
        extra = os.path.join(TMP, "remembered")
        os.makedirs(extra, exist_ok=True)
        try:
            server._roots.update(at=0, seen={extra})
            with unittest.mock.patch.dict(sys.modules, {"core.journal": None}):
                self.assertIn(os.path.realpath(extra), server.roots())
        finally:
            server._roots.clear()
            server._roots.update(keep)
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
        self.assertTrue(server.inject(b"<!DOCTYPE html><p>x</p>").startswith(b"<!DOCTYPE html>" + tag))   # doctype stays first, otherwise quirks mode
        self.assertTrue(server.inject(b"<p>x</p>").startswith(tag))
        self.assertEqual(server.inject(b"<head></head><body></body>").count(tag), 1)

    def test_early_js_is_served_and_catches_errors_not_console(self):
        src = open(os.path.join(server.HERE, "early.js"), encoding="utf-8").read()
        self.assertIn('addEventListener("error"', src)
        self.assertIn('addEventListener("unhandledrejection"', src)
        self.assertNotIn("console.error", src.replace("not console.error", ""))


if __name__ == "__main__":
    unittest.main()


FAKE = """#!%s
import os, sys, time
a = sys.argv[1:]
out = [x.split("=", 1)[1] for x in a if x.startswith("--print-to-pdf=")][0]
open(os.environ["FAKE_LOG"], "w").write("\\n".join(a))
mode = os.environ.get("FAKE_MODE", "ok")
if mode == "hang":
    open(os.environ["FAKE_LOG"] + ".pid", "w").write(str(os.getpid()))
    time.sleep(60)
if mode == "ok":
    open(out, "wb").write(b"%%PDF-1.4 fake")
"""


class Pdf(unittest.TestCase):
    """PDF: our own Chrome with its own profile in a temp folder; no Chrome: 501 (the page prints the frame itself)."""

    @classmethod
    def setUpClass(cls):
        cls.srv = server.serve(0)
        cls.port = cls.srv.server_address[1]
        server.PORT = cls.port
        server._roots["at"] = 0
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.page = furl(os.path.join(os.path.realpath(SITE), "index.html"))
        cls.fake = os.path.join(TMP, "fake-chrome")
        with open(cls.fake, "w") as f:
            f.write(FAKE % sys.executable)
        os.chmod(cls.fake, 0o755)
        cls.log = os.path.join(TMP, "fake.log")

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self):
        self.env = {k: os.environ.get(k) for k in ("HUB_TEST_CHROME", "FAKE_LOG", "FAKE_MODE")}
        os.environ["FAKE_LOG"] = self.log
        os.environ["HUB_TEST_CHROME"] = self.fake
        os.environ.pop("FAKE_MODE", None)

    def tearDown(self):
        for k, v in self.env.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def get(self, path, headers=None, timeout=20):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
        c.request("GET", path, headers={"Host": f"localhost:{self.port}", **(headers or {})})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r, body

    def test_pdf_is_printed_by_own_chrome_with_temp_profile(self):
        r, body = self.get(self.page + "?pdf=1&w=1200&h=700", {"Origin": "http://localhost:8787"})
        self.assertEqual(r.status, 200)
        self.assertEqual(r.getheader("Content-Type"), "application/pdf")
        self.assertIn("index.pdf", r.getheader("Content-Disposition"))
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), "http://localhost:8787")
        self.assertTrue(body.startswith(b"%PDF"))
        args = open(self.log).read().split("\n")
        profile = [a for a in args if a.startswith("--user-data-dir=")][0].split("=", 1)[1]
        self.assertTrue(profile.startswith(tempfile.gettempdir()) or "hub-design-pdf-" in profile)
        self.assertIn("--window-size=1200,700", args)
        self.assertIn("--headless", args)
        self.assertTrue(args[-1].startswith(f"http://127.0.0.1:{self.port}/f/") and args[-1].endswith("index.html?print=1&w=1200&h=700"))
        self.assertFalse(os.path.exists(os.path.dirname(profile)), "the temp folder is removed")

    def test_no_chrome_is_501_so_the_page_prints_itself(self):
        os.environ["HUB_TEST_CHROME"] = os.path.join(TMP, "nope")
        r, body = self.get(self.page + "?pdf=1")
        self.assertEqual(r.status, 501)
        self.assertEqual(json.loads(body)["error"], "no chrome")

    def test_chrome_that_prints_nothing_is_500_and_cleaned(self):
        os.environ["FAKE_MODE"] = "none"
        r, body = self.get(self.page + "?pdf=1")
        self.assertEqual(r.status, 500)
        self.assertIn("left no PDF", json.loads(body)["error"])

    def test_hung_chrome_is_killed_by_pid(self):
        os.environ["FAKE_MODE"] = "hang"
        old, server.PDF_TIMEOUT = server.PDF_TIMEOUT, 1
        try:
            r, body = self.get(self.page + "?pdf=1")
        finally:
            server.PDF_TIMEOUT = old
        self.assertEqual(r.status, 500)
        self.assertIn("did not print", json.loads(body)["error"])
        pid = int(open(self.log + ".pid").read())
        time.sleep(0.3)
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)

    def test_outside_files_and_non_html_are_not_printed(self):
        r, _ = self.get(furl(os.path.join(os.path.realpath(OUT), "x.html")) + "?pdf=1")
        self.assertEqual(r.status, 404)
        r, _ = self.get(furl(os.path.join(os.path.realpath(SITE), "assets", "clip.mp4")) + "?pdf=1")
        self.assertNotEqual(r.getheader("Content-Type"), "application/pdf")

    def test_print_version_is_raw_document_with_page_size_and_no_agent(self):
        r, body = self.get(self.page + "?print=1&w=800&h=600")
        self.assertEqual(r.status, 200)
        text = body.decode()
        self.assertIn("@page{size:", text)
        self.assertIn("print-color-adjust:exact", text)
        self.assertNotIn("/__canvas/agent.js", text)

    def test_pdf_of_a_sized_design_is_one_page_of_its_size_and_keeps_its_page_rule(self):
        path = os.path.join(os.path.realpath(SITE), "poster.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write('<meta name="hub-frame" content="1080x1350"><style>@page{size:1080px 1350px;margin:0}body{margin:0}</style><p>x</p>')
        r, body = self.get(furl(path) + "?pdf=1&w=1440&h=900")
        self.assertEqual(r.status, 200)
        args = open(self.log).read().split("\n")
        self.assertIn("--window-size=1080,1350", args)
        self.assertTrue(args[-1].endswith("poster.html?print=1&w=1080&h=1350&fixed=1"), args[-1])

    def test_print_script_keeps_own_page_rule_and_does_not_stretch_a_fixed_page(self):
        r, body = self.get(self.page + "?print=1&w=1080&h=1350&fixed=1")
        text = body.decode()
        self.assertIn("fixed", text)
        self.assertIn("@page", text)

    def test_real_chrome_page_is_window_sized(self):
        found = glob.glob(os.path.expanduser("~/.config/hub-core/chrome-headless-shell/**/chrome-headless-shell"), recursive=True)
        found = [f for f in found if os.path.isfile(f)]
        if not found:
            self.skipTest("no chrome-headless-shell")
        os.environ["HUB_TEST_CHROME"] = found[0]
        r, body = self.get(self.page + "?pdf=1&w=1200&h=700", timeout=60)
        self.assertEqual(r.status, 200, body[:200])
        self.assertTrue(body.startswith(b"%PDF"))
        box = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", body)
        self.assertTrue(box, "page size in the PDF")
        self.assertAlmostEqual(float(box.group(1)), 1200 * 0.75, delta=2)   # 1 px = 0.75 pt
        self.assertAlmostEqual(float(box.group(2)), 700 * 0.75, delta=2)

    def real(self):
        found = [f for f in glob.glob(os.path.expanduser("~/.config/hub-core/chrome-headless-shell/**/chrome-headless-shell"), recursive=True) if os.path.isfile(f)]
        if not found:
            self.skipTest("no chrome-headless-shell")
        os.environ["HUB_TEST_CHROME"] = found[0]

    def pdf_of(self, name, html, query="w=1000&h=600"):
        with open(os.path.join(SITE, name), "w", encoding="utf-8") as f:
            f.write(html)
        r, body = self.get(furl(os.path.join(os.path.realpath(SITE), name)) + "?pdf=1&" + query, timeout=60)
        self.assertEqual(r.status, 200, body[:200])
        return body

    def test_real_chrome_tall_document_is_one_tall_page(self):
        self.real()
        body = self.pdf_of("tall.html", "<!doctype html><body style='margin:0'><div style='height:2400px;background:#abc'>a tall design here</div>")
        box = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", body)
        self.assertAlmostEqual(float(box.group(1)), 1000 * 0.75, delta=2)
        self.assertAlmostEqual(float(box.group(2)), 2400 * 0.75, delta=3)
        self.assertEqual(len(re.findall(rb"/Type\s*/Page[^s]", body)), 1)

    def test_real_chrome_slides_are_one_page_each_at_slide_size(self):
        self.real()
        slide = "<section class='slide' style='width:800px;height:450px;background:#%s'>slide</section>"
        body = self.pdf_of("deck.html", "<!doctype html><body style='margin:0'>" + "".join(slide % c for c in ("e66", "6e6", "66e")) + "</body>")
        box = re.search(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)", body)
        self.assertAlmostEqual(float(box.group(1)), 800 * 0.75, delta=2)
        self.assertAlmostEqual(float(box.group(2)), 450 * 0.75, delta=2)
        self.assertEqual(len(re.findall(rb"/Type\s*/Page[^s]", body)), 3)


class Write(unittest.TestCase):
    """POST /__canvas/write: a hand edit goes point by point into the file, with a copy <name>.r<N>.html before the first write."""

    ORIGIN = "http://localhost:8787"
    HTML = ('<!doctype html><html><body><div class="card"><a class="btn" href="/x">Buy</a></div>'
            '<div class="card"><a class="btn" href="/y">Buy</a></div></body></html>')
    BTN = "div.card:nth-of-type(2) > a.btn"

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

    def setUp(self):
        self.dir = tempfile.mkdtemp(dir=SITE)
        self.path = os.path.join(os.path.realpath(self.dir), "page.html")
        self.put(self.path, self.HTML)

    def put(self, path, text):
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)

    def text(self, path=None):
        with open(path or self.path, encoding="utf-8") as f:
            return f.read()

    def post(self, body, origin=ORIGIN, host=None, raw=None):
        data = raw if raw is not None else json.dumps(body).encode()
        h = {"Host": host or f"localhost:{self.port}", "Content-Type": "application/json"}
        if origin:
            h["Origin"] = origin
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("POST", "/__canvas/write", body=data, headers=h)
        r = c.getresponse()
        out = r.read()
        c.close()
        return r, (json.loads(out) if out else {})

    def move(self, dx, **kw):
        return {"path": self.path, "round": 3, "changes": [{"sel": self.BTN, "label": "Buy", "tag": "a", "dx": dx, "dy": 0}], **kw}

    def test_first_write_keeps_a_copy_and_edits_only_the_element(self):
        r, d = self.post(self.move(12))
        self.assertEqual((r.status, d["ok"], d["copy"]), (200, True, "page.r3.html"))
        self.assertEqual(d["done"], [self.BTN])
        self.assertEqual(self.text(os.path.join(os.path.dirname(self.path), "page.r3.html")), self.HTML)
        self.assertEqual(self.text(), self.HTML.replace('<a class="btn" href="/y">', '<a style="translate: 12px 0px" class="btn" href="/y">'))
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), self.ORIGIN)

    def test_next_write_recomputes_from_the_copy_not_from_the_file(self):
        _, a = self.post(self.move(12))
        _, b = self.post(self.move(30, copy=a["copy"], fmtime=a["fmtime"]))
        self.assertEqual(b["copy"], "page.r3.html")
        self.assertIn("translate: 30px 0px", self.text())
        self.assertNotIn("12px", self.text())
        self.assertEqual(self.text().count("translate"), 1)

    def test_empty_state_restores_the_file_and_drops_the_copy(self):
        _, a = self.post(self.move(12))
        _, b = self.post({"path": self.path, "changes": [], "copy": a["copy"], "fmtime": a["fmtime"]})
        self.assertEqual((b["ok"], b["copy"]), (True, ""))
        self.assertEqual(self.text(), self.HTML)
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(self.path), "page.r3.html")))

    def test_nothing_to_write_makes_no_copy(self):
        r, d = self.post({"path": self.path, "round": 1, "changes": [{"sel": "#nope", "label": "x", "dx": 4}]})
        self.assertEqual((d["copy"], d["done"], d["skipped"][0]["sel"]), ("", [], "#nope"))
        self.assertEqual(d["skipped"][0]["code"], "absent")   # the page translates the reason by the code
        self.assertEqual(self.text(), self.HTML)
        self.assertEqual([f for f in os.listdir(os.path.dirname(self.path)) if ".r" in f], [])

    def test_copy_name_does_not_overwrite_an_existing_file(self):
        self.put(os.path.join(os.path.dirname(self.path), "page.r3.html"), "<p>previous copy</p>")
        _, d = self.post(self.move(5))
        self.assertNotEqual(d["copy"], "page.r3.html")
        self.assertEqual(self.text(os.path.join(os.path.dirname(self.path), "page.r3.html")), "<p>previous copy</p>")
        self.assertEqual(self.text(os.path.join(os.path.dirname(self.path), d["copy"])), self.HTML)

    def test_author_in_turn_means_409_and_file_untouched(self):
        r, d = self.post(self.move(12, busy=True))
        self.assertEqual((r.status, d["error"]), (409, "busy"))
        self.assertEqual(self.text(), self.HTML)
        self.assertEqual([f for f in os.listdir(os.path.dirname(self.path)) if ".r" in f], [])

    def test_file_changed_by_someone_else_means_409(self):
        _, a = self.post(self.move(12))
        time.sleep(0.02)
        self.put(self.path, self.text() + "<!-- designer -->")
        os.utime(self.path, (time.time() + 5, time.time() + 5))
        r, d = self.post(self.move(30, copy=a["copy"], fmtime=a["fmtime"]))
        self.assertEqual((r.status, d["error"]), (409, "changed"))
        self.assertIn("designer", self.text())
        self.assertIn("12px", self.text())

    def test_copy_name_from_the_outside_is_refused(self):
        for name in ("../page.r3.html", "other.r3.html", "page.html", "page.r3.html"):
            r, d = self.post(self.move(1, copy=name, fmtime=1))
            self.assertEqual((r.status, d["error"]), (409, "changed"), name)

    def test_only_the_hub_page_may_write(self):
        for origin in (None, "http://evil.example", "http://localhost:9999"):
            r, d = self.post(self.move(1), origin=origin)
            self.assertEqual(r.status, 403, origin)
        r, d = self.post(self.move(1), host="evil.example")
        self.assertEqual(r.status, 403)
        self.assertEqual(self.text(), self.HTML)

    def test_only_html_inside_the_roots(self):
        outside = os.path.join(OUT, "x.html")
        before = self.text(outside)
        r, _ = self.post({**self.move(1), "path": outside})
        self.assertEqual(r.status, 404)
        self.assertEqual(self.text(outside), before)
        secret = os.path.join(SITE, "secret.env")
        r, _ = self.post({**self.move(1), "path": secret})
        self.assertEqual(r.status, 404)
        r, _ = self.post({**self.move(1), "path": os.path.join(SITE, ".git", "config.json")})
        self.assertEqual(r.status, 404)

    def test_bad_body(self):
        self.assertEqual(self.post(None, raw=b"{oops")[0].status, 400)
        self.assertEqual(self.post(None, raw=b"[]")[0].status, 404)

    def test_tweaks_are_written_to_html_tag(self):
        r, d = self.post({"path": self.path, "round": 2, "changes": [], "ops": [{"kind": "var", "name": "--accent", "value": "#f00"}]})
        self.assertEqual((d["ops"], d["copy"]), ("done", "page.r2.html"))
        self.assertIn('<html style="--accent: #f00">', self.text())

    def test_preflight(self):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("OPTIONS", "/__canvas/write", headers={"Host": f"localhost:{self.port}", "Origin": self.ORIGIN, "Access-Control-Request-Method": "POST"})
        r = c.getresponse()
        r.read()
        self.assertEqual(r.status, 204)
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), self.ORIGIN)
        self.assertIn("POST", r.getheader("Access-Control-Allow-Methods"))


class AutoSend(unittest.TestCase):
    """Auto-send (0.8.1): no \"Send to the designer\" banner above the field, the recipient is the one picked below, comments are left alone."""
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def src(self, name):
        with open(os.path.join(self.here, name), encoding="utf-8") as f:
            return f.read()

    def test_no_banner_and_no_reset(self):
        main, css = self.src("main.js"), self.src("style.css")
        # the Russian words are the old banner texts, kept on purpose: they must not come back in any language table
        for word in ("hd-banner", "hd-go", "hd-drop", "Отправьте правки", "Сбросить"):
            self.assertNotIn(word, main + css, word)

    def test_goes_to_the_picked_session(self):
        main = self.src("main.js")
        body = main[main.index("async function autoSend()"):]
        body = body[:body.index("\n}\n")]
        self.assertIn('hub.post("/api/send", withLane({ session: to, text }', body)   # to = autoTo(file): picked by hand in the selector, else the author of the design - not the chat's session; the lane rides along
        self.assertIn("autoTo(file)", body)
        self.assertIn("comments: [], notes: [], errors: []", body)   # comments go by their own button, not by auto-send
        self.assertIn("flushWrite", body)   # the file write comes first: items go marked as already in the file

    def test_watches_every_paint(self):
        main = self.src("main.js")
        self.assertIn("auto.watch(autoSig(autoItems(), autoTo(laneFile([...autoItems().changes, ...autoItems().tweaks, ...autoItems().drawings])), home()))", main)

    def test_hand_edits_not_above_the_field(self):
        main = self.src("main.js")
        card = main[main.index("function paintCard()"):main.index("function paintComments()")]
        for word in ("draftChanges", "draftTweaks", "draftDrawings", "P.changes", "P.tweaks", "P.drawings"):
            self.assertNotIn(word, card, word)   # above the field only comments: pins, notes, design errors
        comments = main[main.index("function paintComments()"):main.index("function paintChat()")]
        for word in ("dropEdit.change", "dropEdit.tweak", "dropEdit.drawing"):
            self.assertIn(word, comments, word)   # the × of a hand edit lives in the Comments tab



class StyleLibrary(unittest.TestCase):
    """/__canvas/styles, /style, /style-preview, /style-md: only what the library index lists, only inside its folder; no folder - the feature is off."""
    ORIGIN = {"Origin": f"http://localhost:{server.WEB_PORT}"}

    @classmethod
    def setUpClass(cls):
        from test_styles import make_library
        cls.srv = server.serve(0)
        cls.port = cls.srv.server_address[1]
        server.PORT = cls.port
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.root = os.path.join(TMP, "styles")
        os.makedirs(cls.root)
        make_library(cls.root)
        with open(os.path.join(TMP, "outside", "secret.md"), "w") as f:
            f.write("# secret")

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self):
        patch = unittest.mock.patch.dict(os.environ, {"HUB_DESIGN_STYLES": self.root})
        patch.start()
        self.addCleanup(patch.stop)

    def get(self, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("GET", path, headers={"Host": f"localhost:{self.port}", **(headers or {})})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r, body

    def ask(self, path, headers=None):
        r, body = self.get(path, self.ORIGIN if headers is None else headers)
        return r, (json.loads(body) if r.getheader("Content-Type", "").startswith("application/json") else body)

    def test_list_search_and_categories(self):
        r, d = self.ask("/__canvas/styles?q=&cat=&offset=0&limit=2")
        self.assertEqual((r.status, d["ok"], d["count"], d["total"], [i["name"] for i in d["items"]]), (200, True, 3, 3, ["Marlin", "Night Owl"]))
        self.assertEqual([c["name"] for c in d["cats"]], ["Editorial", "Dark"])
        _, d = self.ask("/__canvas/styles?q=neon")
        self.assertEqual([i["id"] for i in d["items"]], ["b2"])
        _, d = self.ask("/__canvas/styles?limit=0")   # the probe of the page: is there a library
        self.assertEqual((d["ok"], d["items"], d["count"]), (True, [], 3))
        _, d = self.ask("/__canvas/styles?offset=junk&limit=junk")
        self.assertEqual(len(d["items"]), 3)
        for q in ("offset=inf&limit=1e400", "offset=nan", "offset=-5"):   # odd numbers fall back, the connection does not drop
            r, d = self.ask("/__canvas/styles?" + q)
            self.assertEqual((r.status, d["ok"]), (200, True), q)

    def test_the_style_segment_rides_the_same_route(self):
        _, d = self.ask("/__canvas/styles")   # a library with no labels: nothing to switch, the answer is as it was
        self.assertEqual((d["style"], d["segments"], d["count"], d["all"]), ("", [], 3, 3))
        tags = os.path.join(self.root, "tags.json")
        with open(tags, "w", encoding="utf-8") as f:
            json.dump({"a1": {"theme": "light", "style": ["editorial", "minimal"]}, "b2": {"theme": "dark", "style": ["neon"]}}, f)
        self.addCleanup(lambda: os.path.exists(tags) and os.unlink(tags))
        os.utime(tags, (time.time() + 5, time.time() + 5))   # the file is read again on a new stamp
        _, d = self.ask("/__canvas/styles?lang=ru")
        self.assertEqual((d["style"], [(x["k"], x["n"]) for x in d["segments"]], d["count"], d["all"], d["total"]), ("", [("editorial", 1), ("minimal", 1), ("neon", 1), ("_none", 1)], 3, 3, 3))
        self.assertEqual(d["segments"][0]["t"], "журнальный")
        _, d = self.ask("/__canvas/styles?style=neon")
        self.assertEqual((d["style"], d["count"], d["total"], [i["id"] for i in d["items"]]), ("neon", 1, 1, ["b2"]))
        _, d = self.ask("/__canvas/styles?style=_none")   # the style the tagger has not seen
        self.assertEqual((d["style"], d["total"], [i["id"] for i in d["items"]]), ("_none", 1, ["c3"]))
        _, d = self.ask("/__canvas/styles?style=nonsense")   # an unknown segment is all
        self.assertEqual((d["style"], d["total"]), ("", 3))

    def test_labels_filters_and_chips_ride_the_same_route(self):
        tags = os.path.join(self.root, "tags.json")
        with open(tags, "w", encoding="utf-8") as f:
            json.dump({"a1": {"theme": "light", "style": ["minimal"], "industry": ["media"]},
                       "b2": {"theme": "dark", "style": ["neon"], "mood": ["bold"]}}, f)
        self.addCleanup(os.remove, tags)
        _, d = self.ask("/__canvas/styles?q=dark")
        self.assertEqual([i["id"] for i in d["items"]], ["b2"])
        self.assertEqual([x["k"] for x in d["items"][0]["labels"]], ["dark", "neon", "bold"])
        _, d = self.ask("/__canvas/styles?theme=light&lang=ru")
        self.assertEqual([i["id"] for i in d["items"]], ["a1"])
        self.assertEqual(d["total"], 1)
        self.assertEqual([x["k"] for x in d["facets"]["theme"]], ["dark", "light"])   # chips stay on the whole library, the chosen one too
        self.assertNotEqual(d["items"][0]["labels"][0]["t"], "light")   # named in Russian
        _, d = self.ask("/__canvas/styles?theme=light&theme=dark&style=%00&mood=" + "x" * 5000)   # junk in a filter is no label: nothing breaks
        self.assertTrue(d["ok"])
        _, d = self.ask("/__canvas/style?id=a1&lang=ru")
        self.assertEqual([x["k"] for x in d["labels"]], ["light", "minimal", "media"])

    def test_a_huge_preview_is_not_served(self):
        import styles
        big = os.path.join(self.root, "previews", "marlin.png")
        with open(big, "rb") as f:
            keep = f.read()
        self.addCleanup(lambda: open(big, "wb").write(keep))
        with open(big, "wb") as f:
            f.write(b"\0" * (styles.PREVIEW_MAX + 1))
        r, _ = self.get("/__canvas/style-preview?id=a1")
        self.assertEqual(r.status, 404)

    def with_cover(self, name="previews/marlin.mp4", data=b"\x00\x00\x00\x18ftypmp42" + bytes(range(200))):
        """The first style gets a moving cover: a file and a line in the index; both go back after the test."""
        path = os.path.join(self.root, "index.json")
        with open(path, "rb") as f:
            keep = f.read()
        self.addCleanup(lambda: open(path, "wb").write(keep))
        index = json.loads(keep)
        index["a1"]["cover_video"] = name
        with open(path, "w", encoding="utf-8") as f:
            json.dump(index, f)
        real = os.path.join(self.root, name)
        with open(real, "wb") as f:
            f.write(data)
        self.addCleanup(os.remove, real)
        return data

    def test_a_moving_cover_is_served_with_ranges_and_only_from_the_index(self):
        data = self.with_cover()
        r, body = self.get("/__canvas/style-cover?id=a1")
        self.assertEqual((r.status, r.getheader("Content-Type"), body), (200, "video/mp4", data))
        r, body = self.get("/__canvas/style-cover?id=a1", {"Range": "bytes=10-19"})   # a <video> seeks
        self.assertEqual((r.status, body), (206, data[10:20]))
        r, _ = self.get("/__canvas/style-cover?id=b2")   # listed, but without a cover
        self.assertEqual(r.status, 404)
        _, d = self.ask("/__canvas/styles?q=marlin")
        self.assertEqual([(i["id"], i.get("cover")) for i in d["items"]], [("a1", True)])
        _, d = self.ask("/__canvas/styles?q=neon")
        self.assertNotIn("cover", d["items"][0])
        for bad in ("../index", "marlin__a1.md", "previews/marlin.mp4", os.path.join(self.root, "previews", "marlin.mp4"), ""):
            r, body = self.get(f"/__canvas/style-cover?id={bad}", self.ORIGIN)
            self.assertEqual(r.status, 404, bad)
        r, _ = self.get("/__canvas/style-cover?id=a1", {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status, 403)

    def test_a_huge_cover_and_a_cover_that_is_not_a_video_are_not_served(self):
        import styles
        from test_styles import png
        self.with_cover(data=b"\x00" * (styles.COVER_MAX + 1))
        r, _ = self.get("/__canvas/style-cover?id=a1")
        self.assertEqual(r.status, 404)
        self.with_cover(name="previews/other.png", data=png())   # a picture is no cover: the entry drops it
        r, _ = self.get("/__canvas/style-cover?id=a1")
        self.assertEqual(r.status, 404)

    def test_the_data_answers_only_to_the_hub_page(self):
        r, _ = self.ask("/__canvas/styles", headers={})
        self.assertEqual(r.status, 403)
        r, _ = self.ask("/__canvas/styles", headers={"Origin": "https://evil.example"})
        self.assertEqual(r.status, 403)
        r, _ = self.ask("/__canvas/style?id=a1", headers={"Origin": "https://evil.example"})
        self.assertEqual(r.status, 403)
        r, _ = self.ask("/__canvas/styles", headers={**self.ORIGIN, "Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status, 403)
        r, _ = self.get("/__canvas/style-preview?id=a1", {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status, 403)   # a picture embedded by a foreign site is refused as well
        r, _ = self.get("/__canvas/style-md?id=a1", {"Host": "evil.example"})
        self.assertEqual(r.status, 403)

    def test_card_has_the_path_to_hand_to_the_designer(self):
        r, d = self.ask("/__canvas/style?id=a1")
        self.assertEqual(r.status, 200)
        self.assertEqual(d["path"], os.path.join(os.path.realpath(self.root), "marlin__a1.md"))
        self.assertEqual(d["fonts"], ["Space Grotesk", "Inter"])
        self.assertEqual(d["palette"][0]["hex"], "#0b3c5d")
        r, _ = self.ask("/__canvas/style?id=nope")
        self.assertEqual(r.status, 404)

    def test_preview_and_file_come_from_the_index_only(self):
        r, body = self.get("/__canvas/style-preview?id=a1")
        self.assertEqual((r.status, r.getheader("Content-Type")), (200, "image/png"))
        self.assertTrue(body.startswith(b"\x89PNG"))
        self.assertIn("max-age", r.getheader("Cache-Control"))
        r, _ = self.get("/__canvas/style-preview?id=b2")   # listed, but without a picture
        self.assertEqual(r.status, 404)
        r, body = self.get("/__canvas/style-md?id=a1")
        self.assertEqual((r.status, r.getheader("Content-Type")), (200, "text/plain; charset=utf-8"))
        self.assertIn(b"Marlin", body)
        for bad in ("../index", "..%2Findex", "index.json", "marlin__a1.md", "previews/marlin.png", os.path.join(TMP, "outside", "secret.md"), ""):
            for route in ("style-md", "style-preview", "style"):
                r, body = self.get(f"/__canvas/{route}?id={bad}", self.ORIGIN)
                self.assertEqual(r.status, 404, (route, bad))
                self.assertNotIn(b"secret", body)

    def test_no_folder_no_feature(self):
        with unittest.mock.patch.dict(os.environ, {"HUB_DESIGN_STYLES": os.path.join(TMP, "none")}):
            r, d = self.ask("/__canvas/styles")
            self.assertEqual((r.status, d), (200, {"ok": False}))
            for route in ("style?id=a1", "style-preview?id=a1", "style-md?id=a1"):
                r, _ = self.get("/__canvas/" + route, self.ORIGIN)
                self.assertEqual(r.status, 404, route)

    def test_the_folder_comes_from_hub_json_when_the_environment_is_not_set(self):
        cfg = os.environ["HUB_CONFIG"]
        with open(cfg, encoding="utf-8") as f:
            old = f.read()
        try:
            with open(cfg, "w", encoding="utf-8") as f:
                json.dump({"extensions": {"someone:hub-design": {"styles_dir": self.root}}}, f)
            with unittest.mock.patch.dict(os.environ):
                del os.environ["HUB_DESIGN_STYLES"]
                _, d = self.ask("/__canvas/styles?limit=0")
            self.assertEqual((d["ok"], d["count"]), (True, 3))
        finally:
            with open(cfg, "w", encoding="utf-8") as f:
                f.write(old)

    # --- the default style (hub.json default_style, here HUB_DESIGN_DEFAULT_STYLE): a library of one DESIGN.md, listed on its own, outside the main folder
    def with_default(self):
        from test_styles import png
        self.dir = os.path.join(TMP, "default-style")
        os.makedirs(self.dir, exist_ok=True)
        with open(os.path.join(self.dir, "DESIGN.md"), "w", encoding="utf-8") as f:
            f.write("# Inkwell\n> A made-up house style.\n\n## Colors\n| Ink | #112233 | Primary |\n")
        with open(os.path.join(self.dir, "preview.png"), "wb") as f:
            f.write(png())
        patch = unittest.mock.patch.dict(os.environ, {"HUB_DESIGN_DEFAULT_STYLE": self.dir})
        patch.start()
        self.addCleanup(patch.stop)

    def test_the_probe_carries_the_default_with_the_path_of_its_file(self):
        self.with_default()
        _, d = self.ask("/__canvas/styles?limit=0&lang=en")
        want = os.path.join(os.path.realpath(self.dir), "DESIGN.md")
        self.assertEqual((d["ok"], d["count"]), (True, 3))
        self.assertEqual({k: d["default"][k] for k in ("id", "name", "preview", "path")}, {"id": "__default", "name": "Inkwell", "preview": True, "path": want})
        _, d = self.ask("/__canvas/styles?q=neon")
        self.assertEqual([i["id"] for i in d["items"]], ["b2"])   # the default is not among the results: the page puts it first itself

    def test_the_default_has_a_card_a_picture_and_a_file_like_any_style(self):
        self.with_default()
        r, d = self.ask("/__canvas/style?id=__default")
        self.assertEqual((r.status, d["name"], d["palette"][0]["hex"], d["tagline"]), (200, "Inkwell", "#112233", "A made-up house style."))
        self.assertEqual(d["path"], os.path.join(os.path.realpath(self.dir), "DESIGN.md"))
        r, body = self.get("/__canvas/style-preview?id=__default")
        self.assertEqual((r.status, r.getheader("Content-Type")), (200, "image/png"))
        r, body = self.get("/__canvas/style-md?id=__default")
        self.assertEqual(r.status, 200)
        self.assertIn(b"Inkwell", body)
        r, _ = self.ask("/__canvas/style?id=a1")   # the main library is as before
        self.assertEqual(r.status, 200)

    def test_without_the_option_nothing_changes(self):
        self.with_default()
        with unittest.mock.patch.dict(os.environ):
            del os.environ["HUB_DESIGN_DEFAULT_STYLE"]
            _, d = self.ask("/__canvas/styles?limit=0")
            self.assertNotIn("default", d)
            r, _ = self.ask("/__canvas/style?id=__default")
            self.assertEqual(r.status, 404)

    def test_a_folder_without_design_md_is_no_default(self):
        self.with_default()
        os.remove(os.path.join(self.dir, "DESIGN.md"))
        _, d = self.ask("/__canvas/styles?limit=0")
        self.assertNotIn("default", d)

    def test_the_default_alone_makes_the_feature_available(self):
        self.with_default()
        with unittest.mock.patch.dict(os.environ, {"HUB_DESIGN_STYLES": os.path.join(TMP, "none")}):
            _, d = self.ask("/__canvas/styles?offset=0&limit=24")
            self.assertEqual((d["ok"], d["items"], d["total"], d["default"]["name"]), (True, [], 0, "Inkwell"))
            r, d = self.ask("/__canvas/style?id=__default")
            self.assertEqual((r.status, d["name"]), (200, "Inkwell"))
            r, _ = self.ask("/__canvas/style?id=a1")
            self.assertEqual(r.status, 404)

    def test_the_option_comes_from_hub_json_and_only_the_hub_design_entry_counts(self):
        self.with_default()
        cfg = os.environ["HUB_CONFIG"]
        with open(cfg, encoding="utf-8") as f:
            old = f.read()
        try:
            with open(cfg, "w", encoding="utf-8") as f:
                json.dump({"extensions": {"someone:hub-design": {"default_style": self.dir}}}, f)
            with unittest.mock.patch.dict(os.environ):
                del os.environ["HUB_DESIGN_DEFAULT_STYLE"]
                _, d = self.ask("/__canvas/styles?limit=0")
                self.assertEqual(d["default"]["name"], "Inkwell")
                real = os.path.join(TMP, "outside")   # a folder without DESIGN.md is no default
                self.assertIsNone(server.styles.default_library({"extensions": {"x:hub-design": {"default_style": real}}}))
                self.assertIsNone(server.styles.default_library({"extensions": {"x:other": {"default_style": self.dir}}}))
        finally:
            with open(cfg, "w", encoding="utf-8") as f:
                f.write(old)


class DesignRegistry(unittest.TestCase):
    """/__canvas/registry: the designs ever made, with the state of each file; their folders are served though no session works there any more."""
    ORIGIN = {"Origin": f"http://localhost:{server.WEB_PORT}"}

    @classmethod
    def setUpClass(cls):
        import registry
        cls.registry = registry
        cls.srv = server.serve(0)
        cls.port = cls.srv.server_address[1]
        server.PORT = cls.port
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.old = os.path.join(TMP, "old-project", "design", "v1")   # no session, no project of hub.json
        os.makedirs(cls.old)
        with open(os.path.join(cls.old, "a.html"), "w") as f:
            f.write("<p>an old design</p>")
        with open(os.path.join(cls.old, "style.css"), "w") as f:
            f.write("p{color:red}")

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self):
        self.reg = self.registry.Registry(os.path.join(TMP, "reg-state"))
        self.reg.ready = True
        patch = unittest.mock.patch.object(server, "REG", self.reg)
        patch.start()
        self.addCleanup(patch.stop)
        server._roots["at"] = 0
        self.addCleanup(server._roots.update, at=0)

    def put(self, path, session="designer"):
        self.reg.items[self.registry.key_of(path)] = {"path": path, "session": session, "ts": 5, "last": 7, "rank": 2}

    def get(self, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        c.request("GET", path, headers={"Host": f"localhost:{self.port}", **(headers or {})})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r, body

    def test_a_design_outside_the_folders_is_denied_until_the_registry_knows_it(self):
        path = os.path.join(os.path.realpath(self.old), "a.html")
        self.assertEqual(server.file_state(path), "denied")   # no session works in that folder any more
        self.put(path)
        server._roots["at"] = 0
        self.assertEqual(server.file_state(path), "ok")
        r, body = self.get(furl(os.path.join(os.path.realpath(self.old), "style.css")))   # the styles beside the design come too
        self.assertEqual((r.status, body), (200, b"p{color:red}"))

    def test_a_wide_folder_is_not_opened_by_a_design_lying_in_it(self):
        loose = os.path.join(os.path.expanduser("~"), "loose-design-for-test.html")
        self.put(loose)
        self.assertNotIn(os.path.realpath(os.path.expanduser("~")), server.roots())

    def test_the_answer_lists_every_design_with_the_state_of_its_file_for_the_hub_page(self):
        here = os.path.join(os.path.realpath(self.old), "a.html")
        self.put(here)
        self.put(os.path.join(os.path.realpath(self.old), "gone.html"), "x1")
        r, body = self.get("/__canvas/registry", self.ORIGIN)
        self.assertEqual(r.status, 200)
        self.assertEqual(r.getheader("Access-Control-Allow-Origin"), self.ORIGIN["Origin"])
        d = json.loads(body)
        self.assertTrue(d["ready"])
        got = {os.path.basename(x["path"]): x for x in d["items"]}
        self.assertEqual((got["a.html"]["state"], got["gone.html"]["state"]), ("ok", "missing"))
        self.assertEqual((got["gone.html"]["session"], got["gone.html"]["last"]), ("x1", 7))
        r, _ = self.get("/__canvas/registry", {"Origin": "http://evil.example"})
        self.assertIsNone(r.getheader("Access-Control-Allow-Origin"))
        r, _ = self.get("/__canvas/registry", {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(r.status, 403)

    def test_the_answer_gives_the_name_of_a_design_for_its_label_title_first_then_the_first_headline(self):
        d = os.path.realpath(self.old)
        for name, text in [("t.html", "<title> Black Friday post 01,\n 50% off </title><h1>x</h1>"), ("h.html", "<p>x</p><h1 class=a>Email <b>1</b> &amp; Kyoto</h1>"), ("n.html", "<p>none</p>")]:
            with open(os.path.join(d, name), "w", encoding="utf-8") as f:
                f.write(text)
            self.put(os.path.join(d, name))
        self.put(os.path.join(d, "style.css"))
        self.put(os.path.join(d, "gone.html"))
        _, body = self.get("/__canvas/registry", self.ORIGIN)
        got = {os.path.basename(x["path"]): x for x in json.loads(body)["items"]}
        self.assertEqual(got["t.html"]["title"], "Black Friday post 01, 50% off")
        self.assertEqual(got["h.html"]["title"], "Email 1 & Kyoto")
        self.assertEqual(got["n.html"]["title"], "")
        self.assertNotIn("title", got["style.css"])   # only html has one
        self.assertNotIn("title", got["gone.html"])   # a missing file is not read
        self.assertEqual(server.peer_title(os.path.join(d, "h.html")), "Email 1 & Kyoto")   # the other machines get the same name

    def test_the_answer_names_the_tasks_of_the_designs_and_the_other_machines_get_the_title_as_the_folder(self):
        here, other = os.path.join(os.path.realpath(self.old), "a.html"), os.path.join(os.path.realpath(self.old), "b.html")
        for path in (here, other):
            self.put(path)
            self.reg.items[self.registry.key_of(path)]["task"] = "d10"
        self.put(os.path.join(os.path.realpath(self.old), "lone.html"))
        self.reg.items[self.registry.key_of(os.path.join(os.path.realpath(self.old), "lone.html"))]["task"] = "d11"
        self.reg.state["tasks"] = {"d10": {"title": "Ролик Ouch", "by": "rewarded", "who": "designer", "ts": 1, "root": "d10"},
                                   "d11": {"title": "Один", "by": "x", "who": "designer", "ts": 2, "root": "d11"}}
        for n in ("lone.html", "b.html"):
            with open(os.path.join(os.path.realpath(self.old), n), "w") as f:
                f.write("<p>x</p>")
        _, body = self.get("/__canvas/registry", self.ORIGIN)
        d = json.loads(body)
        self.assertEqual([t["id"] for t in d["tasks"]], ["d10", "d11"])
        self.assertEqual({os.path.basename(x["path"]): x.get("task") for x in d["items"]}, {"a.html": "d10", "b.html": "d10", "lone.html": "d11"})
        with unittest.mock.patch.object(server, "peer_dirs", return_value=[]):
            rows = {os.path.basename(r["path"]): r["dir"] for r in server.peer_rows()}
        self.assertEqual(rows, {"a.html": "Ролик Ouch", "b.html": "Ролик Ouch", "lone.html": ""})   # one design makes no folder
        # the lone one was asked for by a direction ("x"): it goes to the folder of that direction, not to "no direction" (hd-sort)
        with unittest.mock.patch.object(server, "peer_dirs", return_value=[]), unittest.mock.patch.object(server, "peer_homes", return_value={"x": "icons8-smm"}):
            rows = {os.path.basename(r["path"]): r["dir"] for r in server.peer_rows()}
        self.assertEqual(rows["lone.html"], "icons8-smm")

    def test_a_design_of_a_folder_no_direction_owns_goes_to_the_task_folder_named_for_it_on_the_other_machine_too(self):
        base = os.path.realpath(self.old)
        for n in ("a.html", "b.html"):
            self.put(os.path.join(base, n))
            self.reg.items[self.registry.key_of(os.path.join(base, n))]["task"] = "d10"
            with open(os.path.join(base, n), "w") as f:
                f.write("<p>x</p>")
        folder = os.path.join(base, "design", "ouch-templates")
        os.makedirs(folder)
        loose = os.path.join(folder, "c.html")
        with open(loose, "w") as f:
            f.write("<p>x</p>")
        self.put(loose)
        self.reg.state["tasks"] = {"d10": {"title": "Rewarded-ads Ouch, beat 8", "by": "rewarded", "who": "designer", "ts": 1, "root": "d10"}}
        with unittest.mock.patch.object(server, "peer_dirs", return_value=[]):
            rows = {os.path.basename(r["path"]): r["dir"] for r in server.peer_rows()}
        self.assertEqual(rows["c.html"], "Rewarded-ads Ouch, beat 8")

    def test_no_registry_means_an_empty_not_ready_list(self):
        with unittest.mock.patch.object(server, "REG", None):
            _, body = self.get("/__canvas/registry", self.ORIGIN)
        self.assertEqual(json.loads(body), {"ready": False, "items": [], "tasks": []})


class Prewarm(unittest.TestCase):
    def setUp(self):
        patch = unittest.mock.patch.object(server, "allowed", lambda real: os.path.exists(real))
        patch.start()
        self.addCleanup(patch.stop)

    def test_only_the_cards_without_a_shot_are_shot_newest_first(self):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        paths = []
        for n in ("a", "b", "c"):
            p = os.path.join(d, n + ".html")
            open(p, "w").write("<p>" + n)
            paths.append(os.path.realpath(p))
        rows = [{"path": p} for p in paths] + [{"path": os.path.join(d, "gone.html")}, {"path": os.path.join(d, "x.txt")}]
        shot = []
        made = server.prewarm(rows, have=lambda real: real == paths[1], shoot=lambda real: shot.append(real) or b"png")
        self.assertEqual(shot, [paths[0], paths[2]])   # the order of the listing; the one with a shot, the missing file and a non-design are skipped
        self.assertEqual(made, 2)

    def test_no_chrome_stops_the_pass_and_a_failure_goes_on(self):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        paths = []
        for n in ("a", "b"):
            p = os.path.join(d, n + ".html")
            open(p, "w").write("x")
            paths.append(os.path.realpath(p))
        calls = []
        def shoot(real):
            calls.append(real)
            if len(calls) == 1:
                raise server.PdfError("boom")
        self.assertEqual(server.prewarm([{"path": p} for p in paths], have=lambda r: False, shoot=shoot), 0)
        self.assertEqual(calls, paths)
