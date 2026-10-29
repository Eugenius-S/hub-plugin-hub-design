import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import handwrite  # noqa: E402

SRC = '''<!doctype html>
<html lang="en"><head><style>.card{color:red}</style></head>
<body>
<section id="pricing">
  <div class="card"><h3>Start</h3><a class="btn" href="/a?x=1&amp;y=2" style="color: blue; background: url(data:image/png;base64,AAA)">Buy</a></div>
  <div class="card"><h3>Pro</h3>
    <a class="btn" href="/b">
      Buy
    </a></div>
  <ul><li>One<li>Two<li>Three</ul>
</section>
<script>var s = "<div class='card'><a class='btn'>Buy</a></div>";</script>
</body></html>
'''
BTN2 = "#pricing > div.card:nth-of-type(2) > a.btn"
BTN1 = "#pricing > div.card:nth-of-type(1) > a.btn"


def run(changes, ops=(), src=SRC):
    return handwrite.apply(src, changes, ops)


class Apply(unittest.TestCase):
    def test_move_and_resize_go_into_the_style_of_that_element_only(self):
        out, done, skipped, _, _ = run([{"sel": BTN2, "label": "Buy", "tag": "a", "dx": 10, "dy": -5.5, "w": 120, "h": 40}])
        self.assertEqual(done, [BTN2])
        self.assertIn('style="translate: 10px -5.5px; box-sizing: border-box; width: 120px; height: 40px" class="btn" href="/b">', out)
        # everything else in the file stays byte for byte
        self.assertEqual(out.replace(' style="translate: 10px -5.5px; box-sizing: border-box; width: 120px; height: 40px"', ""), SRC)

    def test_existing_style_is_kept_and_only_same_props_are_replaced(self):
        out, done, _, _, _ = run([{"sel": BTN1, "label": "Buy", "dx": 3, "dy": 0, "css": {"color": {"from": "blue", "to": "rgb(1, 2, 3)"}}}])
        self.assertEqual(done, [BTN1])
        self.assertIn('style="background: url(data:image/png;base64,AAA); translate: 3px 0px; color: rgb(1, 2, 3)"', out)

    def test_text_replaced_inside_leaf_keeping_whitespace_and_escaped(self):
        out, done, skipped, _, _ = run([{"sel": BTN2, "label": "Buy", "t0": "Buy", "t": "Take & <go>"}])
        self.assertEqual(done, [BTN2])
        self.assertIn('<a class="btn" href="/b">\n      Take &amp; &lt;go&gt;\n    </a>', out)

    def test_text_that_differs_from_the_file_is_not_written(self):
        out, done, skipped, _, _ = run([{"sel": BTN2, "label": "Buy", "t0": "Something else", "t": "New"}])
        self.assertEqual((out, done), (SRC, []))
        self.assertEqual(skipped[0]["code"], "textdiff")
        self.assertIn("not the same as on the canvas", skipped[0]["why"])

    def test_nothing_is_written_to_the_wrong_element(self):
        for c, why in (
            ({"sel": "#nope", "label": "x", "dx": 1}, "absent"),
            ({"sel": "div.card > a.btn", "label": "Buy", "dx": 1}, "several"),
            ({"sel": BTN2, "label": "A totally different text", "dx": 1}, "label"),
            ({"sel": BTN2, "label": "Buy", "tag": "button", "dx": 1}, "tag"),
            ({"sel": "???", "label": "", "dx": 1}, "selector"),
            ({"sel": BTN2, "label": "Buy", "css": {"color": {"from": "a", "to": "red; position: fixed"}}}, "style"),
        ):
            out, done, skipped, _, _ = run([c])
            self.assertEqual((out, done), (SRC, []), c)
            self.assertEqual(skipped[0]["code"], why, c)
            self.assertEqual(skipped[0]["why"], handwrite.WHY[why], c)

    def test_element_built_by_script_is_not_found(self):
        out, done, skipped, _, _ = run([{"sel": "#pricing > div.card:nth-of-type(3) > a.btn", "label": "Buy", "dx": 1}])
        self.assertEqual((out, done), (SRC, []))

    def test_implicit_li_close_and_nth_of_type(self):
        out, done, _, _, _ = run([{"sel": "#pricing > ul > li:nth-of-type(2)", "label": "Two", "tag": "li", "dx": 4}])
        self.assertEqual(done, ["#pricing > ul > li:nth-of-type(2)"])
        self.assertIn('<li>One<li style="translate: 4px 0px">Two<li>Three', out)

    def test_tweaks_go_to_html_tag(self):
        out, _, _, state, _ = run([], [{"kind": "var", "name": "--accent", "value": "#f00"}, {"kind": "attr", "name": "data-theme", "value": "dark"}])
        self.assertEqual(state, "done")
        self.assertIn('<html data-theme="dark" style="--accent: #f00" lang="en">', out)
        # remove
        out2, _, _, _, _ = run([], [{"kind": "var", "name": "--accent", "value": None}, {"kind": "attr", "name": "lang", "value": None}], out)
        self.assertIn('<html data-theme="dark">', out2)

    def test_bad_tweak_ops_are_skipped(self):
        for o in ({"kind": "var", "name": "x", "value": "1"}, {"kind": "attr", "name": "onload", "value": "1"}, {"kind": "var", "name": "--a", "value": "1;}"}):
            out, _, _, state, why = run([], [o])
            self.assertEqual((out, state), (SRC, "skipped"), o)

    def test_same_element_twice_is_written_once(self):
        a = {"sel": BTN2, "label": "Buy", "dx": 1}
        b = {"sel": "#pricing > div:nth-of-type(2) > a:nth-of-type(1)", "label": "Buy", "dx": 9}
        _, done, skipped, _, _ = run([a, b])
        self.assertEqual(len(done) + len(skipped), 2)
        self.assertLessEqual(len(done), 2)

    def test_non_ascii_text_is_written_as_is(self):
        # deliberately not Latin: the file is UTF-8 and the text must survive byte for byte
        src = SRC.replace("<h3>Pro</h3>", "<h3>Café 日本</h3>")
        sel = "#pricing > div.card:nth-of-type(2) > h3"
        out, done, _, _, _ = run([{"sel": sel, "label": "Café 日本", "tag": "h3", "t0": "Café 日本", "t": "Zażółć — 買う"}], src=src)
        self.assertEqual(done, [sel])
        self.assertIn("<h3>Zażółć — 買う</h3>", out)

    def test_every_refusal_reason_is_english(self):
        # the reasons are shown on the page next to its own text; they are the module's own words, one stable language
        cases = [
            {"sel": "#nope", "label": "x", "dx": 1},
            {"sel": "div.card > a.btn", "label": "Buy", "dx": 1},
            {"sel": BTN2, "label": "Elsewhere", "dx": 1},
            {"sel": BTN2, "label": "Buy", "tag": "button", "dx": 1},
            {"sel": "???", "label": "", "dx": 1},
            {"sel": BTN2, "label": "Buy", "t0": "Other", "t": "New"},
            {"sel": BTN2, "label": "Buy", "css": {"color": {"from": "a", "to": "red; position: fixed"}}},
            {"sel": "#pricing > div.card:nth-of-type(3) > a.btn", "label": "Buy", "dx": 1},
        ]
        for c in cases:
            _, done, skipped, _, _ = run([c])
            self.assertEqual(done, [], c)
            why = skipped[0]["why"]
            self.assertTrue(why.isascii() and why, (c, why))
            self.assertIn(skipped[0]["code"], handwrite.WHY, c)
        _, _, _, state, why = run([], [{"kind": "var", "name": "x", "value": "1"}])
        self.assertEqual((state, why), ("skipped", "tweak"))
        _, _, _, state, why = run([], [{"kind": "var", "name": "--a", "value": "1"}], "<p>no html tag</p>")
        self.assertEqual(why, "nohtml")


