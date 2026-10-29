import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the palette button in the input is a one-color mask icon: no animation sheet of ours", () => {
  const main = rd("main.js");
  const slot = main.slice(main.indexOf('hub.addSlot("composer.tools"'), main.indexOf("const PALETTE ="));
  assert.match(slot, /hd-palette/);
  assert.match(slot, /<span class="hd-pi" aria-hidden="true"><\/span>/);
  assert.ok(!/PALETTE/.test(slot), "no inline svg in the button: the mask draws the icon");
  assert.doesNotMatch(main, /navicon/);
  assert.ok(!existsSync(new URL("../navicon.css", import.meta.url)));
});

test("the icon is drawn by a currentColor mask and nothing else: no layers, gradients, sweep or scale on hover", () => {
  const css = rd("style.css");
  const i = css.indexOf(".hd-palette .hd-pi{");
  assert.ok(i > 0);
  const rule = css.slice(i, css.indexOf("}", i));
  assert.match(rule, /background:currentColor/);
  assert.match(rule, /mask:url\("icon\.svg"\)/);
  assert.doesNotMatch(css, /\.hd-pi:?:(before|after)|hdi-sweep|\.hd-palette:(is\()?:?hover/);
  assert.match(rd("icon.svg"), /viewBox="0 0 24 24"/);
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
