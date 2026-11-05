"""The "Sort files" button of the start screen in a real headless Chrome, in a copy of the hub (its own state, config and port): the button is among the
tools, a click puts a loose design into the folder of its task, the toast offers Undo and Undo puts it back. Needs the hub code on PYTHONPATH and a
Chrome; skipped without them. SHOT=<file.png> keeps a shot of the start screen."""
import json
import os
import subprocess
import sys
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_edit_e2e as base

HERE = base.HERE
TOOLS = "document.querySelector('.hdd-tools')"


@unittest.skipUnless(base.CORE and base.CHROME and os.path.exists(base.CHROME), "needs the hub code on PYTHONPATH and Chrome")
class SortFiles(base.PageInChrome):
    def setUp(self):
        super().setUp()
        proj = os.path.join(self.state, "proj")
        os.makedirs(os.path.join(proj, "promo"))
        self.loose = os.path.join(proj, "promo", "card.html")
        self.placed = os.path.join(proj, "design", "promo", "card", "index.html")   # the designer's own folder gets a design/ in it
        with open(self.loose, "w", encoding="utf-8") as f:
            f.write("<!doctype html><title>card</title><p>card</p>")
        os.utime(self.loose, (1_700_000_000, 1_700_000_000))   # long ago: not a design a designer is at work on
        cfg = os.path.join(self.state, "hub.json")
        with open(cfg, "w") as f:
            json.dump({"projects": {"site": {"path": proj, "about": "x"}}, "extensions": {"hub-design": {"path": HERE, "web": "main.js"}}, "testchrome": {"path": base.CHROME}}, f)
        env = {"HUB_CONFIG": cfg, "HUB_STATE_DIR": self.state, "HUB_WEB_PORT": str(self.port), "HUB_NO_MODEL": "1", "HUB_NO_STATS": "1"}
        patch = mock.patch.dict(os.environ, {"HUB_CONFIG": cfg}); patch.start(); self.addCleanup(patch.stop)
        srv = subprocess.Popen([sys.executable, "server.py"], cwd=HERE, env={**os.environ, **env, "PYTHONPATH": base.CORE},
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        self.addCleanup(lambda: (srv.terminate(), srv.wait(5)))
        self.ev("session.requested", "designer", session_id="s-d", cwd=proj, channel="cli", owner=True)
        self.ev("session.started", "designer", session_id="s-d")
        self.ev("turn.tool", "designer", id="t0", name="Write", input={"file_path": self.loose})
        time.sleep(1.5)
        self.url = f"http://localhost:{self.port}/#/x/hub-design"
        self.page({"local": {"hub-design:board": json.dumps({"frames": [], "pins": [], "changes": [], "drawings": []})}}, {"go": "about:blank"}, {"go": self.url}, {"sleep": 4500})
        if self.page({"eval": "!!document.body.innerText.match(/Не качаем|Don.t download/)"})[0]["eval"]:
            self.page({"click": "Не качаем"}, {"sleep": 800})
        self.page({"until": f"!!{TOOLS} && !!document.querySelector('.hdd-tidy')", "ms": 20000})

    def js(self, e):
        return self.page({"eval": e})[0]["eval"]

    def test_the_button_is_there_and_a_click_puts_the_design_in_its_task_folder_and_undo_brings_it_back(self):
        label = self.js("document.querySelector('.hdd-tidy').textContent")
        self.assertIn(label, ("Разложить файлы", "Sort files"))
        order = self.js(f"[...{TOOLS}.children].map(c=>c.className.split(' ')[0])")
        self.assertEqual(order[:2], ["hdd-sbox", "hdd-tidy"])
        if os.environ.get("SHOT"):
            self.page({"shot": os.environ["SHOT"], "width": 1300, "height": 900})
        self.page({"click": label}, {"until": "!!document.querySelector('.hdd-toast-b') && !document.querySelector('.hdd-toast-b').hidden", "ms": 15000})
        plan = os.path.join(self.state, "hub-design", "layout", "plan.txt")
        self.assertTrue(os.path.isfile(self.placed), "the design did not move; the plan: " + (open(plan, encoding="utf-8").read() if os.path.exists(plan) else "(none)"))
        self.assertFalse(os.path.exists(self.loose))
        self.page({"click": "Вернуть" if "Разложить" in label else "Undo"}, {"sleep": 1500})
        self.assertTrue(os.path.isfile(self.loose), "Undo did not bring the design back")
        self.assertFalse(os.path.exists(self.placed))


for _n in dir(base.PageInChrome):   # the page tests of the hub are not ours
    if _n.startswith("test_"):
        setattr(SortFiles, _n, None) if _n not in vars(SortFiles) else None

if __name__ == "__main__":
    unittest.main()
