"""The style sources (sources/): what a link means and how a style page is read. Every page here is made up for the test."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import sources  # noqa: E402
from sources.refero import Refero, SourceError  # noqa: E402

A = "11111111-1111-4111-8111-111111111111"
B = "22222222-2222-4222-8222-222222222222"
C = "33333333-3333-4333-8333-333333333333"
HOST = "styles.example.test"
IMG = "images.example.test"

BODY = "# Marlin - design system\n\n> Calm blue-grey surfaces with one coral accent.\n\n**Theme:** light\n\n## Colors\n\n| Name | Value | Role |\n|---|---|---|\n" \
       + "".join(f"| Shade {i} | #0B3C{i:02X} | Surface {i} |\n" for i in range(40)) + "\n## Typography\n\n### Space Grotesk - headings\n"


def page(md=BODY, h1="Marlin", og=f"https://{IMG}/p/a.jpg", extra=""):
    esc = md.replace("&", "&amp;").replace("<", "&lt;")
    return f"""<!doctype html><html><head><title>Marlin design system - Refero</title>
<meta name="description" content="A calm style">
<meta name="category" content="SaaS">
<meta property="og:image" content="{og}">
<meta property="article:tag" content="calm"><meta property="article:tag" content="blue">
</head><body><nav><a href="https://other.example/nav">nav</a></nav><main><h1>{h1}</h1>
<a href="https://marlin.example/home">Visit</a><a href="https://second.example/">second</a>
<pre><code>short</code></pre><pre><code>{esc}</code></pre>{extra}</main></body></html>"""


def src():
    return Refero(hosts=(HOST,), image_hosts=(IMG,))


class Parse(unittest.TestCase):
    def test_reads_the_file_and_the_facts_of_the_page(self):
        s = src().parse(page(), {"id": A, "url": f"https://{HOST}/style/{A}", "lastmod": "2026-01-02"})
        self.assertEqual((s["id"], s["name"], s["category"], s["lastmod"]), (A, "Marlin", "SaaS", "2026-01-02"))
        self.assertEqual(s["tags"], ["calm", "blue"])
        self.assertEqual(s["site"], "https://marlin.example/home")   # the first link out of <main>, not of the nav
        self.assertEqual(s["image_url"], f"https://{IMG}/p/a.jpg")
        self.assertEqual(s["description"], "A calm style")
        self.assertTrue(s["md"].startswith("# Marlin - design system\n"))
        self.assertIn("| Shade 3 | #0B3C03 | Surface 3 |", s["md"])   # entities are decoded back
        self.assertTrue(s["md"].endswith("\n") and not s["md"].endswith("\n\n"))

    def test_takes_the_longest_pre_that_is_a_style_file(self):
        s = src().parse(page(extra="<pre>" + "# not a style\n" * 3 + "</pre>"), {"id": A})
        self.assertIn("Shade 39", s["md"])

    def test_the_name_falls_back_to_the_title(self):
        s = src().parse(page(h1=""), {"id": A})
        self.assertEqual(s["name"], "Marlin")

    def test_a_picture_only_from_the_picture_host(self):
        s = src().parse(page(og="https://evil.example/x.png"), {"id": A, "image": f"https://{IMG}/sm.png"})
        self.assertEqual(s["image_url"], f"https://{IMG}/sm.png")   # the sitemap's one, the page's is foreign
        s = src().parse(page(og="https://evil.example/x.png"), {"id": A})
        self.assertEqual(s["image_url"], "")

    def test_a_page_without_a_style_file_is_bad(self):
        for html in ("<html><body><main><h1>x</h1></main></body></html>", page(md="# tiny\n"), page(md="no heading " * 300), ""):
            with self.assertRaises(SourceError) as e:
                src().parse(html, {"id": A})
            self.assertEqual(e.exception.code, "bad_page")


class Links(unittest.TestCase):
    def test_only_its_own_site(self):
        s = src()
        self.assertTrue(s.matches(f"https://{HOST}/style/{A}"))
        self.assertTrue(s.matches(f"https://{HOST.upper()}/"))
        for bad in (f"https://{HOST}.evil.example/", f"https://evil.example/{HOST}", f"https://evil.{HOST}/", "", "not a link", f"https://{IMG}/a.png", f"ftp://{HOST}/"):
            self.assertFalse(s.matches(bad), bad)

    def test_the_top_link_in_any_form_is_the_whole_site(self):
        xml = f"<urlset><url><loc>https://{HOST}/style/{A}</loc></url><url><loc>https://{HOST}/style/{B}</loc></url></urlset>"
        forms = (f"https://{HOST}/", f"https://{HOST}", f"http://{HOST}/", f"https://www.{HOST}/", f"HTTPS://{HOST.upper()}", f"https://{HOST}/?q=x",
                 f"https://{HOST}/#top", f"https://{HOST}/sitemap.xml")
        for url in forms:
            with self.subTest(url=url):
                self.assertTrue(src().matches(url))
                asked = []
                got = src().plan(url, lambda u: asked.append(u) or xml)
                self.assertEqual([r["id"] for r in got], [A, B])
                self.assertEqual(asked, [f"https://{HOST}/sitemap.xml"])   # always the canonical address, never the pasted form

    def test_a_section_is_the_collections_under_it_and_an_index_page_is_all_of_them(self):
        coll = f"<urlset><url><loc>https://{HOST}/design-styles/dark</loc></url><url><loc>https://{HOST}/design-styles/clean</loc></url>"                f"<url><loc>https://{HOST}/examples/pricing</loc></url><url><loc>https://{HOST}/</loc></url></urlset>"
        pages = {f"https://{HOST}/sitemaps/collections.xml": coll,
                 f"https://{HOST}/design-styles/dark": f'<a href="/style/{A}">a</a>', f"https://{HOST}/design-styles/clean": f'<a href="/style/{B}">b</a><a href="/style/{A}">a</a>',
                 f"https://{HOST}/examples/pricing": f'<a href="/style/{C}">c</a>',
                 f"https://{HOST}/resources": '<a href="/design-styles/dark">x</a><a href="/examples/pricing">y</a><a href="/">home</a>'}
        get = pages.get   # a missing page (the section itself is 404) is None
        self.assertEqual([r["id"] for r in src().plan(f"https://{HOST}/design-styles/", get)], [A, B])
        self.assertEqual([r["id"] for r in src().plan(f"https://{HOST}/resources", get)], sorted({A, C}))   # a page of links, no styles of its own: the collections it links to
        self.assertEqual([r["id"] for r in src().plan(f"https://{HOST}/sitemaps/collections.xml", get)], sorted({A, B, C}))
        with self.assertRaises(SourceError) as e:
            src().plan(f"https://{HOST}/nothing-here", get)
        self.assertEqual(e.exception.code, "no_styles")

    def test_allowed_is_the_site_and_the_picture_host(self):
        s = src()
        self.assertTrue(s.allowed(f"https://{HOST}/x") and s.allowed(f"https://{IMG}/x.png"))
        self.assertFalse(s.allowed("https://evil.example/x") or s.allowed(f"http://{HOST}/x"))
        self.assertTrue(s.image_ok(f"https://{IMG}/x.png"))
        self.assertFalse(s.image_ok(f"https://{HOST}/x.png") or s.image_ok("") or s.image_ok(None))

    def test_one_style_link_needs_no_request(self):
        def get(u):
            raise AssertionError("no request expected: " + u)
        self.assertEqual(src().plan(f"https://{HOST}/style/{A.upper()}/", get), [{"id": A, "url": f"https://{HOST}/style/{A}"}])

    def test_the_root_is_the_sitemap(self):
        xml = f"""<?xml version="1.0"?><urlset xmlns:image="x">
