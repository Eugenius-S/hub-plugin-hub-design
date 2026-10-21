import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import handwrite  # noqa: E402

SRC = '''<!doctype html>
<html lang="ru"><head><style>.card{color:red}</style></head>
<body>
<section id="pricing">
  <div class="card"><h3>Start</h3><a class="btn" href="/a?x=1&amp;y=2" style="color: blue; background: url(data:image/png;base64,AAA)">Купить</a></div>
  <div class="card"><h3>Pro</h3>
    <a class="btn" href="/b">
      Купить
    </a></div>
  <ul><li>Раз<li>Два<li>Три</ul>
</section>
<script>var s = "<div class='card'><a class='btn'>Купить</a></div>";</script>
</body></html>
'''
BTN2 = "#pricing > div.card:nth-of-type(2) > a.btn"
BTN1 = "#pricing > div.card:nth-of-type(1) > a.btn"


def run(changes, ops=(), src=SRC):
    return handwrite.apply(src, changes, ops)


class Apply(unittest.TestCase):
    def test_move_and_resize_go_into_the_style_of_that_element_only(self):
        out, done, skipped, _, _ = run([{"sel": BTN2, "label": "Купить", "tag": "a", "dx": 10, "dy": -5.5, "w": 120, "h": 40}])
        self.assertEqual(done, [BTN2])
        self.assertIn('style="translate: 10px -5.5px; box-sizing: border-box; width: 120px; height: 40px" class="btn" href="/b">', out)
        # всё остальное в файле — байт в байт
        self.assertEqual(out.replace(' style="translate: 10px -5.5px; box-sizing: border-box; width: 120px; height: 40px"', ""), SRC)

    def test_existing_style_is_kept_and_only_same_props_are_replaced(self):
        out, done, _, _, _ = run([{"sel": BTN1, "label": "Купить", "dx": 3, "dy": 0, "css": {"color": {"from": "blue", "to": "rgb(1, 2, 3)"}}}])
        self.assertEqual(done, [BTN1])
        self.assertIn('style="background: url(data:image/png;base64,AAA); translate: 3px 0px; color: rgb(1, 2, 3)"', out)

    def test_text_replaced_inside_leaf_keeping_whitespace_and_escaped(self):
        out, done, skipped, _, _ = run([{"sel": BTN2, "label": "Купить", "t0": "Купить", "t": "Взять & <go>"}])
        self.assertEqual(done, [BTN2])
        self.assertIn('<a class="btn" href="/b">\n      Взять &amp; &lt;go&gt;\n    </a>', out)

    def test_text_that_differs_from_the_file_is_not_written(self):
        out, done, skipped, _, _ = run([{"sel": BTN2, "label": "Купить", "t0": "Совсем другое", "t": "Новое"}])
        self.assertEqual((out, done), (SRC, []))
        self.assertIn("текст в файле не тот", skipped[0]["why"])

    def test_nothing_is_written_to_the_wrong_element(self):
        for c, why in (
            ({"sel": "#nope", "label": "x", "dx": 1}, "элемента нет"),
            ({"sel": "div.card > a.btn", "label": "Купить", "dx": 1}, "несколько"),
            ({"sel": BTN2, "label": "Совсем другой текст", "dx": 1}, "другим текстом"),
            ({"sel": BTN2, "label": "Купить", "tag": "button", "dx": 1}, "тег"),
            ({"sel": "???", "label": "", "dx": 1}, "не разобран"),
            ({"sel": BTN2, "label": "Купить", "css": {"color": {"from": "a", "to": "red; position: fixed"}}}, "не годится"),
        ):
            out, done, skipped, _, _ = run([c])
            self.assertEqual((out, done), (SRC, []), c)
            self.assertIn(why, skipped[0]["why"], c)

    def test_element_built_by_script_is_not_found(self):
        out, done, skipped, _, _ = run([{"sel": "#pricing > div.card:nth-of-type(3) > a.btn", "label": "Купить", "dx": 1}])
        self.assertEqual((out, done), (SRC, []))

    def test_implicit_li_close_and_nth_of_type(self):
        out, done, _, _, _ = run([{"sel": "#pricing > ul > li:nth-of-type(2)", "label": "Два", "tag": "li", "dx": 4}])
        self.assertEqual(done, ["#pricing > ul > li:nth-of-type(2)"])
        self.assertIn('<li>Раз<li style="translate: 4px 0px">Два<li>Три', out)

    def test_tweaks_go_to_html_tag(self):
        out, _, _, state, _ = run([], [{"kind": "var", "name": "--accent", "value": "#f00"}, {"kind": "attr", "name": "data-theme", "value": "dark"}])
        self.assertEqual(state, "done")
        self.assertIn('<html data-theme="dark" style="--accent: #f00" lang="ru">', out)
        # снять
        out2, _, _, _, _ = run([], [{"kind": "var", "name": "--accent", "value": None}, {"kind": "attr", "name": "lang", "value": None}], out)
        self.assertIn('<html data-theme="dark">', out2)

    def test_bad_tweak_ops_are_skipped(self):
        for o in ({"kind": "var", "name": "x", "value": "1"}, {"kind": "attr", "name": "onload", "value": "1"}, {"kind": "var", "name": "--a", "value": "1;}"}):
            out, _, _, state, why = run([], [o])
            self.assertEqual((out, state), (SRC, "skipped"), o)

    def test_same_element_twice_is_written_once(self):
        a = {"sel": BTN2, "label": "Купить", "dx": 1}
        b = {"sel": "#pricing > div:nth-of-type(2) > a:nth-of-type(1)", "label": "Купить", "dx": 9}
        _, done, skipped, _, _ = run([a, b])
        self.assertEqual(len(done) + len(skipped), 2)
        self.assertLessEqual(len(done), 2)


if __name__ == "__main__":
    unittest.main()
