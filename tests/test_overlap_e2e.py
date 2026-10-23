"""Hub Design in a real headless Chrome: no two visible boxes of the interface overlap and no text is cut off, in the windows
1440x900, 1700x620 and 2770x1000: the dashboard, the canvas, the canvas with a selected card and with a selected text (the right
panel, the chips over the selection, the handles). Needs the hub code (tests/test_web_e2e.py) on PYTHONPATH and a Chrome; skipped without them."""
import json
import os
import subprocess
import sys
import time
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E2E = os.path.join(HERE, "tests", "e2e")
CORE = next((p for p in os.environ.get("PYTHONPATH", "").split(os.pathsep) if p and os.path.exists(os.path.join(p, "tests", "test_web_e2e.py"))), "")
if CORE:
    sys.path.insert(0, CORE)
try:
    from tests.test_web_e2e import PageInChrome, CHROME
except Exception:   # no hub code: nothing to run the page with
    PageInChrome = unittest.TestCase
    CHROME = ""

PAGE = """<!doctype html><html><head><meta charset=utf-8><style>:root{--ink:#1f1e1d;--accent:#d97757;--muted:#52514e}
body{margin:0;background:#eef;font:32px system-ui;color:var(--ink)}
.c{position:absolute;background:#fff;border-radius:12px;padding:16px;box-sizing:border-box}
#a{left:100px;top:200px;width:400px;height:200px;color:#334455}#b{left:700px;top:200px;width:400px;height:300px}
#c{left:100px;top:600px;width:400px;height:120px}#t{position:absolute;left:100px;top:80px;color:var(--accent)}
#m{position:absolute;left:700px;top:80px;color:var(--muted)}</style></head>
<body><h1 id=t style="margin:0;font-size:40px">Hub Design</h1><p id=m style="margin:0">Muted line</p>
<div class=c id=a>Card A</div><div class=c id=b><span style="color:var(--accent)">Card B</span></div><div class=c id=c>Card C</div></body></html>"""
WINDOWS = [(1440, 900), (1700, 620), (2770, 1000)]
BOXES = "/hdc-card|hd-flabel|hd-unit|hd-psec/"
CANVAS = "document.querySelectorAll('.hdc-iframe').length"


