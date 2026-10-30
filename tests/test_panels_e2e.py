"""Hub Design in a real headless Chrome: both side panels of the canvas close with a cross and come back from the canvas
toolbar, the canvas takes the freed place, and the choice survives a reload. Needs the hub code (tests/test_web_e2e.py) on PYTHONPATH
and a Chrome; skipped without them."""
import json
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_edit_e2e as base

LEFT = "document.querySelector('.hd-left')"
STAGE = "Math.round(document.querySelector('.hdc-stage').getBoundingClientRect().width)"
STORED = "localStorage.getItem('hub-design:panels')"


@unittest.skipUnless(base.CORE and base.CHROME and os.path.exists(base.CHROME), "needs the hub code on PYTHONPATH and Chrome")
class Panels(base.EditByHand):
    def js(self, expr):
        return self.page({"eval": expr})[0].get("eval")

    def click_js(self, sel):
        self.js(f"document.querySelector({json.dumps(sel)}).click() || 1")
        time.sleep(0.8)

    def shown(self, sel):
        return self.js(f"(()=>{{const e=document.querySelector({json.dumps(sel)});return !!e&&e.getBoundingClientRect().width>0}})()")

    def test_left_panel_closes_with_the_cross_and_returns_from_the_toolbar(self):
        self.assertTrue(self.shown(".hd-left"))
        narrow = self.js(STAGE)
        self.click_js(".hd-top .hd-x")
        self.assertFalse(self.shown(".hd-left"))
        self.assertGreater(self.js(STAGE), narrow, "the canvas takes the freed place")
        self.assertEqual(json.loads(self.js(STORED))["left"], False)
        self.open_canvas()
        self.assertFalse(self.shown(".hd-left"), "the choice survives a reload")
        self.click_js(".hdc-bar .hdc-left")      # the show-chat button, first in the left island of the canvas
        self.assertTrue(self.shown(".hd-left"))
        self.assertEqual(json.loads(self.js(STORED))["left"], True)

    def test_right_panel_closes_with_the_cross_and_stays_closed_after_a_reload(self):
        self.click("#t")      # selecting an element opens the style panel
        self.assertTrue(self.shown(".hd-props"))
        narrow = self.js(STAGE)
        self.click_js(".hd-props .hd-x")
        self.assertFalse(self.shown(".hd-props"))
        self.assertGreater(self.js(STAGE), narrow)
        self.assertEqual(json.loads(self.js(STORED))["right"], False)
        self.open_canvas()
        self.click("#t")      # closed by the owner: selecting does not open it again
        self.assertFalse(self.shown(".hd-props"))

    def test_start_screen_keeps_the_chat_panel_whatever_was_chosen(self):
        self.click_js(".hd-top .hd-x")
        self.click_js(".hd-home")
        self.assertTrue(self.shown(".hd-left"), "the dashboard has no other way back to the chat")

for _n in dir(base.EditByHand):      # the inherited tests are not ours to run again
    if _n.startswith("test_"):
        setattr(Panels, _n, None)

if __name__ == "__main__":
    unittest.main()
