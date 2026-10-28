import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the palette button in the input is an empty mask span, so navicon.css can animate it", () => {
  const main = rd("main.js");
  const slot = main.slice(main.indexOf('hub.addSlot("composer.tools"'), main.indexOf("const PALETTE ="));
  assert.match(slot, /hd-palette/);
  assert.match(slot, /<span class="hd-pi" aria-hidden="true"><\/span>/);
  assert.ok(!/PALETTE/.test(slot), "no inline svg in the button: the mask layers draw the icon");
  assert.match(main, /hub\.addStyle\("navicon\.css"\)/);
});

test("navicon.css: the outline/filled layers and the gradient sweep cover the palette button only, not the menu icon; reduced motion is static", () => {
  const css = rd("navicon.css");
  assert.match(css, /\.hd-palette \.hd-pi/);
  assert.doesNotMatch(css, /\.srow|\.ext-icon/);   // the menu icon hovers like every other item
  assert.match(css, /\.hd-palette:is\(:hover, :focus-visible\)/);
  assert.match(css, /icon-filled\.svg/);
  const rm = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(rm, /animation: none/);
  assert.match(rm, /transform: none/);
});

test("the Style button is a wide secondary .btn under the input window and shows the chosen style's name", () => {
  const main = rd("main.js");
  assert.match(main, /button\("btn hd-style"/);
  assert.match(main, /button\("hd-style-x", "×", ts\("detach"\), \(\) => attachStyle\(null\)\)/);   // the x on the button detaches the style
  assert.match(main, /setHidden\(ui\.styleBtn\.lastChild, !P\.style\)/);
  assert.ok(!/text: ts\("chip"/.test(main), "no chip above the input: the name is on the button");
  assert.match(main, /left\.append\(top, tabs, chat, list, card, styleBtn\)/);
  assert.match(main, /foot\.append\(icon\("gear"\), who\);/);
  assert.match(main, /P\.style \? ts\("chip", \{ name: P\.style\.name \}\) : def \? ts\("def_chip", \{ name: def\.name \}\) : ts\("btn"\)/);   // the default style shows on the button when no other is chosen
  assert.match(rd("styles.css"), /\.hd \.hd-style\{display:flex/);
});