@unittest.skipUnless(CORE and CHROME and os.path.exists(CHROME), "needs the hub code on PYTHONPATH and Chrome")
class Overlaps(PageInChrome):
    def node(self, script, *args):
        r = subprocess.run(["node", os.path.join(E2E, script), str(self.cdp), *map(str, args)], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def mouse(self, kind, x, y):
        self.node("mouse.mjs", kind, x, y)

    def probe(self, root, boxes=BOXES):
        js = open(os.path.join(E2E, "overlap.js"), encoding="utf-8").read().strip().rstrip(";")
        return "(()=>{const ROOT=%s, ROOT_BOX=%s; return %s})()" % (root, boxes, js)

    def seen(self, where="page"):
        """the problems on the page, or inside the page of the design (its overlay)"""
        page = "(document.querySelector('.hdc')||document.body).parentElement"
        if where == "page":
            return self.page({"eval": self.probe(page)})[0]["eval"]
        out = json.loads(self.node("ifr.mjs", self.probe("document.querySelector('[data-canvas-overlay]').shadowRoot", "/(^| )grip( |$)/")).strip().splitlines()[0])
        return next(o["v"] for o in out if o.get("v") is not None)

    def asked(self):
        """the first-start question of the plugin is over the page"""
        return self.page({"eval": "!!document.body.innerText.match(/Не качаем|Don.t download/)"})[0]["eval"]

    def centre(self, sel):
        x, y, w, h = self.page({"eval": "(()=>{const r=document.querySelector('.hdc-iframe').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()"})[0]["eval"]
        k = w / 1440
        out = json.loads(self.node("ifr.mjs", f"(()=>{{const r=document.querySelector({json.dumps(sel)}).getBoundingClientRect();return [r.x,r.y,r.width,r.height]}})()").strip().splitlines()[0])
        r = next(o["v"] for o in out if o.get("v"))
        return x + (r[0] + r[2] / 2) * k, y + (r[1] + r[3] / 2) * k

    def click(self, sel):
        x, y = self.centre(sel)
        self.mouse("move", x, y); self.mouse("down", x, y); self.mouse("up", x, y)
        time.sleep(1.0)
        return x, y

    def setUp(self):
        super().setUp()
        proj = os.path.join(self.state, "proj")
        os.makedirs(os.path.join(proj, "site"))
        self.file = os.path.join(proj, "site", "page.html")
        with open(self.file, "w", encoding="utf-8") as f:
            f.write(PAGE)
        cfg = os.path.join(self.state, "hub.json")
        with open(cfg, "w") as f:
            json.dump({"projects": {"site": {"path": proj, "about": "x"}}, "extensions": {"hub-design": {"path": HERE, "web": "main.js"}}, "testchrome": {"path": CHROME}}, f)
        env = {"HUB_CONFIG": cfg, "HUB_STATE_DIR": self.state, "HUB_WEB_PORT": str(self.port)}
        patch = mock.patch.dict(os.environ, {"HUB_CONFIG": cfg}); patch.start(); self.addCleanup(patch.stop)
        srv = subprocess.Popen([sys.executable, "server.py"], cwd=HERE, env={**os.environ, **env, "PYTHONPATH": CORE},
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        self.addCleanup(lambda: (srv.terminate(), srv.wait(5)))
        self.ev("session.requested", "designer", session_id="s-d", cwd=proj, channel="cli", owner=True)
        self.ev("session.started", "designer", session_id="s-d")
        self.ev("turn.tool", "designer", id="t0", name="Write", input={"file_path": self.file})
        time.sleep(1.5)
        self.url = f"http://localhost:{self.port}/#/x/hub-design"
        self.board = {"hub-design:board": json.dumps({"frames": [{"path": self.file, "x": 0, "y": 0, "w": 1440, "h": 900, "auto": True, "author": "designer"}], "pins": [], "changes": [], "drawings": [], "notes": [], "round": 1})}

    def test_checker_sees_a_collision(self):
        # the check must fail on a broken layout, or its zeros mean nothing
        self.page({"go": self.url}, {"sleep": 3000})
        if self.asked():
            self.page({"click": "Не качаем"}, {"sleep": 800})
        self.page({"eval": "(()=>{for (const l of ['one','two']) {const b=document.createElement('button');b.className='hdc-card';b.textContent='Tool '+l;b.style.cssText='position:fixed;left:200px;top:200px';document.body.append(b)}; const s=document.createElement('span');s.className='hd-flabel';s.style.cssText='position:fixed;left:400px;top:400px;width:20px;overflow:hidden;white-space:nowrap';s.textContent='A very long label';document.body.append(s)})()"})
        found = self.page({"eval": self.probe("document.body")})[0]["eval"]
        self.assertTrue(any(l.startswith("OVER") for l in found), found)
        self.assertTrue(any(l.startswith("CUT") for l in found), found)

    def test_no_overlaps(self):
        problems = {}
        for w, h in WINDOWS:
            subprocess.run(["node", os.path.join(E2E, "win.mjs"), str(self.cdp), str(w), str(h)], capture_output=True, text=True, timeout=30)
            time.sleep(0.8)
            tag = f"{w}x{h}"
            self.page({"local": self.board}, {"go": "about:blank"}, {"go": self.url}, {"sleep": 4500})
            if self.asked():
                problems[tag + " first-run card"] = self.seen()
                self.page({"click": "Не качаем"}, {"sleep": 800})
            problems[tag + " dashboard"] = self.seen()
            self.page({"click": "designer"}, {"sleep": 1200}, {"click": "Макет-1"}, {"until": f"{CANVAS} && document.querySelector('.hdc-iframe').getBoundingClientRect().width>100", "ms": 20000}, {"sleep": 2500})
            problems[tag + " canvas"] = self.seen()
            for what, sel in (("card", "#c"), ("text", "#t")):
                x, y = self.click(sel)
                problems[f"{tag} {what} selected"] = self.seen()
                self.mouse("move", x, y + 120); time.sleep(0.4)     # the box under the cursor appears too
                problems[f"{tag} {what} overlay"] = self.seen("overlay")
        bad = {k: v for k, v in problems.items() if v}
        self.assertEqual(bad, {}, "\n" + "\n".join(f"{k}:\n  " + "\n  ".join(v) for k, v in bad.items()))


if __name__ == "__main__":
    unittest.main()
