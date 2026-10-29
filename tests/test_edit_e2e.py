"""Hub Design in a real headless Chrome, with real mouse and keyboard events: what the owner does by hand on the canvas reaches
the file and survives a reload. The font, size, weight and color from the panel; a text with inline tags edited as a whole;
our own write does not reload the canvas while an outside edit of the file does; a covered element is picked by Alt+click
or by a second click in place. Needs the hub code (tests/test_web_e2e.py) on PYTHONPATH and a Chrome; skipped without them."""
import json
import os
import re
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

PAGE = """<!doctype html><html><head><meta charset=utf-8><style>body{margin:0;background:#eef;font:32px system-ui;color:#1f1e1d}</style></head>
<body>
<h1 id=t style="position:absolute;left:100px;top:60px;margin:0;font-size:40px;font-weight:400;color:#334455">Title</h1>
<p id=r style="position:absolute;left:100px;top:200px;margin:0">Plain <strong>bold</strong> and <a href="#x">link</a></p>
<div id=under style="position:absolute;left:100px;top:400px;width:400px;height:200px;background:#fff;font-size:20px">Under</div>
<div id=cover style="position:absolute;left:100px;top:400px;width:400px;height:200px;background:rgba(0,0,0,.1)"></div>
</body></html>"""
CANVAS = "document.querySelectorAll('.hdc-iframe').length"
FIELD = "label.hd-field[title$=': %s'] %s"