<url><loc>https://{HOST}/</loc></url>
<url><loc>https://{HOST}/style/{A}</loc><lastmod>2026-01-01</lastmod><image:image><image:loc>https://{IMG}/a.png</image:loc></image:image></url>
<url><loc>https://{HOST}/style/{B}</loc></url><url><loc>https://{HOST}/style/{A}</loc></url>
<url><loc>https://{HOST}/collection/x</loc></url></urlset>"""
        asked = []
        got = src().plan(f"https://{HOST}/", lambda u: asked.append(u) or xml)
        self.assertEqual(asked, [f"https://{HOST}/sitemap.xml"])
        self.assertEqual([r["id"] for r in got], [A, B])   # no repeats, no pages that are not styles
        self.assertEqual((got[0]["lastmod"], got[0]["image"]), ("2026-01-01", f"https://{IMG}/a.png"))
        self.assertNotIn("lastmod", got[1])

    def test_a_sitemap_index_goes_to_the_sitemaps_of_styles(self):
        index = f"""<sitemapindex><sitemap><loc>https://{HOST}/sitemaps/styles-1.xml</loc></sitemap>
<sitemap><loc>https://{HOST}/sitemaps/collections.xml</loc></sitemap><sitemap><loc>https://evil.example/style.xml</loc></sitemap></sitemapindex>"""
        asked = []

        def get(u):
            asked.append(u)
            return index if u.endswith("/sitemap.xml") else f"<urlset><url><loc>https://{HOST}/style/{C}</loc></url></urlset>"
        got = src().plan(f"https://{HOST}/sitemap.xml", get)
        self.assertEqual([r["id"] for r in got], [C])
        self.assertEqual(asked, [f"https://{HOST}/sitemap.xml", f"https://{HOST}/sitemaps/styles-1.xml"])   # not the collections, not a foreign host

    def test_another_page_gives_the_styles_it_links_to(self):
        html = f'<a href="/style/{A}">a</a><a href="https://{HOST}/style/{B}?x=1">b</a><a href="/style/{A}">again</a><a href="/style/not-an-id">no</a>'
        got = src().plan(f"https://{HOST}/collection/calm", lambda u: html)
        self.assertEqual([r["id"] for r in got], [A, B])

    def test_nothing_to_download_is_said(self):
        for url in (f"https://{HOST}/collection/empty", f"https://{HOST}/"):
            with self.assertRaises(SourceError) as e:
                src().plan(url, lambda u: "<html>nothing</html>")
            self.assertEqual(e.exception.code, "no_styles")
        with self.assertRaises(SourceError):
            src().plan(f"https://{HOST}/", lambda u: None)   # the sitemap is gone


class Registry(unittest.TestCase):
    def test_the_first_source_is_refero_and_for_url_finds_it(self):
        self.assertIn("styles.refero.design", sources.names())
        self.assertIsNotNone(sources.for_url("https://styles.refero.design/style/" + A))
        self.assertIsNone(sources.for_url("https://styles.example.com/style/" + A))


if __name__ == "__main__":
    unittest.main()
