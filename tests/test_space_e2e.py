"""Hub Design in a real headless Chrome: the hand (Space held, the pan mode of the canvas) must not stay on when the key-up never reaches the canvas:
Ctrl/Cmd+Space (the OS takes the layout switch and Spotlight, no key-up comes), a key-up while an input has the focus, a window that lost the focus or
went to the background, the focus lost inside a frame of the design. Any tool picked on the toolbar is on at once. Needs the hub code on PYTHONPATH and a
Chrome; skipped without them."""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_edit_e2e as base

GRAB = "document.querySelector('.hdc').dataset.grab"
TOOL = "document.querySelector('.hdc').dataset.tool"
KEY = "window.dispatchEvent(new KeyboardEvent(%r,{key:' ',code:'Space',bubbles:true,cancelable:true%s})) || 1"


@unittest.skipUnless(base.CORE and base.CHROME and os.path.exists(base.CHROME), "needs the hub code on PYTHONPATH and Chrome")
class Hand(base.EditByHand):
    def js(self, expr):
        return self.page({"eval": expr})[0].get("eval")

    def space(self, down, mods=""):
        self.js(KEY % ("keydown" if down else "keyup", mods))

    def test_space_held_is_the_hand_and_released_by_its_key_up(self):
        self.space(True)
        self.assertEqual(self.js(GRAB), "grab")
        self.space(False)
        self.assertEqual(self.js(GRAB), "")

    def test_ctrl_or_cmd_space_is_the_os_shortcut_not_the_hand(self):
        self.space(True, ",ctrlKey:true")
        self.assertEqual(self.js(GRAB), "", "Ctrl+Space (the layout switch) turned the hand on, its key-up never comes")
        self.space(True, ",metaKey:true")
        self.assertEqual(self.js(GRAB), "", "Cmd+Space (Spotlight) turned the hand on")

    def test_key_up_in_an_input_still_releases_the_hand(self):
        self.space(True)
        self.js("(()=>{const i=document.createElement('input');i.id='tmp-in';document.body.append(i);i.focus();"
                "i.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true}))})() || 1")
        self.assertEqual(self.js(GRAB), "", "the key-up went to an input and was dropped: the hand stuck")

    def test_window_blur_and_going_to_the_background_release_the_hand(self):
        self.space(True)
        self.js("window.dispatchEvent(new Event('blur')) || 1")
        self.assertEqual(self.js(GRAB), "")
        self.space(True)
        self.js("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange')) || 1")
        self.assertEqual(self.js(GRAB), "", "the tab went to the background with Space held: the hand stuck")
        self.js("delete document.hidden; 1")

    def test_a_tool_picked_on_the_toolbar_turns_the_hand_off(self):
        self.space(True)
        self.js("document.querySelector('.hdc-tool[data-tool=text]').click() || 1")
        time.sleep(0.3)
        self.assertEqual(self.js(TOOL), "text")
        self.assertEqual(self.js(GRAB), "", "the text tool is on but the canvas is still the hand")
        self.assertEqual(self.js("document.querySelector('.hdc').dataset.capture"), "")

    def test_focus_lost_inside_a_frame_releases_the_hand(self):
        # the space goes from the frame to the canvas (agent.js); the frame loses the focus (another window, Cmd+Tab): no key-up
        self.assertTrue(self.frames("(()=>{if(window===top)return null;window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));return 1})()"))
        time.sleep(0.4)
        self.assertEqual(self.js(GRAB), "grab", "the space of the frame did not reach the canvas")
        self.frames("(()=>{if(window===top)return null;window.dispatchEvent(new Event('blur'));return 1})()")
        time.sleep(0.4)
        self.assertEqual(self.js(GRAB), "", "the frame lost the focus with Space held: the hand stuck")

    def test_switching_tools_by_key_and_by_click_moves_nothing(self):
        geo = "(()=>{const r=document.querySelector('.hdc-iframe').getBoundingClientRect();const w=document.querySelector('.hdc-stage > *');return JSON.stringify([r.x,r.y,r.width,r.height,getComputedStyle(w).transform])})()"
        before = self.js(geo)
        for tool in ("hand", "text", "comment", "select"):
            self.js(f"document.querySelector('.hdc-tool[data-tool={tool}]').click() || 1")
            time.sleep(0.25)
            self.assertEqual(self.js(TOOL), tool)
            self.assertEqual(self.js(GRAB), "grab" if tool == "hand" else "", tool)
            self.assertEqual(self.js(geo), before, f"the frame or the canvas moved on {tool}")
        for k, tool in (("t", "text"), ("h", "hand"), ("v", "select"), ("c", "comment")):
            self.key(k)
            time.sleep(0.25)
            self.assertEqual(self.js(TOOL), tool)
            self.assertEqual(self.js(geo), before, f"the frame or the canvas moved on the key {k}")

    def test_hover_and_mode_changes_do_not_resize_the_frame(self):
        h = "Math.round(document.querySelector('.hdc-iframe').offsetHeight)+'x'+Math.round(document.querySelector('.hdc-iframe').offsetWidth)"
        seen = {self.js(h)}
        for tool in ("select", "text", "comment", "select"):
            self.js(f"document.querySelector('.hdc-tool[data-tool={tool}]').click() || 1")
            for sel in ("#t", "#r", "#cover"):
                x, y = self.centre(sel)
                self.mouse("move", x, y)
                for _ in range(4):
                    time.sleep(0.15)
                    seen.add(self.js(h))
        self.assertEqual(len(seen), 1, f"the frame changed its size while hovering and changing tools: {seen}")


for _n in dir(base.EditByHand):      # the inherited tests are not ours to run again
    if _n.startswith("test_"):
        setattr(Hand, _n, None) if _n not in vars(Hand) else None

if __name__ == "__main__":
    unittest.main()
