"""Hub Design in a real headless Chrome: the buttons of the canvas (the tool buttons of the toolbar, "Send" of the comment editor) press with the mouse
and with the keyboard in every state the hand (Space) leaves behind. Needs the hub code on PYTHONPATH and a Chrome; skipped without them."""
import os, sys, time, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_edit_e2e as base

TOOL = "document.querySelector('.hdc').dataset.tool"
BTN = "document.querySelector('.hdc-tool[data-tool=%s]')"


@unittest.skipUnless(base.CORE and base.CHROME and os.path.exists(base.CHROME), "needs the hub code on PYTHONPATH and Chrome")
class Buttons(base.EditByHand):
    def js(self, e):
        return self.page({"eval": e})[0].get("eval")

    def real_click(self, expr):
        x, y = self.js(f"(()=>{{const r=({expr}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()")
        self.mouse("move", x, y); self.mouse("down", x, y); self.mouse("up", x, y)
        time.sleep(0.4)

    def test_the_comment_tool_button_takes_a_mouse_click(self):
        self.real_click(BTN % "comment")
        self.assertEqual(self.js(TOOL), "comment")

    def test_the_comment_tool_button_takes_a_click_after_a_pan_with_space(self):
        self.js("document.activeElement.blur()||1")
        self.node("keys.mjs", "down", " "); time.sleep(0.3)
        self.assertEqual(self.js("document.querySelector('.hdc').dataset.grab"), "grab")
        self.node("keys.mjs", "up", " "); time.sleep(0.3)
        self.real_click(BTN % "comment")
        self.assertEqual(self.js(TOOL), "comment")

    def test_space_on_a_focused_tool_button_presses_it(self):
        self.js(BTN % "comment" + ".focus()||1")
        self.key(" ")
        time.sleep(0.4)
        self.assertEqual(self.js(TOOL), "comment", "Space on the focused button is its press; the hand took the key")
        self.assertEqual(self.js("document.querySelector('.hdc').dataset.grab"), "")

    def test_space_after_a_mouse_click_on_a_button_is_still_the_hand(self):
        self.real_click(BTN % "comment")
        self.node("keys.mjs", "down", " "); time.sleep(0.3)
        grab = self.js("document.querySelector('.hdc').dataset.grab")
        self.node("keys.mjs", "up", " "); time.sleep(0.3)
        self.assertEqual(grab, "grab", "the button kept the focus after the click and Space went to it, not to the hand")
        self.assertEqual(self.js(TOOL), "comment")

    def test_space_on_a_focused_send_button_sends(self):
        self.real_click(BTN % "comment")
        self.click("#t")
        time.sleep(0.5)
        self.type("fix the title")
        self.js("document.querySelector('.hdc-eb.go').focus()||1")
        self.key(" ")
        time.sleep(1)
        self.assertEqual(self.js("JSON.stringify(window.__hubDesign().pins.map(p=>p.text))"), '["fix the title"]')
        self.assertFalse(self.js("!!document.querySelector('.hdc-ed')"), "Space on the focused Send did not send")

    def test_the_send_button_of_the_editor_takes_a_mouse_click(self):
        self.real_click(BTN % "comment")
        self.click("#t")
        time.sleep(0.5)
        self.assertTrue(self.js("!!document.querySelector('.hdc-ed')"), "no editor")
        self.type("fix the title")
        self.real_click("document.querySelector('.hdc-eb.go')")
        time.sleep(1)
        self.assertFalse(self.js("!!document.querySelector('.hdc-ed')"), "the editor is still open")
        self.assertEqual(self.js("JSON.stringify(window.__hubDesign().pins.map(p=>p.text))"), '["fix the title"]')


for _n in dir(base.EditByHand):
    if _n.startswith("test_"):
        setattr(Buttons, _n, None) if _n not in vars(Buttons) else None

if __name__ == "__main__":
    unittest.main()