@unittest.skipUnless(CORE and CHROME and os.path.exists(CHROME), "needs the hub code on PYTHONPATH and Chrome")
class EditByHand(PageInChrome):
    def node(self, script, *args):
        r = subprocess.run(["node", os.path.join(E2E, script), str(self.cdp), *map(str, args)], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r.stdout

    def mouse(self, kind, x, y, mods="-", clicks=1):
        self.node("mouse.mjs", kind, x, y, mods, clicks)

    def key(self, k, mods=""):
        self.node("keys.mjs", "key", k, mods)

    def type(self, text):
        self.node("keys.mjs", "text", text)

    def frames(self, expr):
        """the value of the expression in every frame where it is not null (the frames of the design)"""
        out = json.loads(self.node("ifr.mjs", expr).strip().splitlines()[0])
        return [o["v"] for o in out if o.get("v") is not None]

    def centre(self, sel):
        x, y, w, h = self.page({"eval": "(()=>{const r=document.querySelector('.hdc-iframe').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()"})[0]["eval"]
        k = w / 1440
        r = self.frames(f"(()=>{{const e=document.querySelector({json.dumps(sel)});if(!e)return null;const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}})()")[0]
        return x + (r[0] + r[2] / 2) * k, y + (r[1] + r[3] / 2) * k

    def click(self, sel, mods="-"):
        x, y = self.centre(sel)
        self.mouse("move", x, y); self.mouse("down", x, y, mods); self.mouse("up", x, y, mods)
        time.sleep(1.0)
        return x, y

    def dblclick(self, x, y):
        self.mouse("move", x, y)
        self.mouse("down", x, y); self.mouse("up", x, y)
        self.mouse("down", x, y, "-", 2); self.mouse("up", x, y, "-", 2)
        time.sleep(0.8)

    def text_at(self, sel, text):
        """the middle of a word inside an element of the design, in page coordinates"""
        x, y, w, h = self.page({"eval": "(()=>{const r=document.querySelector('.hdc-iframe').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()"})[0]["eval"]
        k = w / 1440
        r = self.frames(f"""(()=>{{const e=document.querySelector({json.dumps(sel)});if(!e)return null;const w=document.createTreeWalker(e,4);let n;
            while((n=w.nextNode())){{const i=n.data.indexOf({json.dumps(text)});if(i>=0){{const g=document.createRange();g.setStart(n,i);g.setEnd(n,i+{len(text)});
            const r=g.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}}}}return null}})()""")[0]
        return x + (r[0] + r[2] / 2) * k, y + (r[1] + r[3] / 2) * k

    def field(self, prop, value):
        """types a value into a field of the right panel as a person would: click, select all, type, Enter"""
        sel = FIELD % (prop, "input:not(.hd-sw)")
        x, y = self.page({"eval": f"(()=>{{const i=document.querySelector({json.dumps(sel)});i.scrollIntoView({{block:'center'}});const r=i.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()"})[0]["eval"]
        time.sleep(0.3)     # the panel is taller than the window: scrolled to the field, as a person would
        self.mouse("move", x, y); self.mouse("down", x, y); self.mouse("up", x, y)
        self.key("a", "ctrl"); self.type(value); self.key("Enter")
        time.sleep(0.5)

    def pick(self, prop, value):
        """a select of the panel: focus it and type the first letters, the way the keyboard picks an option"""
        sel = FIELD % (prop, "select")
        self.page({"eval": f"document.querySelector({json.dumps(sel)}).focus()"})
        for ch in value:
            self.key(ch)
        time.sleep(0.5)

    def wait_file(self, test, ms=12000):
        end = time.time() + ms / 1000
        while time.time() < end:
            with open(self.file, encoding="utf-8") as f:
                src = f.read()
            if test(src):
                return src
            time.sleep(0.3)
        self.fail("the file did not change as expected:\n" + src)

    def open_canvas(self):
        self.page({"local": self.board}, {"go": "about:blank"}, {"go": self.url}, {"sleep": 4500})
        if self.page({"eval": "!!document.body.innerText.match(/Не качаем|Don.t download/)"})[0]["eval"]:
            self.page({"click": "Не качаем"}, {"sleep": 800})
        self.page({"click": "designer"}, {"sleep": 1200}, {"click": "Макет-1"},
                  {"until": f"{CANVAS} && document.querySelector('.hdc-iframe').getBoundingClientRect().width>100", "ms": 20000}, {"sleep": 2500})

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
        self.open_canvas()

    def test_font_size_weight_color_from_the_panel_reach_the_file_and_survive_a_reload(self):
        self.click("#t")
        self.field("font-family", "Georgia")
        self.field("font-size", "56")
        self.pick("font-weight", "7")
        self.field("color", "#aa0011")
        src = self.wait_file(lambda s: all(x in s for x in ("font-family: Georgia", "font-size: 56px", "font-weight: 700", "#aa0011")))
        h1 = re.search(r"<h1[^>]*>", src).group(0)
        for x in ("font-family: Georgia", "font-size: 56px", "font-weight: 700", "#aa0011"):
            self.assertIn(x, h1)
        self.assertIn(">Title</h1>", src)
        self.open_canvas()     # a full reload of the page and of the design
        got = self.frames("(()=>{const e=document.getElementById('t');if(!e)return null;const s=getComputedStyle(e);return [s.fontFamily,s.fontSize,s.fontWeight,s.color]})()")
        self.assertIn(["Georgia", "56px", "700", "rgb(170, 0, 17)"], got)

    def test_selecting_an_element_does_not_move_the_design_from_under_the_cursor(self):
        rect = "(()=>{const r=document.querySelector('.hdc-iframe').getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round)})()"
        before = self.page({"eval": rect})[0]["eval"]
        self.click("#t")      # opens the panel on the right: the stage narrows
        self.assertTrue(self.page({"eval": "document.querySelector('.hd-right').classList.contains('props')"})[0]["eval"])
        self.assertEqual(self.page({"eval": rect})[0]["eval"], before, "the canvas refitted and the element jumped away from the cursor")

    def test_text_with_inline_tags_is_edited_and_written_keeping_the_tags(self):
        x, y = self.text_at("#r", "bold")
        self.dblclick(x, y)
        # the whole word under the caret: select it with the keyboard inside the strong, then type over it
        self.frames("(()=>{const s=document.querySelector('#r strong');if(!s||!document.activeElement||!document.activeElement.isContentEditable)return null;const g=document.createRange();g.selectNodeContents(s);const w=getSelection();w.removeAllRanges();w.addRange(g);return 1})()")
        self.type("heavy")
        self.key("Enter")
        src = self.wait_file(lambda s: "heavy" in s)
        self.assertIn('<p id=r style="position:absolute;left:100px;top:200px;margin:0">Plain <strong>heavy</strong> and <a href="#x">link</a></p>', src)

    def test_own_write_keeps_the_canvas_and_an_outside_edit_reloads_it(self):
        self.assertEqual(self.frames("document.getElementById('t') ? (window.__keep = 1) : null"), [1])
        self.click("#t")
        self.field("font-size", "48")
        self.wait_file(lambda s: "font-size: 48px" in s)
        time.sleep(6)      # the agent polls the file every 1.5 s: several polls after our write
        self.assertEqual(self.frames("document.getElementById('t') ? (window.__keep || 0) : null"), [1], "our own write reloaded the canvas")
        with open(self.file, encoding="utf-8") as f:
            src = f.read()
        time.sleep(1.1)    # a new mtime even on a coarse clock
        with open(self.file, "w", encoding="utf-8") as f:
            f.write(src.replace(">Title</h1>", ">Outside</h1>"))
        end = time.time() + 12
        while time.time() < end and "Outside" not in self.frames("document.getElementById('t') ? document.getElementById('t').textContent : null"):
            time.sleep(0.5)
        self.assertIn("Outside", self.frames("document.getElementById('t') ? document.getElementById('t').textContent : null"), "an outside edit did not reach the canvas")

    def test_covered_element_is_picked_by_alt_click_and_its_change_goes_to_it(self):
        self.click("#cover")
        self.click("#cover", "alt")
        self.field("font-size", "28")
        src = self.wait_file(lambda s: "font-size: 28px" in s)
        under = re.search(r'<div id=under[^>]*>', src).group(0)
        cover = re.search(r'<div id=cover[^>]*>', src).group(0)
        self.assertIn("font-size: 28px", under)
        self.assertNotIn("font-size", cover)

    def test_covered_element_is_picked_by_a_second_click_in_place(self):
        self.click("#cover")
        self.click("#cover")
        time.sleep(0.6)
        self.field("font-size", "26")
        src = self.wait_file(lambda s: "font-size: 26px" in s)
        self.assertIn("font-size: 26px", re.search(r'<div id=under[^>]*>', src).group(0))


if __name__ == "__main__":
    unittest.main()