RICH = '''<!doctype html>
<html><body>
<p id="r" class="lead">
  Plain <strong>bold</strong> and <a href="#x">link</a><br>next
</p>
<h1 id="t">Title</h1>
</body></html>
'''


class Rich(unittest.TestCase):
    """Text with inline tags: the canvas sends the new inner markup (m), the file keeps every tag."""

    def change(self, m, t, **kw):
        return dict({"sel": "#r", "label": "Plain bold and linknext", "tag": "p", "t0": "Plain bold and linknext", "t": t, "m": m}, **kw)

    def test_text_inside_strong_and_a_is_written_keeping_the_markup(self):
        m = 'Plain <strong>bolder</strong> and <a href="#x">a link</a><br>next'
        out, done, skipped, _, _ = handwrite.apply(RICH, [self.change(m, "Plain bolder and a linknext")])
        self.assertEqual((done, skipped), (["#r"], []))
        self.assertIn('<p id="r" class="lead">\n  ' + m + '\n</p>', out)
        self.assertEqual(out.replace("bolder", "bold").replace(">a link<", ">link<"), RICH)

    def test_style_of_the_same_element_and_of_a_tag_inside_are_written_too(self):
        m = 'Plain <strong>bold!</strong> and <a href="#x">link</a><br>next'
        out, done, skipped, _, _ = handwrite.apply(RICH, [
            self.change(m, "Plain bold! and linknext", css={"font-size": {"from": "16px", "to": "20px"}}),
            {"sel": "#r > strong", "label": "bold", "tag": "strong", "css": {"color": {"from": "a", "to": "red"}}},
        ])
        self.assertEqual(sorted(done), ["#r", "#r > strong"], skipped)
        self.assertIn('<p style="font-size: 20px" id="r" class="lead">', out)
        self.assertIn('<strong style="color: red">bold!</strong>', out)

    def test_unsafe_or_new_markup_is_not_written(self):
        for m in ('Plain <script>x()</script>', 'Plain <strong onclick="x()">bold</strong>', 'Plain <a href="javascript:x()">link</a>',
                  'Plain <a href=" JaVa&#x53;cript:x()">link</a>', 'Plain <img src=x>', 'Plain <strong>bold', 'Plain <!-- x -->',
                  'Plain <div>bold</div>', 'Plain </p><p>bold'):
            out, done, skipped, _, _ = handwrite.apply(RICH, [self.change(m, "Plain bold")])
            self.assertEqual((out, done), (RICH, []), m)
            self.assertEqual(skipped[0]["code"], "markup", m)
            self.assertIn(skipped[0]["code"], handwrite.WHY)

    def test_rich_text_that_differs_from_the_file_is_not_written(self):
        out, done, skipped, _, _ = handwrite.apply(RICH, [self.change("Plain", "Plain", t0="Something else")])
        self.assertEqual((out, done, skipped[0]["code"]), (RICH, [], "textdiff"))

    def test_plain_leaf_still_goes_the_old_way(self):
        out, done, _, _, _ = handwrite.apply(RICH, [{"sel": "#t", "label": "Title", "t0": "Title", "t": "New & <b>"}])
        self.assertEqual(done, ["#t"])
        self.assertIn('<h1 id="t">New &amp; &lt;b&gt;</h1>', out)


if __name__ == "__main__":
    unittest.main()
