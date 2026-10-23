"""The github source (sources/github.py) against a made-up clone on disk: the clone folder is laid where the source looks for it (the source uses a clone that
is already there), so nothing is downloaded. Only the repositories that have a reader are taken; any other is refused with a word."""
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="hd-github-test-")
sys.path.insert(0, HERE)
import fetcher  # noqa: E402
import links  # noqa: E402
import sources  # noqa: E402
from sources import github  # noqa: E402

IOS = "https://github.com/Meliwat/awesome-ios-design-md"


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


class Case(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="lib-", dir=TMP)
        self.src = github.GitHub()
        self.src.bind(self.root)
        clone = os.path.join(self.root, "sets", "Meliwat__awesome-ios-design-md")
        os.makedirs(os.path.join(clone, ".git"))
        for cat, app in (("Finance", "Wallet"), ("Travel", "Trips")):
            write(os.path.join(clone, "design-md", cat, app, "DESIGN.md"), f"# Design System Inspired by {app} (iOS)\n\nA calm app that shows your {cat.lower()} in one place, without noise.\n")
        self.clone = clone

    def run_fetch(self, url=IOS):
        f = fetcher.Fetcher(lambda: self.root, [self.src], gap=(0, 0), sleep=lambda s: None)
        ok, code, _ = f.start([url])
        self.assertTrue(ok, code)
        f.join(20)
        return f.status()

    def index(self):
        with open(os.path.join(self.root, "index.json"), encoding="utf-8") as f:
            return json.load(f)


class Repo(unittest.TestCase):
    def test_a_link_to_a_repository_in_any_form(self):
        for u in ("https://github.com/Meliwat/awesome-ios-design-md", "github.com/Meliwat/awesome-ios-design-md/", "https://www.github.com/Meliwat/awesome-ios-design-md.git",
                  "https://github.com/Meliwat/awesome-ios-design-md/tree/main/design-md"):
            self.assertEqual(github.repo_of(u), "Meliwat/awesome-ios-design-md", u)
        for u in ("https://github.com/Meliwat", "https://gitlab.com/a/b", "https://github.com/", "https://github.com/a b/c"):
            self.assertIsNone(github.repo_of(u), u)

    def test_the_canon_is_the_repository_in_lower_case(self):
        self.assertEqual(github.GitHub().canon("https://github.com/Meliwat/Awesome-iOS-Design-MD/tree/main"), "https://github.com/meliwat/awesome-ios-design-md")
        self.assertEqual(fetcher.canon("github.com/Meliwat/awesome-ios-design-md/"), "https://github.com/meliwat/awesome-ios-design-md")

    def test_the_source_is_found_by_the_host(self):
        self.assertIsInstance(sources.for_url(IOS), github.GitHub)

    def test_every_default_link_has_a_reader(self):
        import linkctl
        for u in linkctl.DEFAULTS[1:]:
            self.assertIsNotNone(github.set_of(github.repo_of(u)), u)
        self.assertIsInstance(sources.for_url(linkctl.DEFAULTS[0]), sources.Refero)


class Plan(Case):
    def test_the_clone_that_is_there_is_read_into_styles(self):
        refs = self.src.plan(IOS, None)
        self.assertEqual(sorted(r["id"] for r in refs), ["ios-design-md:trips", "ios-design-md:wallet"])
        e = next(r for r in refs if r["id"].endswith("wallet"))["record"]
        self.assertEqual(e["file"], "ios-design-md--wallet.md")
        self.assertEqual((e["entry"]["set"], e["entry"]["source"], e["entry"]["license"], e["entry"]["name"]), ("ios-design-md", "Meliwat/awesome-ios-design-md", "MIT", "Wallet"))

    def test_without_a_library_folder_nothing_is_cloned(self):
        with self.assertRaises(sources.SourceError) as c:
            github.GitHub().plan(IOS, None)
        self.assertEqual(c.exception.code, "clone_failed")

    def test_another_repository_is_refused_with_its_name(self):
        with self.assertRaises(sources.SourceError) as c:
            self.src.plan("https://github.com/someone/else", None)
        self.assertEqual((c.exception.code, c.exception.args_["repo"]), ("github_unknown", "someone/else"))
        with self.assertRaises(sources.SourceError) as c:
            self.src.plan("https://github.com/someone", None)
        self.assertEqual(c.exception.code, "github_repo")

    def test_a_layout_the_reader_does_not_know_is_a_word_not_a_crash(self):
        shutil.rmtree(os.path.join(self.clone, "design-md"))
        with self.assertRaises(sources.SourceError) as c:
            self.src.plan(IOS, None)
        self.assertEqual(c.exception.code, "github_layout")


class Fetch(Case):
    def test_the_styles_come_into_the_library_with_the_link_they_came_by(self):
        st = self.run_fetch()
        self.assertEqual((st["state"], st["added"], st["failed"]), ("done", 2, 0))
        idx = self.index()
        self.assertEqual(sorted(idx), ["ios-design-md:trips", "ios-design-md:wallet"])
        e = idx["ios-design-md:wallet"]
        self.assertEqual((e["source_urls"], e["set"], e["file"]), (["https://github.com/meliwat/awesome-ios-design-md"], "ios-design-md", "ios-design-md--wallet.md"))
        self.assertTrue(os.path.isfile(os.path.join(self.root, e["file"])))
        self.assertEqual(e["preview"], "")   # no picture in the repository: the style stays without one

    def test_the_second_run_adds_nothing(self):
        self.run_fetch()
        st = self.run_fetch()
        self.assertEqual((st["added"], st["skipped"]), (0, 2))

    def test_a_refused_repository_stops_with_its_word(self):
        st = self.run_fetch("https://github.com/someone/else")
        self.assertEqual((st["state"], st["code"]), ("error", "github_unknown"))
        self.assertEqual(st["args"]["repo"], "someone/else")

    def test_deleting_the_link_takes_the_styles_the_clone_and_the_previews_of_the_set(self):
        self.run_fetch()
        write(os.path.join(self.root, "previews", "sets", "ios-design-md", "wallet.png"), "png")
        link = "https://github.com/meliwat/awesome-ios-design-md"
        self.assertEqual(links.delete(self.root, link), {"n": 2, "kept": 0})
        self.assertEqual(self.index(), {})
        self.assertFalse(os.path.exists(self.clone))
        self.assertFalse(os.path.exists(os.path.join(self.root, "previews", "sets", "ios-design-md")))
        self.assertEqual([n for n in os.listdir(self.root) if n.endswith(".md")], [])


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
