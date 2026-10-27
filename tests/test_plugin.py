"""Manifest and page scripts: they build, and their logic passes its own Node tests."""
import json
import os
import re
import shutil
import subprocess
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = shutil.which("node")


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


class Manifest(unittest.TestCase):
    def test_nav_icon_hover_files(self):
        css = read("navicon.css")
        self.assertIn('url("icon.svg")', css)
        self.assertIn('url("icon-filled.svg")', css)
        self.assertIn("prefers-reduced-motion", css)
        self.assertIn('hub.addStyle("navicon.css")', read("main.js"))
        self.assertIn('fill-rule="evenodd"', read("icon-filled.svg"))

    def test_fields(self):
        m = json.loads(read("hub-plugin.json"))
        self.assertEqual(m["name"], "hub-design")
        for key in ("description", "why", "version", "hub", "web", "icon"):
            self.assertTrue(m.get(key), key)
        self.assertEqual(m["run"], ["python3", "server.py"])
        for name in (m["web"], m["icon"], "icon.svg", "style.css", "agent.js", "lib.js", "canvas.js", "icons.js", "dashboard.js", "selection.js", "dashboard.css", "server.py", "i18n.js", "card.js", "card.css", "navicon.css", "icon-filled.svg"):
            self.assertTrue(os.path.isfile(os.path.join(HERE, name)), name)

    def test_description_is_english_and_russian_is_in_i18n(self):
        m = json.loads(read("hub-plugin.json"))
        cyr = re.compile("[" + chr(0x400) + "-" + chr(0x4FF) + "]")   # Cyrillic block
        for key in ("description", "why"):
            self.assertFalse(cyr.search(m[key]), key)
            self.assertTrue(cyr.search(m["i18n"]["ru"][key]), key)

    def test_description_fits_the_catalog_limit(self):
        m = json.loads(read("hub-plugin.json"))
        self.assertLessEqual(len(m["description"]), 300)
        self.assertLessEqual(len(m["i18n"]["ru"]["description"]), 300)


