"""Hub Design in a real headless Chrome: a design that is a screen-height app (100vh, a sidebar and a main that scrolls inside, a footer at the
end of the main) is shown on the canvas as tall as its content, so the footer is in the frame without scrolling inside it; a design that
grows with its window (a 100vh hero per section) keeps the screen-height frame. Needs the hub code on PYTHONPATH and a Chrome; skipped without them."""
import os
import sys
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_edit_e2e as base

SHELL = """<!doctype html><html><head><meta charset=utf-8><style>
html,body{margin:0;height:100%}.app{display:flex;height:100vh;font:20px system-ui}
.side{width:200px;background:#ddd}.col{flex:1;display:flex;flex-direction:column;min-width:0}
header{height:60px;background:#eef;flex:none}main{flex:1;overflow:auto}.long{height:3000px;background:linear-gradient(#fff,#cde)}
footer{height:120px;background:#333;color:#fff}
</style></head><body><div class=app><div class=side>menu</div><div class=col><header>head</header><main><div class=long>content</div><footer id=foot>footer</footer></main></div></div></body></html>"""
HEROES = """<!doctype html><html><head><meta charset=utf-8><style>body{margin:0}section{height:100vh;font:40px system-ui}</style></head>
<body><section style="background:#fdd">one</section><section style="background:#dfd">two</section><section style="background:#ddf">three</section></body></html>"""
FRAME_H = "Math.round(document.querySelector('.hdc-iframe').offsetHeight)"


class Fixture(base.EditByHand):
    design = SHELL

    def setUp(self):
        patch = mock.patch.object(base, "PAGE", self.design)
        patch.start()
        self.addCleanup(patch.stop)
        super().setUp()

    def frame_h(self):
        return self.page({"eval": FRAME_H})[0]["eval"]

    def settle(self, want, ms=12000):
        end = time.time() + ms / 1000
        while time.time() < end:
            if want(self.frame_h()):
                break
            time.sleep(0.3)
        time.sleep(1.0)
        return self.frame_h()


@unittest.skipUnless(base.CORE and base.CHROME and os.path.exists(base.CHROME), "needs the hub code on PYTHONPATH and Chrome")
class ScreenHeightApp(Fixture):
    def test_frame_is_as_tall_as_the_content_and_the_footer_is_inside(self):
        h = self.settle(lambda v: v > 900)
        self.assertGreaterEqual(h, 60 + 3000 + 120)
        inside = self.frames("(()=>{const f=document.getElementById('foot');if(!f)return null;const m=document.querySelector('main');"
                             "return [Math.round(f.getBoundingClientRect().bottom),innerHeight,m.scrollHeight-m.clientHeight]})()")[0]
        self.assertLessEqual(inside[0], inside[1], "the footer is below the frame bottom")
        self.assertLessEqual(inside[2], 1, "the main still scrolls inside the frame")


@unittest.skipUnless(base.CORE and base.CHROME and os.path.exists(base.CHROME), "needs the hub code on PYTHONPATH and Chrome")
class GrowsWithWindow(Fixture):
    design = HEROES

    def test_a_design_that_follows_its_window_keeps_the_screen_height(self):
        self.assertEqual(self.settle(lambda v: v != 900), 900)


for _n in dir(base.EditByHand):      # the inherited tests are not ours to run again
    if _n.startswith("test_"):
        for _c in (Fixture, ScreenHeightApp, GrowsWithWindow):
            if _n not in vars(_c):
                setattr(_c, _n, None)

if __name__ == "__main__":
    unittest.main()
