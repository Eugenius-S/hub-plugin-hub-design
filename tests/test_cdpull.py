"""cdpull.py: pull a Claude Design project through a fake MCP (no network). The projects and files are made up."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import cdpull  # noqa: E402

A = "11111111-1111-4111-8111-111111111111"
B = "22222222-2222-4222-8222-222222222222"
PROJECTS = [{"id": A, "name": "Promo board 2", "url": "https://claude.ai/design/p/" + A},
            {"id": B, "name": "Promo board 3", "url": "https://claude.ai/design/p/" + B}]
HTML = "<!doctype html><html><body><p>a &amp; b</p>\n<script>if (1 < 2) go()</script>\n</body></html>\n"


def wrap(text, first=1, total=None):
    """What read_file answers: the lines escaped inside <untrusted-project-content>."""
    lines = text.splitlines(True)
    total = total or len(lines)
    esc = "".join(lines).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return '<untrusted-project-content lines="%d-%d" total_lines="%d" path="x">\n%s</untrusted-project-content>' % (first, first + len(lines) - 1, total, esc)


class Fake:
    """A stand-in for cdpull.Client: the tools of the Claude Design MCP over a dict of files."""
    def __init__(self, files, page=40):
        self.files, self.page, self.calls = files, page, []

    def call(self, name, args):
        self.calls.append((name, dict(args)))
        if name == "list_projects":
            return json.dumps(PROJECTS)
        if name == "list_files":
            return json.dumps([{"path": p, "size": len(b)} for p, b in self.files.items()])
        if name == "read_file":
            lines = self.files[args["path"]].decode().splitlines(True)
            off = args["offset"]
            part = lines[off - 1: off - 1 + min(args["limit"], self.page)]
            return wrap("".join(part), off, len(lines))
        if name == "render_preview":
            return json.dumps({"serve_url": "https://serve.example.test/s/abc/" + args["path"] + "?t=1"})
        raise AssertionError(name)


class Opener:
    """The serve_url host: the exact bytes of the non-html files."""
    def __init__(self, files):
        self.files = files

    def open(self, req, timeout=0):
        path = cdpull.urllib.parse.unquote(req.full_url.split("/s/abc/", 1)[1].split("?")[0])
        data = self.files[path]

        class R:
            def read(self_):
                return data
        return R()


def files():
    return {"index.html": HTML.encode(), "assets/a.css": b"p{color:red}", "assets/logo.bin": bytes(range(256))}


class Find(unittest.TestCase):
    def test_link_and_id(self):
        self.assertEqual(cdpull.find_project("https://claude.ai/design/p/" + B + "?x=1", PROJECTS)["name"], "Promo board 3")
        self.assertEqual(cdpull.find_project(A.upper(), PROJECTS)["id"], A)

    def test_name_exact_and_part(self):
        self.assertEqual(cdpull.find_project("promo BOARD 2", PROJECTS)["id"], A)
        self.assertEqual(cdpull.find_project("board3", PROJECTS)["id"], B)

    def test_several_names_fail_with_a_list(self):
        with self.assertRaises(cdpull.Fail) as e:
            cdpull.find_project("promo", PROJECTS)
        self.assertEqual(e.exception.code, 2)
        self.assertIn("Promo board 2", str(e.exception))
        self.assertIn("Promo board 3", str(e.exception))

    def test_no_name_fails(self):
        with self.assertRaises(cdpull.Fail) as e:
            cdpull.find_project("nothing here", PROJECTS)
        self.assertEqual(e.exception.code, 2)


class Pull(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def run_pull(self, fs, ref="Promo board 2", page=40):
        fake = Fake(fs, page)
        with mock.patch.object(cdpull.urllib.request, "build_opener", return_value=Opener(fs)):
            return fake, cdpull.run(ref, self.tmp.name, "http://localhost:8787/", client=fake)

    def test_files_are_exact_and_link_opens_the_entry(self):
        fs = files()
        fake, (dst, entry, lnk, reused, approx) = self.run_pull(fs)
        self.assertFalse(reused)
        self.assertEqual(approx, [])
        self.assertTrue(dst.startswith(os.path.join(self.tmp.name, "promo-board-2", "claude-design")))
        for rel, data in fs.items():
            with open(os.path.join(dst, rel), "rb") as f:
                self.assertEqual(f.read(), data, rel)
        self.assertEqual(entry, os.path.join(dst, "index.html"))
        self.assertTrue(lnk.startswith("http://localhost:8787/#/x/hub-design?open=%2F"))
        self.assertEqual(cdpull.urllib.parse.unquote(lnk.split("open=")[1]), entry)
        self.assertNotIn("/design/p/", lnk)

    def test_html_through_read_file_in_pages_others_through_url(self):
        fs = files()
        fs["index.html"] = ("<p>line</p>\n" * 100).encode()
        fake, _ = self.run_pull(fs, page=30)
        reads = [a for n, a in fake.calls if n == "read_file"]
        self.assertEqual([a["path"] for a in reads], ["index.html"] * 4)
        self.assertEqual([a["offset"] for a in reads], [1, 31, 61, 91])
        self.assertEqual(sum(1 for n, _ in fake.calls if n == "render_preview"), 1)

    def test_second_pull_unchanged_reuses_changed_goes_beside(self):
        fs = files()
        _, (d1, _, _, r1, _) = self.run_pull(fs)
        _, (d2, _, _, r2, _) = self.run_pull(fs)
        self.assertEqual((r1, r2, d1), (False, True, d2))
        fs["assets/a.css"] = b"p{color:blue}"
        with mock.patch.object(cdpull.time, "strftime", return_value="29990101-000000"):
            _, (d3, _, _, r3, _) = self.run_pull(fs)
        self.assertFalse(r3)
        self.assertNotEqual(d3, d1)
        with open(os.path.join(d1, "assets/a.css"), "rb") as f:
            self.assertEqual(f.read(), b"p{color:red}")   # the previous version is untouched
        left = os.listdir(os.path.dirname(d1))
        self.assertEqual(sorted(left), sorted([os.path.basename(d1), os.path.basename(d3)]))   # no temp folder left

    def test_unsafe_path_is_refused(self):
        with self.assertRaises(cdpull.Fail):
            self.run_pull({"../evil.html": b"x"})
        self.assertEqual(os.listdir(os.path.join(self.tmp.name, "promo-board-2", "claude-design")), [])

    def test_ambiguous_name_writes_nothing(self):
        with self.assertRaises(cdpull.Fail):
            self.run_pull(files(), ref="promo")
        self.assertEqual(os.listdir(self.tmp.name), [])


class Token(unittest.TestCase):
    def creds(self, exp):
        return json.dumps({"designOauth": {"accessToken": "SECRET-T", "expiresAt": exp}, "claudeAiOauth": {"accessToken": "other"}})

    def test_valid(self):
        with mock.patch.object(cdpull, "_creds_from_keychain", return_value=self.creds(4102444800000)):
            self.assertEqual(cdpull.token(), "SECRET-T")

    def test_expired_says_how_to_sign_in_and_never_the_token(self):
        with mock.patch.object(cdpull, "_creds_from_keychain", return_value=self.creds(1000)):
            with self.assertRaises(cdpull.Fail) as e:
                cdpull.token()
        self.assertEqual(e.exception.code, 3)
        self.assertIn("design-login", str(e.exception))
        self.assertNotIn("SECRET-T", str(e.exception))

    def test_file_when_no_keychain_and_none_at_all(self):
        with mock.patch.object(cdpull, "_creds_from_keychain", return_value=None), mock.patch.object(cdpull, "_creds_from_file", return_value=self.creds(4102444800000)):
            self.assertEqual(cdpull.token(), "SECRET-T")
        with mock.patch.object(cdpull, "_creds_from_keychain", return_value=None), mock.patch.object(cdpull, "_creds_from_file", return_value=json.dumps({"claudeAiOauth": {}})):
            with self.assertRaises(cdpull.Fail) as e:
                cdpull.token()
        self.assertEqual(e.exception.code, 3)


if __name__ == "__main__":
    unittest.main()