@unittest.skipUnless(NODE, "node not found")
class Scripts(unittest.TestCase):
    def test_syntax(self):
        for name in ("main.js", "lib.js", "agent.js", "canvas.js", "icons.js", "dashboard.js", "selection.js", "i18n.js", "card.js"):
            r = subprocess.run([NODE, "--check", os.path.join(HERE, name)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, name + r.stderr)

    def test_lib(self):
        r = subprocess.run([NODE, "--test", os.path.join(HERE, "tests", "lib.test.mjs")], capture_output=True, text=True, cwd=HERE)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_dashboard(self):
        r = subprocess.run([NODE, "--test", os.path.join(HERE, "tests", "dashboard.test.mjs")], capture_output=True, text=True, cwd=HERE)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_dashboard_opens_at_start(self):
        # the start screen is the dashboard: on entering the view (home: true), while no design is open and after a click on the logo; a new file is words in the chat
        main = read("main.js")
        self.assertIn("home: true", main)                                   # on page load: the dashboard, not the canvas
        self.assertIn("const home = () => P.home || !P.frames.length;", main)
        self.assertIn('hub.addStyle("dashboard.css")', main)
        self.assertIn("if (home()) return withStyle(withSave(newDesignPrefix() + text));", main)  # wrote on the dashboard: a new design from the instructions
        self.assertIn("if (home()) P.openNew", main)                        # and it opens on the canvas once the file appears
        self.assertIn("P.home = false;", main)                              # a click on a file or a new design closes the dashboard
        self.assertIn("function startPreset(p)", main)                      # preset: the view's specialist and a stub in the input
        self.assertIn("ui.input.focus()", main)
        self.assertIn("function dropStub()", main)                          # an untouched stub does not go into the design's chat
        self.assertIn("hd-home", main)                                      # back to the dashboard: the logo
        dash = read("dashboard.js")
        self.assertIn("IntersectionObserver", dash)                         # previews load only near the screen
        self.assertIn("SHOTS_AT_ONCE", dash)                                # and no more than a handful at once
        self.assertIn("!S.list", dash)                                      # no previews in the list
        css = read("dashboard.css")
        self.assertIn(".hdd{position:absolute;inset:0", css)                # over the canvas, not instead of it

    def test_composer_button_and_sidebar_contract(self):
        # the palette button in the input (the composer.tools slot) and the hide-sidebar contract: hide on entering the view, bring back on leaving
        main = read("main.js")
        self.assertIn('hub.addSlot("composer.tools"', main)
        self.assertIn("hub-sidebar", main)
        self.assertIn('by: "hub-design"', main)
        self.assertIn("show() { P.shown = true; sidebar(true);", main)
        self.assertIn("hide() { P.shown = false; P.openFrom = null; sidebar(false);", main)
        self.assertIn("html.hs-hidden .hd-top", read("style.css"))

    def test_recipient_follows_design_not_session(self):
        # the recipient and the chat are the design's specialist (author or designer), not the palette's session and not "the last one in the browser"
        main = read("main.js")
        self.assertNotIn('"last", JSON.stringify({ session', main)   # the recipient is not kept between openings
        self.assertNotIn("P.session = h.session", main)             # carrying over from a chat does not change the recipient
        self.assertIn("setSession(wanted())", main)                 # follows the open design
        self.assertIn("sendOne(", main)                             # "Send" in the comment window goes straight to the author
        self.assertIn("/api/inject", main)                          # "Send now", as in the hub chat
        self.assertIn("close()", main)                              # the close button
        self.assertEqual(main.count("|| DEFAULT_SESSION;"), 1)       # no author: not silently "designer", the owner picks; "designer" by default only on the start screen (a new file)
        self.assertIn("if (home()) return P.homeWho || (P.preset && P.preset.to) || DEFAULT_SESSION;", main)
        self.assertIn("/api/history", main)                         # the design's Write behind the feed tail is looked up in the history
        self.assertIn("frame.h !== windowHeight(frame.w)", main)    # the frame does not stretch to the document (the design's 100vh)
        self.assertLess(main.index("const recipient = "), main.index("const app = {"))   # app reads recipient at module load (0.4.1 without a view)
        canvas = read("canvas.js")
        self.assertIn("app.close()", canvas)
        self.assertNotIn('"Comment", null', canvas)                 # there is no "Comment" (to the batch) button in the window any more
        self.assertIn(".hd-card .bar{flex-wrap:nowrap", read("style.css"))   # the input in a narrow column is one line

    def test_gaps_051(self):
        # 0.5.1: the design author comes from events (no 20 s delay), the file is in place (mark and message), "Remove" from the queue comes with "Undo"
        main = read("main.js")
        self.assertNotIn("20000", main)                                  # no time delay
        self.assertNotIn("setInterval", main)
        self.assertIn("dueSessions(", main)                              # the feed is re-read when its edit number grows
        self.assertIn("timelineQuery(", main)                            # and only the changed rows
        self.assertIn("/__canvas/have", main)                            # whether the file exists is asked of the plugin process
        self.assertIn("async function openChecked(", main)               # open on the canvas after a check, not an empty frame
        self.assertIn("cancels.start(P.session, it)", main)              # "Remove" is deferred
        self.assertIn('tr("q_undo")', main)
        self.assertNotIn('hub.post("/api/queue/cancel"', main)           # no direct cancel without a chance to change one's mind
        canvas = read("canvas.js")
        self.assertIn('"to_dash"', canvas)                               # a frame without a file: a way out to the dashboard
        self.assertIn("goneText(", canvas)
        dash = read("dashboard.js")
        self.assertIn("!isGone(app.fileState(f.path))", dash)            # a design without a file is not listed
        self.assertIn("isGone(app.fileState(c.path))", dash)             # and its preview is not loaded
        self.assertNotIn("hdd-ghost", dash)

    def test_exit_and_close_052(self):
        # 0.5.2: the close button is its own island and closes the design; "Exit Hub Design" is bottom right, a way out to the specialist's chat
        canvas = read("canvas.js")
        self.assertIn('el("div", "hdc-card hdc-x")', canvas)
        self.assertIn("xIsland.append(closeB)", canvas)
        self.assertNotIn("top.append(playTop, panel, zoomB, closeB)", canvas)
        main = read("main.js")
        self.assertIn('"Exit Hub Design"', main)
        self.assertIn("exitTarget(P.session", main)
        self.assertIn("removeFrame(path, true)", main)                   # closing a design does not erase the comment drafts
        self.assertIn(".hd-exit{position:absolute;right:var(--space-3);bottom:var(--space-3)", read("style.css"))

    def test_needed_specialists_060(self):
        # 0.6.0: the needed specialists are not in the hub: an "Install" banner (a request to the hub from the owner), wait by the snapshot, a quiet line for animator
        self.assertIn("export const NEEDED", read("lib.js"))             # the list is one place
        main = read("main.js")
        self.assertIn("async function install(name)", main)
        self.assertIn("text: installText(name)", main)                   # "Install the specialist for Hub Design: specialists install <name>"
        self.assertIn("action: true", main)                              # a page button, not an answer to a card
        self.assertIn("lacking(", main)                                  # who is missing is counted from the snapshot, no polling timer
        self.assertIn("ui.need.paint(", main)                            # a chat without a specialist: the same banner
        dash = read("dashboard.js")
        self.assertIn("export function createNeed(", dash)
        self.assertIn('asked: "Request sent to the hub, waiting"', dash)
        self.assertIn('no_specialist: "no specialist {name}"', dash)     # animator: a line by the preset, not a banner
        self.assertIn("Hub Design installs the designer specialist from the specialists catalog (a button on the start screen)", read("README.md"))

    def test_ui_language_is_read_at_use_time(self):
        # the language comes from hub.lang when a text is drawn (never at load), and the page scripts all go through i18n.js
        main = read("main.js")
        self.assertIn("setLangSource(() => hub.lang)", main)
        self.assertIn("lang: currentLang()", main)                       # the injected agent follows the hub language too
        for name in ("main.js", "lib.js", "canvas.js", "dashboard.js"):
            self.assertIn('from "./i18n.js"', read(name), name)


if __name__ == "__main__":
    unittest.main()
