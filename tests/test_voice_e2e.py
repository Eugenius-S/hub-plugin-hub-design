"""Space in Hub Design must not start the hub's voice recording (hold Space with an empty field, recorder.js).
The hand tool and a typed space are Space too; voice is the microphone button only."""
import os, sys, time, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_edit_e2e as base

# getUserMedia is what a recording starts with: count the calls and refuse them
GUM = "(()=>{window.__gum=0;navigator.mediaDevices.getUserMedia=()=>{window.__gum++;return Promise.reject(new DOMException('x','NotAllowedError'))};return 1})()"


@unittest.skipUnless(base.CORE and base.CHROME and os.path.exists(base.CHROME), "needs core+chrome")
class SpaceIsNotVoice(base.EditByHand):
    def setUp(self):
        from unittest import mock
        p = mock.patch.dict(os.environ, {"VOICE_CMD": "true"})   # the voice button and push-to-talk exist only when the hub has a voice command
        p.start()
        self.addCleanup(p.stop)
        super().setUp()
        self.js(GUM)

    def js(self, e):
        return self.page({"eval": e})[0].get("eval")

    def gum(self):
        return self.js("window.__gum")

    def test_holding_space_on_the_canvas_is_the_hand_and_not_a_recording(self):
        self.js("document.activeElement.blur()||1")
        self.node("keys.mjs", "down", " ")
        time.sleep(0.8)                                    # longer than the hub's hold time
        held = (self.js("document.querySelector('.hdc').dataset.grab"), self.gum(), self.js("!!document.querySelector('form.rec')"))
        self.node("keys.mjs", "up", " ")
        time.sleep(0.4)
        self.assertEqual(held, ("grab", 0, False))
        self.assertFalse(self.js("document.querySelector('.hdc').dataset.grab"))

    def test_holding_space_in_the_chat_field_types_spaces_and_does_not_record(self):
        self.js("document.querySelector('textarea').focus()||1")
        self.node("keys.mjs", "down", " ")
        time.sleep(0.8)
        self.node("keys.mjs", "up", " ")
        time.sleep(0.4)
        self.assertEqual(self.gum(), 0)
        self.assertFalse(self.js("!!document.querySelector('form.rec')"))

    def test_a_comment_with_spaces_is_placed_whole(self):
        self.js("document.querySelector('.hdc-tool[data-tool=comment]').click()||1")
        time.sleep(0.3)
        self.click("#t")
        time.sleep(0.5)
        for w in ("раз", "два", "три"):
            self.type(w)
            self.key(" ")
            time.sleep(0.2)
        time.sleep(1)                                      # the hold time passes with the field not empty and the focus in it
        self.key("Enter")
        time.sleep(1)
        self.assertEqual(self.gum(), 0)
        self.assertEqual(self.js("JSON.stringify(window.__hubDesign().pins.map(p=>p.text))"), '["раз два три"]')


for _n in dir(base.EditByHand):                            # the inherited tests are not repeated here
    if _n.startswith("test_") and _n not in vars(SpaceIsNotVoice):
        setattr(SpaceIsNotVoice, _n, None)
if __name__ == "__main__":
    unittest.main()
