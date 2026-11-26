"""The palette button in a session's input, on any core: with the composer.tools slot (this hub's build) it sits next to "Send";
on a core without it (the shared release) it stands in the same row in a holder of its own, and the row above the input
(session.composer) stays empty and is not shown. Either way a click carries the
typed text to Hub Design and moves it into Hub Design's input. Needs the hub code on PYTHONPATH and a Chrome; skipped without them."""
import json
import os
import sys
import time
import unittest
from unittest import mock
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_edit_e2e as base

BTN = "document.querySelector('.hd-palette')"
INPUT = "document.querySelector('form.composer textarea')"


@unittest.skipUnless(base.CORE and base.CHROME and os.path.exists(base.CHROME), "needs the hub code on PYTHONPATH and Chrome")
class PaletteInTheInput(base.PageInChrome):
    def setUp(self):
        super().setUp()
        proj = os.path.join(self.state, "proj")
        os.makedirs(proj)
        cfg = os.path.join(self.state, "hub.json")
        with open(cfg, "w") as f:
            json.dump({"projects": {"site": {"path": proj, "about": "x"}}, "extensions": {"hub-design": {"path": base.HERE, "web": "main.js"}}}, f)
        patch = mock.patch.dict(os.environ, {"HUB_CONFIG": cfg}); patch.start(); self.addCleanup(patch.stop)
        self.ev("session.requested", "chat", session_id="s-c", cwd=proj, channel="cli", owner=True)
        self.ev("session.started", "chat", session_id="s-c")
        time.sleep(1)

    def js(self, e):
        return self.page({"eval": e})[0].get("eval")

    def test_the_palette_is_in_the_input_and_carries_the_text_to_hub_design(self):
        got = self.page({"go": f"http://127.0.0.1:{self.port}/#/s/chat"}, {"until": f"!!{BTN} && !!{INPUT}", "ms": 15000})
        self.assertTrue(got[-1]["until"], "no palette button in the session's input: the plugin asked only for the composer.tools slot")
        inside = self.js(f"!!({BTN}.closest('.dock-inner')) && {BTN}.getClientRects().length > 0")
        self.assertTrue(inside, "the button is not drawn in the session's input area")
        with open(os.path.join(base.CORE, "modules", "web", "static", "js", "ext.js"), encoding="utf-8") as f:
            has_tools = '"composer.tools"' in f.read()
        where = self.js(f"{BTN}.closest('.slot-session-composer') ? 'above' : {BTN}.closest('form.composer > .bar > .slot-composer-tools') ? 'tools' : ''")
        self.assertEqual(where, "tools", "in the input's row next to Send, with or without composer.tools (has_tools=%s)" % has_tools)
        if not has_tools:
            shown = self.js("[...document.querySelectorAll('.slot-host.composer')].filter(h => h.getClientRects().length).length")
            self.assertEqual(shown, 0, "no empty card above the input on a core without composer.tools")
        self.js(f"(()=>{{const t={INPUT};t.focus();t.value='make the header calmer';t.dispatchEvent(new Event('input',{{bubbles:true}}));return 1}})()")
        self.page({"mclick": ".hd-palette"})
        got = self.page({"until": "location.hash.startsWith('#/x/hub-design')", "ms": 8000})
        self.assertTrue(got[-1]["until"], "the click did not open Hub Design")
        got = self.page({"until": "[...document.querySelectorAll('textarea')].some(t => t.closest('.hd') && t.value.includes('make the header calmer'))", "ms": 8000})
        self.assertTrue(got[-1]["until"], "the typed text did not reach Hub Design's input")
        field = "document.querySelector('.hd form.composer textarea')"
        self.js(f"(() => {{ const t = {field}; t.value += ' and keep the logo'; t.dispatchEvent(new Event('input', {{bubbles:true}})); }})()")
        self.js("(location.reload(), true)")
        got = self.page({"until": f"{field}?.value === 'make the header calmer and keep the logo'", "ms": 8000})
        self.assertTrue(got[-1]["until"], "reloading Hub Design lost the transferred draft and its edits")


if __name__ == "__main__":
    unittest.main()
